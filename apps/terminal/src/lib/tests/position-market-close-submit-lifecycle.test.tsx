// @vitest-environment jsdom

import { useTradingGuard } from "@gatu/hl-react/hooks/useTradingGuard";
import { i18n } from "@lingui/core";
import { act, createElement, Fragment, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionMarketCloseSubmitHost } from "@/components/trade/components/position-market-close-submit-host";
import { PositionMarketCloseModal } from "@/components/trade/positions/position-market-close-modal";
import type { PositionCloseSizingIntent } from "@/domain/trade/position-market-close";
import {
	POSITION_MARKET_CLOSE_SUBMITTER_WAIT_MS,
	submitPositionMarketClose,
} from "@/lib/trade/position-market-close-submitter";
import {
	getPositionMarketCloseActions,
	getPositionMarketCloseModal,
	type PositionMarketCloseRef,
} from "@/stores/use-global-modal-store";
import { type OrderQueueItem, removeOrderQueueItem, useOrderQueue } from "@/stores/use-order-queue-store";
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
	mobile: false,
	restSize: "2.500",
	clearinghouseState: vi.fn(),
	metaAndAssetCtxs: vi.fn(),
	mutateOrder: vi.fn(),
	executeOrder: vi.fn(),
	sliderProps: null as Record<string, unknown> | null,
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
	useIsMobile: () => mocks.mobile,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useTradingGuard,
	parseAssetId: (assetId: number) => {
		const adjusted = assetId - 100_000;
		return { kind: "builderPerp", dexIndex: Math.floor(adjusted / 10_000), index: adjusted % 10_000 };
	},
	useExchange: (_method: string, options?: { executionGuard?: (params: unknown) => void }) => {
		const executionGuard = options?.executionGuard;
		return {
			mutateAsync: (params: unknown) => mocks.mutateOrder(params, executionGuard),
			isPending: false,
			error: null,
			reset: vi.fn(),
		};
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
		AdaptiveModal: ({ children, presentation }: { children: ReactNode; presentation: string }) =>
			createElement("div", { key: presentation }, children),
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
	TradeSizeSlider: (props: Record<string, unknown>) => {
		mocks.sliderProps = props;
		return null;
	},
}));

vi.mock("@gatu/hl-react/provider", () => ({
	useHyperliquid: () => ({ clientKey: USER, env: "Mainnet", sessionMode: "wallet" }),
}));
vi.mock("../../../../../packages/hl-react/src/signing/use-trading-status", () => ({
	useTradingStatus: () => ({
		isSignerReady: true,
		isBuilderFeeReady: true,
		needsAgent: false,
		needsBuilderFee: false,
		isSignerLoading: false,
		isBuilderFeeLoading: false,
	}),
}));
vi.mock("@gatu/hl-react/signing/use-trading-authorization", () => ({
	useTradingAuthorization: () => ({ authorize: async () => {}, status: "idle", error: null }),
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

let queueItems: OrderQueueItem[] = [];
function QueueProbe() {
	queueItems = useOrderQueue();
	return null;
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

describe("market close submission lifecycle", () => {
	let container: HTMLDivElement;
	let root: Root;

	function render(withHost: boolean) {
		act(() =>
			root.render(
				createElement(
					Fragment,
					null,
					createElement(QueueProbe),
					createElement(PositionMarketCloseModal),
					withHost ? createElement(PositionMarketCloseSubmitHost) : null,
				),
			),
		);
	}

	function getSubmitButton(): HTMLButtonElement {
		const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(candidate) => candidate.textContent === "Market Close",
		);
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
		render(false);
		return openedSessionId;
	}

	function holdFreshPosition() {
		const freshPosition = createGate();
		const respond = mocks.clearinghouseState.getMockImplementation();
		mocks.clearinghouseState.mockImplementation(async (...args: unknown[]) => {
			await freshPosition.wait();
			return respond?.(...args);
		});
		return freshPosition;
	}

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		window.localStorage.clear();
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
		mocks.liveSize = "2.500";
		mocks.restSize = "2.500";
		mocks.mobile = false;
		mocks.sliderProps = null;
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
		mocks.mutateOrder
			.mockReset()
			.mockImplementation(async (params: OrderParams, executionGuard?: (params: unknown) => void) => {
				executionGuard?.(params);
				executionGuard?.(params);
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
		act(() => {
			for (const item of queueItems) removeOrderQueueItem(item.id);
		});
		act(() => root.unmount());
		container.remove();
		const session = getPositionMarketCloseModal();
		if (session) {
			getPositionMarketCloseActions().updatePhase(session.sessionId, "idle");
			getPositionMarketCloseActions().close(session.sessionId);
		}
	});

	it("seals the confirmation at the click even before the submit host has loaded", async () => {
		const sessionId = openDialog({ kind: "max" });

		act(() => getSubmitButton().click());

		expect(getPositionMarketCloseModal()).toMatchObject({ sessionId, phase: "validating", presentation: "dismissed" });
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Close size"]')?.disabled).toBe(true);
		expect(queueItems.filter((item) => item.id === `market-close:${sessionId}`)).toMatchObject([
			{ status: "pending", size: "2.5" },
		]);
		act(() => getPositionMarketCloseActions().setSizingIntent(sessionId, { kind: "size", value: "1" }));
		expect(getPositionMarketCloseModal()?.sizingIntent).toEqual({ kind: "max" });

		render(true);
		await act(async () => {
			await vi.waitFor(() => expect(mocks.executeOrder).toHaveBeenCalledOnce());
		});
		expect(getSentSizes()).toEqual(["2.5"]);
		expect(queueItems.find((item) => item.id === `market-close:${sessionId}`)).toMatchObject({ status: "success" });
	});

	it("ignores confirmations after the seal, including a remounted button, and fails closed when the host unmounts", async () => {
		const freshPosition = holdFreshPosition();
		const sessionId = openDialog({ kind: "max" });
		const firstButton = getSubmitButton();

		act(() => {
			firstButton.click();
			firstButton.click();
		});
		mocks.mobile = true;
		render(false);
		expect(getSubmitButton()).not.toBe(firstButton);
		expect(getSubmitButton().disabled).toBe(true);
		act(() => getSubmitButton().click());
		expect(queueItems.filter((item) => item.operation === "market-close")).toHaveLength(1);

		render(true);
		await act(async () => {
			await freshPosition.entered;
		});
		expect(getPositionMarketCloseModal()).toMatchObject({ sessionId, phase: "validating" });

		act(() => root.render(createElement(QueueProbe)));
		expect(getPositionMarketCloseModal()).toBeNull();
		await act(async () => {
			freshPosition.release();
		});

		expect(mocks.executeOrder).not.toHaveBeenCalled();
		expect(queueItems.filter((item) => item.id === `market-close:${sessionId}`)).toMatchObject([{ status: "failed" }]);
	});

	it("reuses one attempt for repeated submissions and still fails closed when the host unmounts", async () => {
		const freshPosition = holdFreshPosition();
		const sessionId = openDialog({ kind: "max" });

		let first: Promise<void> | undefined;
		let second: Promise<void> | undefined;
		act(() => {
			first = submitPositionMarketClose({ sessionId, confirmedCloseSize: "2.5" });
			second = submitPositionMarketClose({ sessionId, confirmedCloseSize: "2.5" });
		});
		expect(second).toBe(first);
		expect(queueItems.filter((item) => item.operation === "market-close")).toHaveLength(1);

		render(true);
		await act(async () => {
			await freshPosition.entered;
		});
		act(() => root.render(createElement(QueueProbe)));
		await act(async () => {
			freshPosition.release();
			await first;
		});

		expect(mocks.executeOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
	});

	it("reports a sealed confirmation as failed once when no host registers in time", async () => {
		vi.useFakeTimers();
		try {
			const sessionId = openDialog({ kind: "max" });

			act(() => getSubmitButton().click());
			expect(getPositionMarketCloseModal()).toMatchObject({ sessionId, phase: "validating" });
			await act(async () => {
				await vi.advanceTimersByTimeAsync(POSITION_MARKET_CLOSE_SUBMITTER_WAIT_MS);
			});

			expect(mocks.executeOrder).not.toHaveBeenCalled();
			expect(getPositionMarketCloseModal()).toBeNull();
			expect(queueItems.filter((item) => item.operation === "market-close")).toMatchObject([
				{
					id: `market-close:${sessionId}`,
					status: "failed",
					error: { kind: "localized", code: "failed-market-close" },
					children: [expect.objectContaining({ status: "rejected" })],
				},
			]);
		} finally {
			vi.useRealTimers();
		}
	});
});
