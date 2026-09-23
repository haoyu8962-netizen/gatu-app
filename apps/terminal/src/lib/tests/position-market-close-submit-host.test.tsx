// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement, StrictMode, useSyncExternalStore } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionMarketCloseSubmitHost } from "@/components/trade/components/position-market-close-submit-host";
import { usePositionMarketCloseAction } from "@/hooks/trade/use-position-market-close-action";
import { dismissPositionMarketCloseConfirmation } from "@/lib/trade/position-market-close-confirmation-preference";
import {
	hasPositionMarketCloseSubmitter,
	POSITION_MARKET_CLOSE_SUBMITTER_WAIT_MS,
	submitPositionMarketClose,
} from "@/lib/trade/position-market-close-submitter";
import {
	discardIdlePositionMarketCloseModal,
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

interface LivePosition {
	coin: string;
	dex: string;
	szi: string;
	leverage: { type: "cross" | "isolated"; value: number };
}

interface OrderParams {
	grouping: "na" | "normalTpsl" | "positionTpsl";
	orders: Array<{ a: number; b: boolean; p: string; s: string; r: boolean; t: { limit: { tif: string } } }>;
}

const mocks = vi.hoisted(() => {
	const listeners = new Set<() => void>();
	return {
		livePosition: null as LivePosition | null,
		liveListeners: listeners,
		subscribeLive: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
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

vi.mock("@/hooks/trade/use-legal-gate", () => ({
	useLegalGate: () => ({ state: "accepted" }),
}));

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
		info: { clearinghouseState: mocks.clearinghouseState, metaAndAssetCtxs: mocks.metaAndAssetCtxs },
	}),
	useTradingStatus: () => ({ isReady: true, isLoading: false }),
	useMarkets: () => ({
		isLoading: false,
		error: null,
		getMarket: (coin: string) => (coin === COIN ? MARKET : undefined),
	}),
	useSubscription: () => ({ status: "active", isStale: false, data: { states: [] } }),
	useUserPositions: () => {
		const position = useSyncExternalStore(mocks.subscribeLive, () => mocks.livePosition);
		return {
			isLoading: false,
			hasError: false,
			isStale: false,
			getPosition: (coin: string, dex: string) =>
				position?.coin === coin && position.dex === dex ? position : undefined,
		};
	},
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

function setLivePosition(szi: string | null) {
	mocks.livePosition = szi === null ? null : { coin: COIN, dex: "xyz", szi, leverage: { type: "isolated", value: 10 } };
	for (const listener of mocks.liveListeners) listener();
}

function holdFreshPositionRequest() {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const respond = mocks.clearinghouseState.getMockImplementation();
	mocks.clearinghouseState.mockImplementation(async (...args: unknown[]) => {
		await gate;
		return respond?.(...args);
	});
	return release;
}

let action: ReturnType<typeof usePositionMarketCloseAction> | null = null;

function PositionsListOwner() {
	action = usePositionMarketCloseAction();
	return null;
}

function clearSession(): void {
	const session = getPositionMarketCloseModal();
	if (!session) return;
	getPositionMarketCloseActions().updatePhase(session.sessionId, "idle");
	getPositionMarketCloseActions().close(session.sessionId);
}

describe("PositionMarketCloseSubmitHost", () => {
	let hostContainer: HTMLDivElement;
	let listContainer: HTMLDivElement;
	let hostRoot: Root;
	let listRoot: Root;
	let hostMounted = false;
	let listMounted = false;
	const queueIds: string[] = [];

	function mountHost(strict = false) {
		act(() =>
			hostRoot.render(
				strict
					? createElement(StrictMode, null, createElement(PositionMarketCloseSubmitHost))
					: createElement(PositionMarketCloseSubmitHost),
			),
		);
		hostMounted = true;
	}

	function unmountHost() {
		act(() => hostRoot.unmount());
		hostMounted = false;
	}

	function mountList() {
		act(() => listRoot.render(createElement(PositionsListOwner)));
		listMounted = true;
	}

	function unmountList() {
		act(() => listRoot.unmount());
		listMounted = false;
		action = null;
	}

	function openDirectClose(): string {
		expect(dismissPositionMarketCloseConfirmation({ owner: USER, env: "Mainnet" })).toBe("dismissed");
		let sessionId: string | null = null;
		act(() => {
			sessionId = action?.open(positionRef) ?? null;
		});
		if (!sessionId) throw new Error("Expected a direct market close session");
		queueIds.push(`market-close:${sessionId}`);
		return sessionId;
	}

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		clearSession();
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
		window.localStorage.clear();
		mocks.livePosition = null;
		setLivePosition("2.500");
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
		hostContainer = document.createElement("div");
		listContainer = document.createElement("div");
		document.body.append(hostContainer, listContainer);
		hostRoot = createI18nRoot(hostContainer);
		listRoot = createI18nRoot(listContainer);
	});

	afterEach(() => {
		if (listMounted) unmountList();
		if (hostMounted) unmountHost();
		hostContainer.remove();
		listContainer.remove();
		act(() => {
			for (const id of queueIds.splice(0)) removeOrderQueueItem(id);
		});
		clearSession();
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
	});

	it("completes a direct close after the positions list that started it unmounts", async () => {
		mountHost();
		mountList();
		const release = holdFreshPositionRequest();
		const sessionId = openDirectClose();
		expect(getPositionMarketCloseModal()).toMatchObject({ sessionId, presentation: "direct", phase: "validating" });

		unmountList();
		await act(async () => {
			release();
		});

		expect(mocks.executeOrder).toHaveBeenCalledOnce();
		expect(getOrderQueueItem(`market-close:${sessionId}`)).toMatchObject({ status: "success", outcome: "filled" });
		expect(getPositionMarketCloseModal()).toBeNull();
	});

	it("keeps the execution guard on live data after the positions list unmounts", async () => {
		mountHost();
		mountList();
		const release = holdFreshPositionRequest();
		const sessionId = openDirectClose();

		unmountList();
		act(() => setLivePosition("1.000"));
		await act(async () => {
			release();
		});

		expect(mocks.executeOrder).not.toHaveBeenCalled();
		expect(getOrderQueueItem(`market-close:${sessionId}`)).toMatchObject({
			status: "failed",
			error: { kind: "localized", code: "trading-data-changed" },
		});
		expect(getPositionMarketCloseModal()).toBeNull();
	});

	it("keeps an in-flight session when a surface discards only idle sessions", async () => {
		mountHost();
		mountList();
		const release = holdFreshPositionRequest();
		const sessionId = openDirectClose();

		act(() => discardIdlePositionMarketCloseModal());
		expect(getPositionMarketCloseModal()).toMatchObject({ sessionId, phase: "validating" });

		await act(async () => {
			release();
		});
		expect(mocks.executeOrder).toHaveBeenCalledOnce();
	});

	it("checks live data at the exchange boundary after the positions list unmounts", async () => {
		mountHost();
		mountList();
		let enterExchange!: () => void;
		const exchangeEntered = new Promise<void>((resolve) => {
			enterExchange = resolve;
		});
		let releaseExchange!: () => void;
		const exchangeGate = new Promise<void>((resolve) => {
			releaseExchange = resolve;
		});
		mocks.mutateOrder.mockImplementation(
			async (params: OrderParams, executionGuard?: (params: OrderParams) => void) => {
				enterExchange();
				await exchangeGate;
				executionGuard?.(params);
				return mocks.executeOrder(params);
			},
		);
		const sessionId = openDirectClose();

		unmountList();
		await act(async () => {
			await exchangeEntered;
		});
		expect(getPositionMarketCloseModal()).toMatchObject({ sessionId, phase: "submitting" });
		act(() => setLivePosition("-2.500"));
		await act(async () => {
			releaseExchange();
		});

		expect(mocks.executeOrder).not.toHaveBeenCalled();
		expect(getOrderQueueItem(`market-close:${sessionId}`)).toMatchObject({
			status: "failed",
			error: { kind: "localized", code: "trading-data-changed" },
		});
	});

	it("releases a reconciling session when the host unmounts so other dialogs can open", () => {
		mountHost();
		let sessionId = "";
		act(() => {
			sessionId = getPositionMarketCloseActions().open(positionRef, { owner: USER, env: "Mainnet" }) ?? "";
			getPositionMarketCloseActions().updatePhase(sessionId, "reconciling");
		});

		unmountHost();

		expect(getPositionMarketCloseModal()).toBeNull();
	});

	it("fails closed when the host itself unmounts during a submission", async () => {
		mountHost();
		mountList();
		const release = holdFreshPositionRequest();
		const sessionId = openDirectClose();

		unmountHost();
		expect(hasPositionMarketCloseSubmitter()).toBe(false);
		expect(getPositionMarketCloseModal()).toBeNull();
		await act(async () => {
			release();
		});

		expect(mocks.executeOrder).not.toHaveBeenCalled();
		expect(getOrderQueueItem(`market-close:${sessionId}`)).toMatchObject({ status: "failed" });
	});

	it("does not discard an idle session when the host mounts under StrictMode", () => {
		let sessionId: string | null = null;
		act(() => {
			sessionId = getPositionMarketCloseActions().open(positionRef, { owner: USER, env: "Mainnet" });
		});

		mountHost(true);

		expect(hasPositionMarketCloseSubmitter()).toBe(true);
		expect(getPositionMarketCloseModal()).toMatchObject({ sessionId, phase: "idle", presentation: "confirmation" });
	});

	it("releases the session with a failure notice when no host registers in time", async () => {
		vi.useFakeTimers();
		try {
			let sessionId = "";
			act(() => {
				sessionId = getPositionMarketCloseActions().open(positionRef, { owner: USER, env: "Mainnet" }) ?? "";
			});
			queueIds.push(`market-close:${sessionId}`);

			const pending = submitPositionMarketClose({ sessionId, confirmedCloseSize: "2.5" });
			expect(getPositionMarketCloseModal()).toMatchObject({
				sessionId,
				phase: "validating",
				presentation: "dismissed",
			});
			expect(getOrderQueueItem(`market-close:${sessionId}`)).toMatchObject({ status: "pending" });
			await act(async () => {
				await vi.advanceTimersByTimeAsync(POSITION_MARKET_CLOSE_SUBMITTER_WAIT_MS);
				await pending;
			});

			expect(mocks.executeOrder).not.toHaveBeenCalled();
			expect(getPositionMarketCloseModal()).toBeNull();
			expect(getOrderQueueItem(`market-close:${sessionId}`)).toMatchObject({
				status: "failed",
				error: { kind: "localized", code: "failed-market-close" },
				children: [expect.objectContaining({ status: "rejected" })],
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("runs a confirmation that arrived before the host registered once the host mounts", async () => {
		let sessionId = "";
		act(() => {
			sessionId = getPositionMarketCloseActions().open(positionRef, { owner: USER, env: "Mainnet" }) ?? "";
		});
		queueIds.push(`market-close:${sessionId}`);

		const pending = submitPositionMarketClose({ sessionId, confirmedCloseSize: "2.5" });
		mountHost();
		await act(async () => {
			await pending;
		});

		expect(mocks.executeOrder).toHaveBeenCalledOnce();
		expect(getOrderQueueItem(`market-close:${sessionId}`)).toMatchObject({ status: "success", outcome: "filled" });
	});
});
