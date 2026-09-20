// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import Big from "big.js";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionMarketCloseModal } from "@/components/trade/positions/position-market-close-modal";
import type { PositionCloseSizingIntent } from "@/domain/trade/position-market-close";
import {
	formatPositionSubmitFeedback,
	localizedPositionSubmitFeedback,
	type PositionSubmitFeedbackCode,
} from "@/lib/trade/position-submit-feedback";
import {
	getPositionMarketCloseActions,
	getPositionMarketCloseModal,
	type PositionMarketCloseRef,
} from "@/stores/use-global-modal-store";
import { getPendingOrderActions } from "@/stores/use-pending-order-store";
import { getPendingTwapActions } from "@/stores/use-pending-twap-store";
import { createI18nRoot } from "./harness/react";

const USER = "0x1111111111111111111111111111111111111111" as const;
const COIN = "xyz:CXMT";
const ASSET_ID = 120_031;

interface OrderParams {
	grouping: "na" | "normalTpsl" | "positionTpsl";
	orders: Array<{ a: number; b: boolean; p: string; s: string; r: boolean; t: { limit: { tif: string } } }>;
}

const mocks = vi.hoisted(() => ({
	liveSize: "2.500",
	restSize: "2.500",
	clearinghouseState: vi.fn(),
	metaAndAssetCtxs: vi.fn(),
	mutateOrder: vi.fn(),
	executeOrder: vi.fn(),
	executionGuard: undefined as ((params: unknown) => void) | undefined,
	guardCalls: 0,
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	toastWarning: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: { error: mocks.toastError, success: mocks.toastSuccess, warning: mocks.toastWarning },
}));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/use-global-settings-store")>();
	return { ...actual, getResolvedFormatLocale: () => "en-US", useMarketOrderSlippageBpsString: () => "50" };
});

vi.mock("@/stores/use-hip3-disclaimer-store", () => ({
	hasAcceptedHip3Disclaimer: () => true,
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => false,
}));

vi.mock("@/lib/hyperliquid", () => ({
	parseAssetId: (assetId: number) => {
		const adjusted = assetId - 100_000;
		return { kind: "builderPerp", dexIndex: Math.floor(adjusted / 10_000), index: adjusted % 10_000 };
	},
	useExchange: (_method: string, options?: { executionGuard?: (params: unknown) => void }) => {
		mocks.executionGuard = options?.executionGuard;
		return { mutateAsync: mocks.mutateOrder, isPending: false, error: null, reset: vi.fn() };
	},
	useHyperliquid: () => ({
		clientKey: "0x1111111111111111111111111111111111111111",
		env: "Mainnet",
		info: { clearinghouseState: mocks.clearinghouseState, metaAndAssetCtxs: mocks.metaAndAssetCtxs },
	}),
	useMarkets: () => ({
		isLoading: false,
		error: null,
		getMarket: () => ({
			kind: "builderPerp",
			name: "xyz:CXMT",
			assetId: 120_031,
			szDecimals: 3,
			dex: "xyz",
			ctxIndex: 31,
			dexIndex: 2,
		}),
	}),
	useMarketsInfo: () => ({ getMarketInfo: () => ({ markPx: "100", shortName: "CXMT" }) }),
	useSubscription: () => ({ status: "active", isStale: false, data: { states: [] } }),
	useUserPositions: () => ({
		isLoading: false,
		hasError: false,
		isStale: false,
		getPosition: () => ({
			coin: "xyz:CXMT",
			dex: "xyz",
			szi: mocks.liveSize,
			entryPx: "90",
			unrealizedPnl: "25",
			leverage: { type: "isolated", value: 10 },
		}),
	}),
}));

vi.mock("@gatu/ui", () => {
	const passthrough =
		(tag: string) =>
		({ children, divider: _divider, ...props }: { children?: ReactNode; divider?: boolean }) =>
			createElement(tag, props, children);
	return {
		AdaptiveModal: ({ children }: { children: ReactNode }) => createElement("div", null, children),
		Button: ({ children, variant: _v, intent: _i, size: _s, ...props }: Record<string, unknown>) =>
			createElement("button", { type: "button", ...props }, children as ReactNode),
		Checkbox: ({ label }: { label: ReactNode }) => createElement("label", null, label),
		ModalContent: passthrough("div"),
		ModalDescription: passthrough("p"),
		ModalFooter: passthrough("footer"),
		ModalHeader: passthrough("header"),
		ModalTitle: passthrough("h2"),
	};
});

vi.mock("@/components/ui/number-input", () => ({
	NumberInput: (props: Record<string, unknown>) =>
		createElement("input", {
			"aria-label": props["aria-label"],
			value: String(props.value ?? ""),
			disabled: Boolean(props.disabled),
			onChange: props.onChange,
			onBlur: props.onBlur,
		}),
}));

vi.mock("@/components/trade/components/trade-size-slider", () => ({
	TradeSizeSlider: () => null,
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: (props: { children: ReactNode; onClick: () => void; disabled?: boolean }) =>
		createElement(
			"button",
			{ type: "button", "data-testid": "submit", disabled: Boolean(props.disabled), onClick: props.onClick },
			props.children,
		),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const positionRef: PositionMarketCloseRef = {
	coin: COIN,
	dex: "xyz",
	assetId: ASSET_ID,
	szDecimals: 3,
	signedPositionSize: "2.500",
	markPx: "90",
	marginMode: "isolated",
};

function localizedMessage(code: PositionSubmitFeedbackCode): string {
	return formatPositionSubmitFeedback(localizedPositionSubmitFeedback(code), (descriptor) => i18n._(descriptor));
}

function createGate() {
	let release!: () => void;
	let markEntered!: () => void;
	const opened = new Promise<void>((resolve) => {
		release = resolve;
	});
	const entered = new Promise<void>((resolve) => {
		markEntered = resolve;
	});
	return {
		entered,
		release,
		wait: async () => {
			markEntered();
			await opened;
		},
	};
}

describe("market close: the size shown at the click bounds the size that is sent", () => {
	let container: HTMLDivElement;
	let root: Root;

	function renderDialog() {
		act(() => root.render(createElement(PositionMarketCloseModal)));
	}

	function getShownCloseSize(): string {
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Close size"]');
		if (!input) throw new Error("Expected the close size input");
		return input.value;
	}

	function getSubmitButton(): HTMLButtonElement {
		const button = container.querySelector<HTMLButtonElement>('[data-testid="submit"]');
		if (!button) throw new Error("Expected the confirm button");
		return button;
	}

	function getSentSizes(): string[] {
		return mocks.executeOrder.mock.calls.map((call) => (call[0] as OrderParams).orders[0]?.s ?? "");
	}

	function openDialog(intent: PositionCloseSizingIntent): string {
		let sessionId: string | null = null;
		act(() => {
			sessionId = getPositionMarketCloseActions().open(positionRef, { owner: USER, env: "Mainnet" });
		});
		if (!sessionId) throw new Error("Expected market close session");
		const openedSessionId: string = sessionId;
		act(() => getPositionMarketCloseActions().setSizingIntent(openedSessionId, intent));
		renderDialog();
		return openedSessionId;
	}

	async function confirmThenMovePosition(nextSize: string): Promise<void> {
		const freshPosition = createGate();
		const respond = mocks.clearinghouseState.getMockImplementation();
		mocks.clearinghouseState.mockImplementation(async (...args: unknown[]) => {
			await freshPosition.wait();
			return respond?.(...args);
		});

		await act(async () => {
			getSubmitButton().click();
			await freshPosition.entered;
		});
		expect(getPositionMarketCloseModal()).toMatchObject({ presentation: "dismissed", phase: "validating" });

		mocks.liveSize = nextSize;
		mocks.restSize = nextSize;
		renderDialog();

		await act(async () => {
			freshPosition.release();
			await Promise.resolve();
		});
		await act(async () => {
			await vi.waitFor(() => expect(getPositionMarketCloseModal()).toBeNull());
		});
	}

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		window.localStorage.clear();
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
		mocks.liveSize = "2.500";
		mocks.restSize = "2.500";
		mocks.guardCalls = 0;
		mocks.executionGuard = undefined;
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: {
				request: async (name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown) =>
					callback({ name, mode: "exclusive" } as Lock),
			} as unknown as LockManager,
		});
		mocks.clearinghouseState.mockReset().mockImplementation(async () => ({
			assetPositions: [{ position: { coin: COIN, szi: mocks.restSize, leverage: { type: "isolated", value: 10 } } }],
		}));
		mocks.metaAndAssetCtxs.mockReset().mockImplementation(async () => {
			const universe = Array.from({ length: 32 }, (_, index) => ({
				name: index === 31 ? COIN : `OTHER-${index}`,
				szDecimals: 3,
			}));
			return [{ universe }, universe.map((_, index) => ({ markPx: index === 31 ? "100" : "1", midPx: null }))];
		});
		mocks.executeOrder.mockReset().mockImplementation(async (params: OrderParams) => ({
			status: "ok",
			response: {
				type: "order",
				data: { statuses: [{ filled: { totalSz: params.orders[0]?.s, avgPx: "99.5", oid: 1 } }] },
			},
		}));
		mocks.mutateOrder.mockReset().mockImplementation(async (params: OrderParams) => {
			mocks.guardCalls += 1;
			mocks.executionGuard?.(params);
			mocks.guardCalls += 1;
			mocks.executionGuard?.(params);
			return mocks.executeOrder(params);
		});
		mocks.toastSuccess.mockReset();
		mocks.toastError.mockReset();
		mocks.toastWarning.mockReset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		const session = getPositionMarketCloseModal();
		if (session) {
			getPositionMarketCloseActions().updatePhase(session.sessionId, "idle");
			getPositionMarketCloseActions().close(session.sessionId);
		}
	});

	it.each([
		{ label: "Max", intent: { kind: "max" } as const, shown: "2.500" },
		{ label: "50%", intent: { kind: "percent", value: "50" } as const, shown: "1.250" },
	])("sends nothing when a $label close outgrows the size shown at the click", async ({ intent, shown }) => {
		openDialog(intent);
		expect(getSubmitButton().textContent).toBe("Market Close");
		expect(getShownCloseSize()).toBe(shown);

		await confirmThenMovePosition("2.600");

		expect(mocks.mutateOrder).not.toHaveBeenCalled();
		expect(getSentSizes()).toEqual([]);
		expect(mocks.toastError).toHaveBeenCalledTimes(1);
		expect(mocks.toastError).toHaveBeenLastCalledWith(localizedMessage("close-size-exceeds-confirmed"));
	});

	it.each([
		{ label: "Max after the position shrinks", intent: { kind: "max" } as const, nextSize: "2.400", sent: "2.4" },
		{
			label: "50% after the position shrinks",
			intent: { kind: "percent", value: "50" } as const,
			nextSize: "2.400",
			sent: "1.2",
		},
		{
			label: "a manual size after the position grows",
			intent: { kind: "size", value: "1.100" } as const,
			nextSize: "2.600",
			sent: "1.1",
		},
		{
			label: "a manual size after the position shrinks",
			intent: { kind: "size", value: "1.100" } as const,
			nextSize: "2.400",
			sent: "1.1",
		},
		{ label: "Max on an unchanged position", intent: { kind: "max" } as const, nextSize: "2.500", sent: "2.5" },
	])("sends $label exactly once and never above the size shown", async ({ intent, nextSize, sent }) => {
		openDialog(intent);
		const shown = getShownCloseSize();

		await confirmThenMovePosition(nextSize);

		expect(mocks.guardCalls).toBe(2);
		expect(getSentSizes()).toEqual([sent]);
		expect(Big(sent).lte(Big(shown))).toBe(true);
		expect(mocks.toastError).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
	});

	it("confirms the repriced size when the live position moved before the click", async () => {
		openDialog({ kind: "max" });
		expect(getShownCloseSize()).toBe("2.500");

		mocks.liveSize = "2.600";
		mocks.restSize = "2.600";
		renderDialog();
		expect(getShownCloseSize()).toBe("2.600");
		expect(getSubmitButton().textContent).toBe("Market Close");
		expect(container.querySelector('[data-testid="position-market-close-size-changed"]')).not.toBeNull();

		await confirmThenMovePosition("2.600");

		expect(getSentSizes()).toEqual(["2.6"]);
		expect(mocks.toastError).not.toHaveBeenCalled();
	});
});
