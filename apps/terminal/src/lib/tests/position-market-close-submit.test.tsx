// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { HttpRequestError } from "@nktkas/hyperliquid";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePositionMarketCloseSubmit } from "@/hooks/trade/use-position-market-close-submit";
import { reserveOrderAssets, runWithOrderAssetLocks } from "@/lib/trade/order-asset-lock";
import { readPositionMarketCloseConfirmationPreference } from "@/lib/trade/position-market-close-confirmation-preference";
import {
	formatPositionSubmitFeedback,
	localizedPositionSubmitFeedback,
	type PositionSubmitFeedbackCode,
} from "@/lib/trade/position-submit-feedback";
import {
	getPositionMarketCloseActions,
	getPositionMarketCloseModal,
	type PositionMarketClosePresentation,
	type PositionMarketCloseRef,
} from "@/stores/use-global-modal-store";
import { type OrderQueueItem, removeOrderQueueItem, useOrderQueue } from "@/stores/use-order-queue-store";
import { getPendingOrderActions, hasPendingOrderForAssets } from "@/stores/use-pending-order-store";
import { getPendingTwapActions } from "@/stores/use-pending-twap-store";
import { createExchangeHarness } from "./harness/hyperliquid-exchange";
import { feedbackErrorText } from "./harness/order-feedback";
import { createI18nRoot } from "./harness/react";

const USER = "0x1111111111111111111111111111111111111111" as const;
const COIN = "xyz:CXMT";
const ASSET_ID = 120_031;
const BLOCKED_MESSAGE = "Another order for this market is still being confirmed.";

function localizedMessage(code: PositionSubmitFeedbackCode): string {
	return formatPositionSubmitFeedback(localizedPositionSubmitFeedback(code), (descriptor) => i18n._(descriptor));
}

interface LivePosition {
	coin: string;
	dex: string;
	szi: string;
	leverage: { type: "cross" | "isolated"; value: number };
}

interface OrderParams {
	grouping: "na" | "normalTpsl" | "positionTpsl";
	orders: Array<{
		a: number;
		b: boolean;
		p: string;
		s: string;
		r: boolean;
		t: { limit: { tif: string } };
		c?: string;
	}>;
}

const mocks = vi.hoisted(() => ({
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	marketLoading: false,
	marketError: null as Error | null,
	marketAssetId: 120_031,
	marketCtxIndex: 31,
	marketDexIndex: 2,
	freshCtxIndex: 31,
	positionLoading: false,
	positionError: false,
	positionStale: false,
	twapStatus: "active" as "active" | "connecting" | "error" | "idle",
	twapStale: false,
	activeTwapCoins: [] as string[],
	livePosition: null as LivePosition | null,
	restPositionSize: "2.500",
	restMarginMode: "isolated" as "cross" | "isolated",
	restMarkPx: "100",
	restMidPx: null as string | null,
	clearinghouseState: vi.fn(),
	metaAndAssetCtxs: vi.fn(),
	mutateOrder: vi.fn(),
	executeOrder: vi.fn(),
	resetMutation: vi.fn(),
	executionGuard: undefined as ((params: OrderParams) => void) | undefined,
	betweenExecutionGuards: null as null | (() => Promise<void>),
	guardCalls: 0,
	lockRequest: vi.fn(),
	hip3Accepted: true,
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	toastWarning: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error: mocks.toastError,
		success: mocks.toastSuccess,
		warning: mocks.toastWarning,
	},
}));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/use-global-settings-store")>();
	return {
		...actual,
		useMarketOrderSlippageBpsString: () => "50",
	};
});

vi.mock("@/lib/hyperliquid", () => ({
	parseAssetId: (assetId: number) => {
		if (assetId >= 100_000) {
			const adjusted = assetId - 100_000;
			return { kind: "builderPerp", dexIndex: Math.floor(adjusted / 10_000), index: adjusted % 10_000 };
		}
		if (assetId >= 10_000) return { kind: "spot", index: assetId - 10_000 };
		return { kind: "perp", index: assetId };
	},
	useExchange: (
		_method: string,
		options?: {
			executionGuard?: (params: OrderParams) => void;
		},
	) => {
		mocks.executionGuard = options?.executionGuard;
		return {
			mutateAsync: mocks.mutateOrder,
			isPending: false,
			error: null,
			reset: mocks.resetMutation,
		};
	},
	useHyperliquid: () => ({
		clientKey: mocks.clientKey,
		env: mocks.env,
		info: {
			clearinghouseState: mocks.clearinghouseState,
			metaAndAssetCtxs: mocks.metaAndAssetCtxs,
		},
	}),
	useMarkets: () => ({
		isLoading: mocks.marketLoading,
		error: mocks.marketError,
		getMarket: (coin: string) =>
			coin === "xyz:CXMT"
				? {
						kind: "builderPerp",
						name: "xyz:CXMT",
						assetId: mocks.marketAssetId,
						szDecimals: 3,
						dex: "xyz",
						ctxIndex: mocks.marketCtxIndex,
						dexIndex: mocks.marketDexIndex,
					}
				: undefined,
	}),
	useSubscription: () => ({
		status: mocks.twapStatus,
		isStale: mocks.twapStale,
		data:
			mocks.twapStatus === "active"
				? {
						states: mocks.activeTwapCoins.map((coin, index) => [
							index + 1,
							{ coin, side: "B", sz: "1", minutes: 30, reduceOnly: false, randomize: true },
						]),
					}
				: undefined,
	}),
	useUserPositions: () => ({
		isLoading: mocks.positionLoading,
		hasError: mocks.positionError,
		isStale: mocks.positionStale,
		getPosition: (coin: string, dex: string) =>
			mocks.livePosition?.coin === coin && mocks.livePosition.dex === dex ? mocks.livePosition : undefined,
	}),
}));

vi.mock("@/stores/use-hip3-disclaimer-store", () => ({
	hasAcceptedHip3Disclaimer: () => mocks.hip3Accepted,
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

let hookValue: ReturnType<typeof usePositionMarketCloseSubmit> | null = null;
let hookRenderCount = 0;
let queueItems: OrderQueueItem[] = [];

function queueErrorMessages() {
	return queueItems.filter((item) => item.status === "failed").map(feedbackErrorText);
}

function Probe() {
	queueItems = useOrderQueue();
	hookRenderCount += 1;
	hookValue = usePositionMarketCloseSubmit();
	return null;
}

function createLivePosition(szi = "2.500", marginMode: "cross" | "isolated" = "isolated"): LivePosition {
	return {
		coin: COIN,
		dex: "xyz",
		szi,
		leverage: { type: marginMode, value: 10 },
	};
}

function createConfirmedResponse(totalSize = "2.5") {
	return {
		status: "ok",
		response: {
			type: "order",
			data: { statuses: [{ filled: { totalSz: totalSize, avgPx: "99.5", oid: 1 } }] },
		},
	};
}

function clearMarketCloseModal(): void {
	const session = getPositionMarketCloseModal();
	if (!session) return;
	const actions = getPositionMarketCloseActions();
	actions.updatePhase(session.sessionId, "idle");
	actions.close(session.sessionId);
}

function currentHook(): ReturnType<typeof usePositionMarketCloseSubmit> {
	if (!hookValue) throw new Error("Expected market close submit hook");
	return hookValue;
}

function openSession(
	overrides: Partial<PositionMarketCloseRef> = {},
	presentation: PositionMarketClosePresentation = "confirmation",
): string {
	let sessionId: string | null = null;
	act(() => {
		sessionId = getPositionMarketCloseActions().open(
			{ ...positionRef, ...overrides },
			{ owner: USER, env: "Mainnet" },
			presentation,
		);
	});
	if (!sessionId) throw new Error("Expected market close session");
	return sessionId;
}

interface SubmitConfirmedOptions {
	confirmedCloseSize?: string | null;
	dismissFutureConfirmation?: boolean;
}

function submitConfirmed(sessionId: string, options: SubmitConfirmedOptions = {}): Promise<void> {
	const { confirmedCloseSize = "2.5", dismissFutureConfirmation } = options;
	return currentHook().submit({ sessionId, confirmedCloseSize, dismissFutureConfirmation });
}

function createExecutionGate() {
	let releaseGate!: () => void;
	let markEntered!: () => void;
	const gate = new Promise<void>((resolve) => {
		releaseGate = resolve;
	});
	const entered = new Promise<void>((resolve) => {
		markEntered = resolve;
	});
	return {
		entered,
		release: releaseGate,
		wait: async () => {
			markEntered();
			await gate;
		},
	};
}

function holdFreshPositionRequest() {
	const gate = createExecutionGate();
	const respond = mocks.clearinghouseState.getMockImplementation();
	mocks.clearinghouseState.mockImplementation(async (...args: unknown[]) => {
		await gate.wait();
		return respond?.(...args);
	});
	return gate;
}

describe("usePositionMarketCloseSubmit", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		clearMarketCloseModal();
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
		window.localStorage.clear();
		mocks.clientKey = USER;
		mocks.env = "Mainnet";
		mocks.marketLoading = false;
		mocks.marketError = null;
		mocks.marketAssetId = ASSET_ID;
		mocks.marketCtxIndex = 31;
		mocks.marketDexIndex = 2;
		mocks.freshCtxIndex = 31;
		mocks.positionLoading = false;
		mocks.positionError = false;
		mocks.positionStale = false;
		mocks.twapStatus = "active";
		mocks.twapStale = false;
		mocks.activeTwapCoins = [];
		mocks.livePosition = createLivePosition();
		mocks.restPositionSize = "2.500";
		mocks.restMarginMode = "isolated";
		mocks.restMarkPx = "100";
		mocks.restMidPx = null;
		mocks.guardCalls = 0;
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
		mocks.hip3Accepted = true;
		mocks.betweenExecutionGuards = null;
		mocks.executionGuard = undefined;
		mocks.clearinghouseState.mockReset().mockImplementation(async () => ({
			assetPositions: [
				{
					position: {
						coin: COIN,
						szi: mocks.restPositionSize,
						leverage: { type: mocks.restMarginMode, value: 10 },
					},
				},
			],
		}));
		mocks.metaAndAssetCtxs.mockReset().mockImplementation(async () => {
			const universe = Array.from({ length: mocks.freshCtxIndex + 1 }, (_, index) => ({
				name: index === mocks.freshCtxIndex ? COIN : `OTHER-${index}`,
				szDecimals: 3,
			}));
			const contexts = universe.map((_, index) => ({
				markPx: index === mocks.freshCtxIndex ? mocks.restMarkPx : "1",
				midPx: index === mocks.freshCtxIndex ? mocks.restMidPx : null,
			}));
			return [{ universe }, contexts];
		});
		mocks.executeOrder.mockReset().mockResolvedValue(createConfirmedResponse());
		mocks.mutateOrder.mockReset().mockImplementation(async (params: OrderParams) => {
			mocks.guardCalls += 1;
			mocks.executionGuard?.(params);
			await mocks.betweenExecutionGuards?.();
			mocks.guardCalls += 1;
			mocks.executionGuard?.(params);
			return mocks.executeOrder(params);
		});
		mocks.resetMutation.mockReset();
		mocks.toastSuccess.mockReset();
		mocks.toastError.mockReset();
		mocks.toastWarning.mockReset();
		hookRenderCount = 0;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(createElement(Probe)));
	});

	afterEach(() => {
		act(() => {
			for (const item of queueItems) removeOrderQueueItem(item.id);
		});
		act(() => root.unmount());
		container.remove();
		hookValue = null;
		clearMarketCloseModal();
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
	});

	it("builds the string market-close order from fresh REST state and closes after success", async () => {
		const sessionId = openSession({ signedPositionSize: "2.400", markPx: "90" });

		await act(async () => {
			await submitConfirmed(sessionId);
		});

		expect(mocks.clearinghouseState).toHaveBeenCalledWith({ user: USER, dex: "xyz" });
		expect(mocks.lockRequest).toHaveBeenCalledWith(
			`gatu-order-asset-v1:mainnet:${USER}:${ASSET_ID}`,
			{ mode: "exclusive", ifAvailable: true },
			expect.any(Function),
		);
		expect(mocks.metaAndAssetCtxs).toHaveBeenCalledWith({ dex: "xyz" });
		expect(mocks.executeOrder).toHaveBeenCalledTimes(1);
		const submitted = mocks.executeOrder.mock.calls[0]?.[0] as OrderParams;
		expect(submitted.grouping).toBe("na");
		expect(submitted.orders).toHaveLength(1);
		expect(submitted.orders[0]).toMatchObject({
			a: ASSET_ID,
			b: false,
			p: "99.5",
			s: "2.5",
			r: true,
			t: { limit: { tif: "FrontendMarket" } },
		});
		expect(typeof submitted.orders[0]?.p).toBe("string");
		expect(typeof submitted.orders[0]?.s).toBe("string");
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueItems.at(-1)).toMatchObject({
			status: "success",
			outcome: "filled",
			size: "2.5",
			owner: USER,
			env: "Mainnet",
			operation: "market-close",
			children: [{ assetId: ASSET_ID, market: COIN, status: "filled", filledSize: "2.5" }],
		});
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	it.each([
		{ kind: "percent" as const, value: "63", expectedSize: "1.575" },
		{ kind: "max" as const, value: "100", expectedSize: "2.5" },
	])("sends $kind close sizing through the real SDK without changing market semantics", async (sample) => {
		const exchange = createExchangeHarness(false);
		mocks.executeOrder.mockImplementation((params) => exchange.client.order(params));
		const sessionId = openSession();
		act(() =>
			getPositionMarketCloseActions().setSizingIntent(
				sessionId,
				sample.kind === "max" ? { kind: "max" } : { kind: "percent", value: sample.value },
			),
		);
		expect(exchange.signTypedData).not.toHaveBeenCalled();
		await act(async () => {
			await submitConfirmed(sessionId, { confirmedCloseSize: sample.expectedSize });
		});

		expect(exchange.request).toHaveBeenCalledOnce();
		expect(exchange.getAction()).toMatchObject({
			type: "order",
			grouping: "na",
			orders: [
				{
					a: ASSET_ID,
					b: false,
					p: "99.5",
					s: sample.expectedSize,
					r: true,
					t: { limit: { tif: "FrontendMarket" } },
					c: expect.stringMatching(/^0x[0-9a-f]{32}$/),
				},
			],
		});
	});

	it("does not rerender its status consumer for idle sizing intent updates", () => {
		expect(hookRenderCount).toBe(1);
		const sessionId = openSession();

		act(() => {
			getPositionMarketCloseActions().setSizingIntent(sessionId, { kind: "percent", value: "25" });
			getPositionMarketCloseActions().setSizingIntent(sessionId, { kind: "percent", value: "50" });
		});

		expect(hookRenderCount).toBe(1);
	});

	it("reports a client-side block in the queue and releases the session", async () => {
		mocks.lockRequest.mockImplementationOnce(
			async (_name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown | PromiseLike<unknown>) =>
				callback(null),
		);
		const sessionId = openSession();

		await act(async () => submitConfirmed(sessionId));

		expect(queueErrorMessages()).toContain(BLOCKED_MESSAGE);
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
	});

	it("reports a raw SDK error in the queue and releases the session", async () => {
		const sdkMessage = "SDK could not load the close snapshot";
		mocks.clearinghouseState.mockRejectedValueOnce(new Error(sdkMessage));
		const sessionId = openSession();

		await act(async () => submitConfirmed(sessionId));

		expect(queueErrorMessages()).toContain(sdkMessage);
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(mocks.clearinghouseState).toHaveBeenCalledOnce();
	});

	it("dismisses the confirmation dialog before validation starts and never reopens it", async () => {
		const gate = createExecutionGate();
		mocks.clearinghouseState.mockImplementationOnce(async () => {
			await gate.wait();
			throw new Error("snapshot failed");
		});
		const sessionId = openSession();
		let submission!: Promise<void>;

		await act(async () => {
			submission = submitConfirmed(sessionId);
			await gate.entered;
		});
		expect(getPositionMarketCloseModal()).toMatchObject({ sessionId, presentation: "dismissed", phase: "validating" });
		const queueId = queueItems.at(-1)?.id;
		expect(queueItems.at(-1)).toMatchObject({
			operation: "market-close",
			status: "pending",
			owner: USER,
			env: "Mainnet",
		});
		expect(mocks.executeOrder).not.toHaveBeenCalled();

		await act(async () => {
			gate.release();
			await submission;
		});
		expect(queueErrorMessages()).toContain("snapshot failed");
		expect(queueItems).toHaveLength(1);
		expect(queueItems[0]).toMatchObject({ id: queueId, status: "failed" });
		expect(getPositionMarketCloseModal()).toBeNull();
	});

	it("retains actual partial close quantity instead of reporting zero execution as a rejection", async () => {
		mocks.executeOrder.mockResolvedValueOnce(createConfirmedResponse("0.5"));
		const sessionId = openSession();
		await act(async () => submitConfirmed(sessionId));
		expect(queueItems).toHaveLength(1);
		expect(queueItems[0]).toMatchObject({
			status: "partial",
			countMode: "filled",
			acceptedCount: 0,
			totalCount: 1,
			children: [{ assetId: ASSET_ID, market: COIN, size: "2.5", filledSize: "0.5", status: "partial" }],
		});
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
	});

	it("keeps a blocked late attempt attributed to the original owner and network", async () => {
		const gate = createExecutionGate();
		mocks.betweenExecutionGuards = gate.wait;
		const sessionId = openSession();
		let submission!: Promise<void>;
		await act(async () => {
			submission = submitConfirmed(sessionId);
			await gate.entered;
		});
		const queueId = queueItems[0]?.id;
		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		mocks.env = "Testnet";
		act(() => root.render(createElement(Probe)));
		await act(async () => {
			gate.release();
			await submission;
		});
		expect(queueItems).toHaveLength(1);
		expect(queueItems[0]).toMatchObject({ id: queueId, status: "failed", owner: USER, env: "Mainnet" });
		expect(mocks.executeOrder).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
	});

	it("ignores a rapid second click while fresh validation is still in flight", async () => {
		const gate = createExecutionGate();
		mocks.clearinghouseState.mockImplementationOnce(async () => {
			await gate.wait();
			return {
				assetPositions: [
					{
						position: {
							coin: COIN,
							szi: mocks.restPositionSize,
							leverage: { type: mocks.restMarginMode, value: 10 },
						},
					},
				],
			};
		});
		const sessionId = openSession();
		let firstSubmission!: Promise<void>;

		await act(async () => {
			firstSubmission = submitConfirmed(sessionId);
			await gate.entered;
		});
		await act(async () => {
			await submitConfirmed(sessionId);
		});

		expect(mocks.clearinghouseState).toHaveBeenCalledOnce();
		expect(mocks.metaAndAssetCtxs).toHaveBeenCalledOnce();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();

		await act(async () => {
			gate.release();
			await firstSubmission;
		});
		expect(mocks.executeOrder).toHaveBeenCalledOnce();
	});

	it("uses the fresh mid price as the market protection reference", async () => {
		mocks.restMidPx = "110";
		const sessionId = openSession();

		await act(async () => {
			await submitConfirmed(sessionId);
		});

		const submitted = mocks.executeOrder.mock.calls[0]?.[0] as OrderParams;
		expect(submitted.orders[0]?.p).toBe("109.45");
	});

	it("saves the scoped preference only after a fresh close plan validates", async () => {
		const sessionId = openSession();

		await act(async () => {
			await submitConfirmed(sessionId, { dismissFutureConfirmation: true });
		});

		expect(readPositionMarketCloseConfirmationPreference({ owner: USER, env: "Mainnet" })).toBe("dismissed");
		expect(mocks.executeOrder).toHaveBeenCalledOnce();
	});

	it("saves the preference for a validated partial close", async () => {
		const sessionId = openSession();
		act(() => getPositionMarketCloseActions().setSizingIntent(sessionId, { kind: "percent", value: "50" }));

		await act(async () => {
			await submitConfirmed(sessionId, { confirmedCloseSize: "1.25", dismissFutureConfirmation: true });
		});

		expect(readPositionMarketCloseConfirmationPreference({ owner: USER, env: "Mainnet" })).toBe("dismissed");
		expect(mocks.executeOrder).toHaveBeenCalledOnce();
	});

	it("fails closed when cross-tab asset locking is unavailable", async () => {
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
		const sessionId = openSession();

		await act(async () => {
			await submitConfirmed(sessionId);
		});

		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("coordination-unavailable"));
	});

	it("blocks immediately when another tab currently holds the same asset lock", async () => {
		mocks.lockRequest.mockImplementationOnce(
			async (_name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown | PromiseLike<unknown>) =>
				callback(null),
		);
		const sessionId = openSession();

		await act(async () => {
			await submitConfirmed(sessionId);
		});

		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("blocked-market"));
	});

	it("blocks a pending same-asset order written by another tab", async () => {
		await runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [ASSET_ID] }, async (lease) =>
			reserveOrderAssets(lease, {
				submissionId: "other-tab-order",
				intentKey: "other-tab-intent",
				exclusiveAssetLock: true,
				isRiskReducing: true,
				createdAt: Date.now(),
			}),
		);
		const sessionId = openSession();

		await act(async () => {
			await submitConfirmed(sessionId);
		});

		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("blocked-market"));
	});

	it("blocks a pending order for the same asset before refreshing REST state", async () => {
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "existing-order",
			children: [{ assetId: ASSET_ID, cloid: "0x00000000000000000000000000000001" }],
		});
		const sessionId = openSession();

		await act(async () => {
			await submitConfirmed(sessionId);
		});

		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("blocked-market"));
	});

	it("blocks a persisted pending TWAP before refreshing REST state", async () => {
		getPendingTwapActions().add({
			env: "Mainnet",
			user: USER,
			intent: {
				assetId: ASSET_ID,
				coin: COIN,
				side: "B",
				size: "1",
				minutes: 30,
				reduceOnly: false,
				randomize: true,
			},
			activeBaseline: { ready: true, knownIds: [] },
			historyBaseline: { ready: true, knownIds: [] },
		});
		const sessionId = openSession();

		await act(async () => {
			await submitConfirmed(sessionId);
		});

		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("blocked-market"));
	});

	it("fails closed when persisted pending TWAP state cannot be read", async () => {
		const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			get() {
				throw new Error("storage unavailable");
			},
		});
		const sessionId = openSession();

		try {
			await act(async () => {
				await submitConfirmed(sessionId);
			});
		} finally {
			if (localStorageDescriptor) Object.defineProperty(window, "localStorage", localStorageDescriptor);
		}

		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("coordination-unavailable"));
	});

	it("blocks an active TWAP for the same market before refreshing REST state", async () => {
		mocks.activeTwapCoins = [COIN];
		act(() => root.render(createElement(Probe)));
		const sessionId = openSession();

		await act(async () => {
			await submitConfirmed(sessionId);
		});

		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("blocked-market"));
	});

	it("fails closed when the active TWAP baseline is stale", async () => {
		mocks.twapStale = true;
		act(() => root.render(createElement(Probe)));
		const sessionId = openSession();

		await act(async () => {
			await submitConfirmed(sessionId);
		});

		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("trading-data-changed"));
	});

	it("fails closed before refreshing when the target HIP-3 disclaimer is not accepted", async () => {
		mocks.hip3Accepted = false;
		const sessionId = openSession();

		await act(async () => {
			await submitConfirmed(sessionId);
		});

		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("accept-hip3-market"));
	});

	it("atomically blocks when a same-asset order appears during the REST refresh", async () => {
		const gate = createExecutionGate();
		mocks.clearinghouseState.mockImplementationOnce(async () => {
			await gate.wait();
			return {
				assetPositions: [
					{
						position: {
							coin: COIN,
							szi: mocks.restPositionSize,
							leverage: { type: mocks.restMarginMode, value: 10 },
						},
					},
				],
			};
		});
		const sessionId = openSession();
		let submitPromise!: Promise<void>;

		await act(async () => {
			submitPromise = submitConfirmed(sessionId);
			await gate.entered;
		});
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "racing-order",
			children: [{ assetId: ASSET_ID, cloid: "0x00000000000000000000000000000002" }],
		});

		await act(async () => {
			gate.release();
			await submitPromise;
		});

		expect(mocks.mutateOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("blocked-market"));
	});

	it("re-resolves Max from the fresh REST position instead of the UI snapshot", async () => {
		mocks.restPositionSize = "2.400";
		mocks.executeOrder.mockResolvedValueOnce(createConfirmedResponse("2.4"));
		const sessionId = openSession();

		await act(async () => {
			await submitConfirmed(sessionId);
		});

		const submitted = mocks.executeOrder.mock.calls[0]?.[0] as OrderParams;
		expect(submitted.orders[0]?.s).toBe("2.4");
		expect(getPositionMarketCloseModal()).toBeNull();
	});

	it.each([
		["manual size", { kind: "size", value: "1.100" } as const, "1.1", "1.1"],
		["percentage", { kind: "percent", value: "50" } as const, "1.25", "1.2"],
	])(
		"re-resolves %s from the current intent and fresh REST position",
		async (_label, intent, confirmedCloseSize, expectedSize) => {
			mocks.restPositionSize = "2.400";
			const sessionId = openSession();
			act(() => getPositionMarketCloseActions().setSizingIntent(sessionId, intent));

			await act(async () => {
				await submitConfirmed(sessionId, { confirmedCloseSize });
			});

			const submitted = mocks.executeOrder.mock.calls[0]?.[0] as OrderParams;
			expect(submitted.orders[0]?.s).toBe(expectedSize);
		},
	);

	it("fails closed when a fresh percentage close would exceed that percentage of the live position", async () => {
		mocks.livePosition = createLivePosition("1.500");
		const sessionId = openSession();
		act(() => getPositionMarketCloseActions().setSizingIntent(sessionId, { kind: "percent", value: "50" }));

		await act(async () => {
			await submitConfirmed(sessionId, { confirmedCloseSize: "0.75" });
		});

		expect(mocks.executeOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("trading-data-changed"));
	});

	it.each([
		["Max", { kind: "max" } as const, "2.5"],
		["percentage", { kind: "percent", value: "50" } as const, "1.25"],
	])(
		"rejects a %s close that outgrew the confirmed size while the fresh position was loading",
		async (_label, intent, confirmedCloseSize) => {
			const sessionId = openSession();
			act(() => getPositionMarketCloseActions().setSizingIntent(sessionId, intent));
			const freshPosition = holdFreshPositionRequest();
			let submitPromise!: Promise<void>;

			await act(async () => {
				submitPromise = submitConfirmed(sessionId, { confirmedCloseSize });
				await freshPosition.entered;
			});

			mocks.livePosition = createLivePosition("2.600");
			mocks.restPositionSize = "2.600";
			act(() => root.render(createElement(Probe)));

			await act(async () => {
				freshPosition.release();
				await submitPromise;
			});

			expect(mocks.mutateOrder).not.toHaveBeenCalled();
			expect(mocks.executeOrder).not.toHaveBeenCalled();
			expect(getPositionMarketCloseModal()).toBeNull();
			expect(queueErrorMessages()).toHaveLength(1);
			expect(queueErrorMessages().at(-1)).toBe(localizedMessage("close-size-exceeds-confirmed"));
		},
	);

	it.each([
		["equal to", "2.500", "2.5", "2.5"],
		["equal to a differently formatted", "2.500", "2.5000", "2.5"],
		["below", "2.400", "2.5", "2.4"],
	])(
		"sends a Max close exactly once when the fresh size is %s confirmed size",
		async (_label, restPositionSize, confirmedCloseSize, expectedSize) => {
			mocks.restPositionSize = restPositionSize;
			mocks.executeOrder.mockResolvedValueOnce(createConfirmedResponse(expectedSize));
			const sessionId = openSession();

			await act(async () => {
				await submitConfirmed(sessionId, { confirmedCloseSize });
			});

			expect(mocks.executeOrder).toHaveBeenCalledTimes(1);
			const submitted = mocks.executeOrder.mock.calls[0]?.[0] as OrderParams;
			expect(submitted.orders[0]?.s).toBe(expectedSize);
			expect(queueErrorMessages()).toEqual([]);
		},
	);

	it("keeps a confirmed manual size when the position grows while the fresh position is loading", async () => {
		const sessionId = openSession();
		act(() => getPositionMarketCloseActions().setSizingIntent(sessionId, { kind: "size", value: "1.100" }));
		mocks.executeOrder.mockResolvedValueOnce(createConfirmedResponse("1.1"));
		const freshPosition = holdFreshPositionRequest();
		let submitPromise!: Promise<void>;

		await act(async () => {
			submitPromise = submitConfirmed(sessionId, { confirmedCloseSize: "1.1" });
			await freshPosition.entered;
		});

		mocks.livePosition = createLivePosition("2.600");
		mocks.restPositionSize = "2.600";
		act(() => root.render(createElement(Probe)));

		await act(async () => {
			freshPosition.release();
			await submitPromise;
		});

		expect(mocks.executeOrder).toHaveBeenCalledTimes(1);
		const submitted = mocks.executeOrder.mock.calls[0]?.[0] as OrderParams;
		expect(submitted.orders[0]?.s).toBe("1.1");
		expect(queueErrorMessages()).toEqual([]);
	});

	it.each([
		["null", null],
		["missing", undefined],
		["zero", "0"],
		["negative", "-2.5"],
		["empty", ""],
		["non-numeric", "2.5 BTC"],
	])(
		"fails closed before any request when a confirmation session carries a %s confirmed size",
		async (_label, value) => {
			const sessionId = openSession();

			await act(async () => {
				await currentHook().submit({
					sessionId,
					confirmedCloseSize: value as string | null,
					dismissFutureConfirmation: true,
				});
			});

			expect(mocks.lockRequest).not.toHaveBeenCalled();
			expect(mocks.clearinghouseState).not.toHaveBeenCalled();
			expect(mocks.metaAndAssetCtxs).not.toHaveBeenCalled();
			expect(mocks.mutateOrder).not.toHaveBeenCalled();
			expect(readPositionMarketCloseConfirmationPreference({ owner: USER, env: "Mainnet" })).toBe("required");
			expect(getPositionMarketCloseModal()).toBeNull();
			expect(queueErrorMessages()).toHaveLength(1);
			expect(queueErrorMessages().at(-1)).toBe(localizedMessage("trading-data-changed"));
		},
	);

	it("lets a direct session close from the fresh position without a confirmed size", async () => {
		mocks.restPositionSize = "2.600";
		mocks.livePosition = createLivePosition("2.600");
		mocks.executeOrder.mockResolvedValueOnce(createConfirmedResponse("2.6"));
		const sessionId = openSession({}, "direct");

		await act(async () => {
			await submitConfirmed(sessionId, { confirmedCloseSize: null });
		});

		expect(mocks.executeOrder).toHaveBeenCalledTimes(1);
		const submitted = mocks.executeOrder.mock.calls[0]?.[0] as OrderParams;
		expect(submitted.orders[0]?.s).toBe("2.6");
		expect(getPositionMarketCloseModal()).toBeNull();
	});

	it("fails closed when a direct session claims a confirmed size it never displayed", async () => {
		const sessionId = openSession({}, "direct");

		await act(async () => {
			await submitConfirmed(sessionId, { confirmedCloseSize: "2.5" });
		});

		expect(mocks.lockRequest).not.toHaveBeenCalled();
		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("trading-data-changed"));
	});

	it("fails closed when the fresh REST position changed direction", async () => {
		mocks.restPositionSize = "-2.500";
		const sessionId = openSession();

		await act(async () => {
			await submitConfirmed(sessionId);
		});

		expect(mocks.mutateOrder).not.toHaveBeenCalled();
		expect(mocks.executeOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("no-active-positions"));
		expect(queueErrorMessages()).toHaveLength(1);
	});

	it("rejects a HIP-3 wire asset id that is not bound to the fresh DEX context index", async () => {
		mocks.freshCtxIndex = 0;
		const sessionId = openSession();

		await act(async () => {
			await submitConfirmed(sessionId);
		});

		expect(mocks.clearinghouseState).toHaveBeenCalledOnce();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("trading-data-changed"));
	});

	it("keeps a reconciling session dismissed and ignores retry attempts", async () => {
		mocks.executeOrder.mockRejectedValueOnce(new HttpRequestError({ detail: "Request timed out after 10000 ms" }));
		const sessionId = openSession();

		await act(async () => {
			await submitConfirmed(sessionId);
		});

		expect(getPositionMarketCloseModal()).toMatchObject({ sessionId, phase: "reconciling", presentation: "dismissed" });
		expect(queueItems.at(-1)?.status).toBe("confirming");
		expect(mocks.toastWarning).not.toHaveBeenCalled();
		const restCalls = mocks.clearinghouseState.mock.calls.length;
		const mutationCalls = mocks.mutateOrder.mock.calls.length;

		await act(async () => {
			await submitConfirmed(sessionId);
		});

		expect(mocks.clearinghouseState).toHaveBeenCalledTimes(restCalls);
		expect(mocks.mutateOrder).toHaveBeenCalledTimes(mutationCalls);
		expect(getPositionMarketCloseModal()?.phase).toBe("reconciling");
	});

	it("keeps a non-filled market-order response in reconciliation", async () => {
		mocks.executeOrder.mockResolvedValueOnce({
			status: "ok",
			response: { type: "order", data: { statuses: [{ resting: { oid: 5 } }] } },
		});
		const sessionId = openSession();

		await act(async () => {
			await submitConfirmed(sessionId);
		});

		expect(getPositionMarketCloseModal()).toMatchObject({ sessionId, phase: "reconciling", presentation: "dismissed" });
		expect(queueItems.at(-1)?.status).toBe("confirming");
		expect(mocks.toastWarning).not.toHaveBeenCalled();
		expect(hasPendingOrderForAssets("Mainnet", USER, [ASSET_ID])).toBe(true);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	it("revalidates the latest live position at the SDK execution boundary", async () => {
		const sessionId = openSession();
		const gate = createExecutionGate();
		mocks.betweenExecutionGuards = gate.wait;
		let submitPromise!: Promise<void>;

		await act(async () => {
			submitPromise = submitConfirmed(sessionId);
			await gate.entered;
		});
		expect(mocks.guardCalls).toBe(1);

		mocks.livePosition = createLivePosition("-2.500");
		act(() => root.render(createElement(Probe)));

		await act(async () => {
			gate.release();
			await submitPromise;
		});

		expect(mocks.guardCalls).toBe(2);
		expect(mocks.executeOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("trading-data-changed"));
	});

	it("fails closed when the live position size changes after a percentage close is planned", async () => {
		const sessionId = openSession();
		act(() => getPositionMarketCloseActions().setSizingIntent(sessionId, { kind: "percent", value: "50" }));
		const gate = createExecutionGate();
		mocks.betweenExecutionGuards = gate.wait;
		let submitPromise!: Promise<void>;

		await act(async () => {
			submitPromise = submitConfirmed(sessionId, { confirmedCloseSize: "1.25" });
			await gate.entered;
		});
		expect(mocks.guardCalls).toBe(1);

		mocks.livePosition = createLivePosition("1.500");
		act(() => root.render(createElement(Probe)));

		await act(async () => {
			gate.release();
			await submitPromise;
		});

		expect(mocks.guardCalls).toBe(2);
		expect(mocks.executeOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("trading-data-changed"));
	});

	it("blocks when an active TWAP appears at the SDK execution boundary", async () => {
		const sessionId = openSession();
		const gate = createExecutionGate();
		mocks.betweenExecutionGuards = gate.wait;
		let submitPromise!: Promise<void>;

		await act(async () => {
			submitPromise = submitConfirmed(sessionId);
			await gate.entered;
		});
		expect(mocks.guardCalls).toBe(1);

		mocks.activeTwapCoins = [COIN];
		act(() => root.render(createElement(Probe)));

		await act(async () => {
			gate.release();
			await submitPromise;
		});

		expect(mocks.guardCalls).toBe(2);
		expect(mocks.executeOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("blocked-market"));
	});

	it("revalidates the latest modal session at the SDK execution boundary", async () => {
		const sessionId = openSession();
		const gate = createExecutionGate();
		mocks.betweenExecutionGuards = gate.wait;
		let submitPromise!: Promise<void>;

		await act(async () => {
			submitPromise = submitConfirmed(sessionId);
			await gate.entered;
		});
		expect(mocks.guardCalls).toBe(1);

		act(() => getPositionMarketCloseActions().updatePhase(sessionId, "reconciling"));

		await act(async () => {
			gate.release();
			await submitPromise;
		});

		expect(mocks.guardCalls).toBe(2);
		expect(mocks.executeOrder).not.toHaveBeenCalled();
		expect(getPositionMarketCloseModal()).toBeNull();
		expect(queueErrorMessages().at(-1)).toBe(localizedMessage("trading-data-changed"));
	});
});
