// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement, useSyncExternalStore } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalModals } from "@/components/trade/components/global-modals";
import { hasPositionMarketCloseSubmitter } from "@/lib/trade/position-market-close-submitter";
import {
	getPositionMarketCloseActions,
	getPositionMarketCloseModal,
	type PositionMarketCloseRef,
} from "@/stores/use-global-modal-store";
import { getOrderQueueItem, removeOrderQueueItem } from "@/stores/use-order-queue-store";
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

const mocks = vi.hoisted(() => {
	const legalListeners = new Set<() => void>();
	return {
		legalState: "accepted",
		legalListeners,
		subscribeLegal: (listener: () => void) => {
			legalListeners.add(listener);
			return () => legalListeners.delete(listener);
		},
		probeMounts: 0,
		probeUnmounts: 0,
		clearinghouseState: vi.fn(),
		metaAndAssetCtxs: vi.fn(),
		mutateOrder: vi.fn(),
		executeOrder: vi.fn(),
		lockRequest: vi.fn(),
	};
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/use-global-settings-store")>();
	return { ...actual, useMarketOrderSlippageBpsString: () => "50" };
});

vi.mock("@/stores/use-hip3-disclaimer-store", () => ({
	hasAcceptedHip3Disclaimer: () => true,
	useHasAcceptedHip3Disclaimer: () => true,
}));

vi.mock("@/hooks/trade/use-legal-gate", async () => {
	const { useSyncExternalStore: useExternalStore } = await import("react");
	return {
		useLegalGate: () => ({
			state: useExternalStore(mocks.subscribeLegal, () => mocks.legalState),
			identity: USER,
			accept: vi.fn(),
			acceptanceError: null,
			resetAcceptance: vi.fn(),
			retryStatus: vi.fn(),
		}),
	};
});

vi.mock("@/hooks/trade/use-hip3-disclaimer", () => ({
	useHip3DisclaimerRequirement: () => ({ isRequired: false, dex: undefined, documentationUrl: undefined }),
}));

vi.mock("@/hooks/trade/use-deposit-availability", () => ({ useDepositAvailability: () => ({ path: "external" }) }));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ walletAddress: USER, walletIntent: "external" }),
}));

vi.mock("@/components/trade/components/legal-acceptance-modal", async () => {
	const { createElement: h } = await import("react");
	return { LegalAcceptanceModal: () => h("div", { "data-testid": "LegalAcceptanceModal" }) };
});

vi.mock("@/components/trade/components/position-dialog-host-gate", () => ({ PositionDialogHostGate: () => null }));

vi.mock("@/components/trade/components/lazy-global-modals", async () => {
	const { createElement: h, useEffect } = await import("react");
	const { usePositionMarketCloseSession } = await import("@/stores/use-global-modal-store");
	const { submitPositionMarketClose } = await import("@/lib/trade/position-market-close-submitter");
	function PositionMarketCloseModal() {
		const session = usePositionMarketCloseSession();
		useEffect(() => {
			mocks.probeMounts += 1;
			return () => {
				mocks.probeUnmounts += 1;
			};
		}, []);
		return h("button", {
			type: "button",
			"data-testid": "confirm-market-close",
			onClick: () => {
				if (session) void submitPositionMarketClose({ sessionId: session.sessionId, confirmedCloseSize: "2.5" });
			},
		});
	}
	const Stub = () => null;
	return {
		CommandMenu: Stub,
		DepositModal: Stub,
		GlobalSettingsModal: Stub,
		PositionMarketCloseModal,
		SendModal: Stub,
		SpotSwapModal: Stub,
		TransferModal: Stub,
		useIdleGlobalModalPreload: () => {},
	};
});

const MARKET = {
	kind: "builderPerp",
	name: COIN,
	assetId: ASSET_ID,
	szDecimals: 3,
	dex: "xyz",
	ctxIndex: 31,
	dexIndex: 2,
};

vi.mock("@/lib/hyperliquid", () => ({
	parseAssetId: (assetId: number) => {
		const adjusted = assetId - 100_000;
		return { kind: "builderPerp", dexIndex: Math.floor(adjusted / 10_000), index: adjusted % 10_000 };
	},
	useExchange: (_method: string, options?: { executionGuard?: (params: OrderParams) => void }) => {
		const executionGuard = options?.executionGuard;
		return {
			mutateAsync: (params: OrderParams) => mocks.mutateOrder(params, executionGuard),
			isPending: false,
			error: null,
			reset: vi.fn(),
		};
	},
	useHyperliquid: () => ({
		clientKey: USER,
		env: "Mainnet",
		sessionMode: "wallet",
		info: { clearinghouseState: mocks.clearinghouseState, metaAndAssetCtxs: mocks.metaAndAssetCtxs },
	}),
	useMarkets: () => ({
		isLoading: false,
		error: null,
		getMarket: (coin: string) => (coin === COIN ? MARKET : undefined),
	}),
	useSubscription: () => ({ status: "active", isStale: false, data: { states: [] } }),
	useUserPositions: () => ({
		isLoading: false,
		hasError: false,
		isStale: false,
		getPosition: (coin: string, dex: string) =>
			coin === COIN && dex === "xyz"
				? { coin: COIN, dex: "xyz", szi: "2.500", leverage: { type: "isolated", value: 10 } }
				: undefined,
	}),
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

function setLegalState(state: string) {
	mocks.legalState = state;
	for (const listener of mocks.legalListeners) listener();
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

function clearSession(): void {
	const session = getPositionMarketCloseModal();
	if (!session) return;
	getPositionMarketCloseActions().updatePhase(session.sessionId, "idle");
	getPositionMarketCloseActions().close(session.sessionId);
}

function Legal() {
	useSyncExternalStore(mocks.subscribeLegal, () => mocks.legalState);
	return createElement(GlobalModals, {
		enableHip3Disclaimer: true,
		enableLegalGate: true,
		enablePositionMarketClose: true,
	});
}

describe("Market Close across legal-gate rechecks", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queueId = "";

	function openAndConfirm(): string {
		let sessionId: string | null = null;
		act(() => {
			sessionId = getPositionMarketCloseActions().open(positionRef, { owner: USER, env: "Mainnet" });
		});
		if (!sessionId) throw new Error("Expected a market close session");
		queueId = `market-close:${sessionId}`;
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="confirm-market-close"]')?.click());
		return sessionId;
	}

	beforeEach(async () => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		clearSession();
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
		window.localStorage.clear();
		mocks.legalState = "accepted";
		mocks.probeMounts = 0;
		mocks.probeUnmounts = 0;
		mocks.lockRequest
			.mockReset()
			.mockImplementation(
				async (name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown | PromiseLike<unknown>) =>
					callback({ name, mode: "exclusive" } as Lock),
			);
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: { request: mocks.lockRequest } as unknown as LockManager,
		});
		mocks.clearinghouseState.mockReset().mockImplementation(async () => ({
			assetPositions: [{ position: { coin: COIN, szi: "2.500", leverage: { type: "isolated", value: 10 } } }],
		}));
		mocks.metaAndAssetCtxs.mockReset().mockImplementation(async () => {
			const universe = Array.from({ length: 32 }, (_, index) => ({
				name: index === 31 ? COIN : `OTHER-${index}`,
				szDecimals: 3,
			}));
			return [{ universe }, universe.map((_, index) => ({ markPx: index === 31 ? "100" : "1", midPx: null }))];
		});
		mocks.executeOrder.mockReset().mockResolvedValue({
			status: "ok",
			response: { type: "order", data: { statuses: [{ filled: { totalSz: "2.5", avgPx: "99.5", oid: 1 } }] } },
		});
		mocks.mutateOrder
			.mockReset()
			.mockImplementation(async (params: OrderParams, executionGuard?: (params: OrderParams) => void) => {
				executionGuard?.(params);
				return mocks.executeOrder(params);
			});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(createElement(Legal)));
		await vi.waitFor(() => expect(hasPositionMarketCloseSubmitter()).toBe(true));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		act(() => removeOrderQueueItem(queueId));
		clearSession();
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
	});

	it.each(["checking", "error"])(
		"sends a confirmed close once when legal status turns %s during validation and recovers",
		async (state) => {
			const freshPosition = createGate();
			const respond = mocks.clearinghouseState.getMockImplementation();
			mocks.clearinghouseState.mockImplementation(async (...args: unknown[]) => {
				await freshPosition.wait();
				return respond?.(...args);
			});
			const sessionId = openAndConfirm();
			await act(async () => {
				await freshPosition.entered;
			});
			expect(getPositionMarketCloseModal()).toMatchObject({
				sessionId,
				phase: "validating",
				presentation: "dismissed",
			});

			act(() => setLegalState(state));
			expect(mocks.probeUnmounts).toBe(1);
			expect(getPositionMarketCloseModal()).toMatchObject({ sessionId, phase: "validating" });

			act(() => setLegalState("accepted"));
			await act(async () => {
				freshPosition.release();
			});

			expect(mocks.executeOrder).toHaveBeenCalledOnce();
			expect(getOrderQueueItem(queueId)).toMatchObject({ status: "success", outcome: "filled" });
			expect(getPositionMarketCloseModal()).toBeNull();
		},
	);

	it("keeps the in-flight guard while legal status changes during the exchange request", async () => {
		const exchange = createGate();
		mocks.executeOrder.mockImplementation(async () => {
			await exchange.wait();
			return {
				status: "ok",
				response: { type: "order", data: { statuses: [{ filled: { totalSz: "2.5", avgPx: "99.5", oid: 1 } }] } },
			};
		});
		const sessionId = openAndConfirm();
		await act(async () => {
			await exchange.entered;
		});

		act(() => setLegalState("error"));
		expect(getPositionMarketCloseModal()).toMatchObject({ sessionId, phase: "submitting" });
		let secondSessionId: string | null = "unexpected";
		act(() => {
			secondSessionId = getPositionMarketCloseActions().open(positionRef, { owner: USER, env: "Mainnet" });
		});
		expect(secondSessionId).toBeNull();

		await act(async () => {
			exchange.release();
		});
		expect(mocks.executeOrder).toHaveBeenCalledOnce();
		expect(getOrderQueueItem(queueId)).toMatchObject({ status: "success", outcome: "filled" });
		expect(getPositionMarketCloseModal()).toBeNull();
	});

	it("still closes an idle confirmation when legal review takes priority", () => {
		act(() => {
			getPositionMarketCloseActions().open(positionRef, { owner: USER, env: "Mainnet" });
		});
		expect(mocks.probeMounts).toBe(1);

		act(() => setLegalState("required"));

		expect(container.querySelector('[data-testid="LegalAcceptanceModal"]')).not.toBeNull();
		expect(getPositionMarketCloseModal()).toBeNull();
	});
});
