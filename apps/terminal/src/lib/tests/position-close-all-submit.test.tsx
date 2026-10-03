// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PositionCloseAllSnapshot } from "@/domain/trade/position-close-all";
import { usePositionCloseAllSubmit } from "@/hooks/trade/use-position-close-all-submit";
import { getNumberFormatters } from "@/lib/format";
import { getOrderNotificationCopy } from "@/lib/trade/order-notification-copy";
import {
	getOrderQueueItem,
	type OrderQueueItem,
	removeOrderQueueItem,
	useOrderQueue,
} from "@/stores/use-order-queue-store";
import {
	getPendingOrderActions,
	hasPendingOrderForAssets,
	type PendingOrderSubmission,
	usePendingOrderSubmissions,
} from "@/stores/use-pending-order-store";
import { getPendingTwapActions } from "@/stores/use-pending-twap-store";
import { createI18nRoot } from "./harness/react";

const USER = "0x1111111111111111111111111111111111111111" as const;
const MAIN_COIN = "BTC";
const BUILDER_COIN = "xyz:CXMT";
const MAIN_ASSET_ID = 1;
const BUILDER_ASSET_ID = 120_031;
const PARTIAL_MESSAGE =
	"{acceptedCount} of {totalCount} close orders were fully filled. Review positions before retrying.";
const PARTIAL_MESSAGE_AR =
	"تم تنفيذ {acceptedCount} من أصل {totalCount} من أوامر الإغلاق. راجع المراكز قبل إعادة المحاولة.";
const BELOW_PRECISION_MESSAGE = "Position size is below market precision";
const BELOW_PRECISION_MESSAGE_AR = "حجم المركز أقل من دقة السوق";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(PARTIAL_MESSAGE)]: PARTIAL_MESSAGE_AR,
	[getMessageId(BELOW_PRECISION_MESSAGE)]: BELOW_PRECISION_MESSAGE_AR,
};

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
	positionLoading: false,
	positionError: false,
	positionStale: false,
	twapStatus: "active" as "active" | "connecting" | "error" | "idle",
	twapStale: false,
	activeTwapCoins: [] as string[],
	livePositions: [] as LivePosition[],
	freshSizes: new Map<string, string>(),
	confirmationSizes: new Map<string, string>(),
	freshMarginModes: new Map<string, "cross" | "isolated">(),
	orderSubmitted: false,
	clearinghouseState: vi.fn(),
	metaAndAssetCtxs: vi.fn(),
	mutateOrder: vi.fn(),
	executeOrder: vi.fn(),
	resetMutation: vi.fn(),
	executionGuard: undefined as ((params: OrderParams) => void) | undefined,
	lockRequest: vi.fn(),
	hip3Accepted: true,
}));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/use-global-settings-store")>();
	return { ...actual, useMarketOrderSlippageBpsString: () => "50" };
});

vi.mock("@/lib/hyperliquid", () => ({
	parseAssetId: (assetId: number) => {
		if (assetId >= 100_000) {
			const adjusted = assetId - 100_000;
			return { kind: "builderPerp", dexIndex: Math.floor(adjusted / 10_000), index: adjusted % 10_000 };
		}
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
		isLoading: false,
		error: null,
		getMarket: (coin: string) => {
			if (coin === MAIN_COIN) {
				return { kind: "perp", name: coin, assetId: MAIN_ASSET_ID, szDecimals: 3, ctxIndex: 1 };
			}
			if (coin === BUILDER_COIN) {
				return {
					kind: "builderPerp",
					name: coin,
					assetId: BUILDER_ASSET_ID,
					szDecimals: 3,
					dex: "xyz",
					ctxIndex: 31,
					dexIndex: 2,
					quoteToken: { index: 7, name: "USDE", displayName: "USDE" },
				};
			}
			return undefined;
		},
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
		positions: mocks.livePositions,
		isLoading: mocks.positionLoading,
		hasError: mocks.positionError,
		isStale: mocks.positionStale,
		getPosition: (coin: string, dex: string) =>
			mocks.livePositions.find((position) => position.coin === coin && position.dex === dex) ?? null,
	}),
}));

vi.mock("@/stores/use-hip3-disclaimer-store", () => ({
	hasAcceptedHip3Disclaimer: () => mocks.hip3Accepted,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let currentSnapshot = createSnapshot();
let hookValue: ReturnType<typeof usePositionCloseAllSubmit> | null = null;

let queueItems: OrderQueueItem[] = [];
let pendingSubmissions: PendingOrderSubmission[] = [];

function Probe() {
	queueItems = useOrderQueue();
	pendingSubmissions = usePendingOrderSubmissions();
	hookValue = usePositionCloseAllSubmit(currentSnapshot);
	return null;
}

function createSnapshot(): PositionCloseAllSnapshot {
	return {
		owner: USER,
		env: "Mainnet",
		capturedAtMs: Date.now(),
		summaryTotals: [
			{ quoteSymbol: "USDC", totalNotional: "125", estimatedPnl: "5" },
			{ quoteSymbol: "USDE", totalNotional: "500", estimatedPnl: "7.5" },
		],
		targets: [
			{
				coin: MAIN_COIN,
				dex: "",
				assetId: MAIN_ASSET_ID,
				szDecimals: 3,
				signedPositionSize: "1.250",
				marginMode: "cross",
				quoteSymbol: "USDC",
			},
			{
				coin: BUILDER_COIN,
				dex: "xyz",
				assetId: BUILDER_ASSET_ID,
				szDecimals: 3,
				signedPositionSize: "-2.500",
				marginMode: "isolated",
				quoteSymbol: "USDE",
			},
		],
	};
}

function createLivePositions(): LivePosition[] {
	return [
		{ coin: MAIN_COIN, dex: "", szi: "1.250", leverage: { type: "cross", value: 10 } },
		{ coin: BUILDER_COIN, dex: "xyz", szi: "-2.500", leverage: { type: "isolated", value: 10 } },
	];
}

function createConfirmedResponse() {
	return {
		status: "ok",
		response: {
			type: "order",
			data: {
				statuses: [
					{ filled: { totalSz: "1.25", avgPx: "99.5", oid: 1 } },
					{ filled: { totalSz: "2.5", avgPx: "201", oid: 2 } },
				],
			},
		},
	};
}

function currentHook(): ReturnType<typeof usePositionCloseAllSubmit> {
	if (!hookValue) throw new Error("Expected close-all submit hook");
	return hookValue;
}

describe("usePositionCloseAllSubmit", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
		window.localStorage.clear();
		currentSnapshot = createSnapshot();
		mocks.clientKey = USER;
		mocks.env = "Mainnet";
		mocks.positionLoading = false;
		mocks.positionError = false;
		mocks.positionStale = false;
		mocks.twapStatus = "active";
		mocks.twapStale = false;
		mocks.activeTwapCoins = [];
		mocks.livePositions = createLivePositions();
		mocks.freshSizes = new Map([
			[MAIN_COIN, "1.250"],
			[BUILDER_COIN, "-2.500"],
		]);
		mocks.confirmationSizes = new Map([
			[MAIN_COIN, "0"],
			[BUILDER_COIN, "0"],
		]);
		mocks.orderSubmitted = false;
		mocks.freshMarginModes = new Map([
			[MAIN_COIN, "cross"],
			[BUILDER_COIN, "isolated"],
		]);
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
		mocks.executionGuard = undefined;
		mocks.clearinghouseState.mockReset().mockImplementation(async ({ dex }: { dex: string }) => {
			const coin = dex === "xyz" ? BUILDER_COIN : MAIN_COIN;
			const sizes = mocks.orderSubmitted ? mocks.confirmationSizes : mocks.freshSizes;
			return {
				assetPositions: [
					{
						position: {
							coin,
							szi: sizes.get(coin),
							leverage: { type: mocks.freshMarginModes.get(coin), value: 10 },
						},
					},
				],
			};
		});
		mocks.metaAndAssetCtxs.mockReset().mockImplementation(async ({ dex }: { dex: string }) => {
			const isBuilder = dex === "xyz";
			const index = isBuilder ? 31 : 1;
			const coin = isBuilder ? BUILDER_COIN : MAIN_COIN;
			const universe = Array.from({ length: index + 1 }, (_, itemIndex) => ({
				name: itemIndex === index ? coin : `OTHER-${dex}-${itemIndex}`,
				szDecimals: 3,
			}));
			const contexts = universe.map((_, itemIndex) => ({
				markPx: itemIndex === index ? (isBuilder ? "200" : "100") : "1",
				midPx: null,
			}));
			return [{ universe, collateralToken: isBuilder ? 7 : 0 }, contexts];
		});
		mocks.executeOrder.mockReset().mockResolvedValue(createConfirmedResponse());
		mocks.mutateOrder.mockReset().mockImplementation(async (params: OrderParams) => {
			mocks.executionGuard?.(params);
			const result = await mocks.executeOrder(params);
			mocks.orderSubmitted = true;
			return result;
		});
		mocks.resetMutation.mockReset();
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
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
	});

	it("submits one guarded reduce-only FrontendMarket batch across DEXs", async () => {
		let outcome: Awaited<ReturnType<ReturnType<typeof usePositionCloseAllSubmit>["submit"]>> | undefined;
		await act(async () => {
			outcome = await currentHook().submit();
		});

		expect(outcome?.state).toBe("confirmed");
		expect(queueItems).toHaveLength(1);
		expect(queueItems[0]).toMatchObject({
			operation: "close-all",
			owner: USER,
			env: "Mainnet",
			status: "success",
			countMode: "filled",
			acceptedCount: 2,
			totalCount: 2,
			positionsClosed: true,
		});
		expect(mocks.clearinghouseState.mock.calls.map(([params]) => params)).toEqual(
			expect.arrayContaining([
				{ user: USER, dex: "" },
				{ user: USER, dex: "xyz" },
			]),
		);
		expect(mocks.metaAndAssetCtxs.mock.calls.map(([params]) => params)).toEqual(
			expect.arrayContaining([{ dex: "" }, { dex: "xyz" }]),
		);
		const submitted = mocks.executeOrder.mock.calls[0]?.[0] as OrderParams;
		expect(submitted).toMatchObject({
			grouping: "na",
			orders: [
				{ a: MAIN_ASSET_ID, b: false, p: "99.5", s: "1.25", r: true, t: { limit: { tif: "FrontendMarket" } } },
				{
					a: BUILDER_ASSET_ID,
					b: true,
					p: "201",
					s: "2.5",
					r: true,
					t: { limit: { tif: "FrontendMarket" } },
				},
			],
		});
		expect(currentHook()).toMatchObject({ phase: "idle", isPartial: false, isReconciling: false, error: null });
		expect(hasPendingOrderForAssets("Mainnet", USER, [MAIN_ASSET_ID, BUILDER_ASSET_ID])).toBe(false);
	});

	it("reports a partial batch without presenting atomic success and blocks retry in the stale dialog", async () => {
		mocks.executeOrder.mockRejectedValueOnce({
			name: "ApiRequestError",
			response: {
				status: "ok",
				response: {
					type: "order",
					data: {
						statuses: [
							{ filled: { totalSz: "1.25", avgPx: "99.5", oid: 1 } },
							{ error: "No liquidity available for market order." },
						],
					},
				},
			},
		});

		let outcome: Awaited<ReturnType<ReturnType<typeof usePositionCloseAllSubmit>["submit"]>> | undefined;
		await act(async () => {
			outcome = await currentHook().submit();
		});

		expect(outcome).toMatchObject({ state: "partial", acceptedCount: 1, rejectedCount: 1, totalCount: 2 });
		expect(currentHook()).toMatchObject({ phase: "partial", isPartial: true });
		expect(currentHook().error).toContain("1 of 2 close orders were fully filled");
		expect(queueItems[0]).toMatchObject({
			status: "partial",
			countMode: "filled",
			acceptedCount: 1,
			totalCount: 2,
			children: [
				{ assetId: MAIN_ASSET_ID, market: MAIN_COIN, size: "1.25", filledSize: "1.25", status: "filled" },
				{
					assetId: BUILDER_ASSET_ID,
					market: BUILDER_COIN,
					size: "2.5",
					status: "rejected",
					error: "No liquidity available for market order.",
				},
			],
		});
		await act(async () => {
			expect(await currentHook().submit()).toEqual({ state: "blocked" });
		});
		expect(mocks.clearinghouseState).toHaveBeenCalledTimes(2);
	});

	it("reports each rejected market once, on its own line, when every close order is rejected", async () => {
		mocks.executeOrder.mockRejectedValueOnce({
			name: "ApiRequestError",
			response: {
				status: "ok",
				response: {
					type: "order",
					data: {
						statuses: [
							{ error: "No liquidity available for market order." },
							{ error: "A rejection nobody documented" },
						],
					},
				},
			},
		});

		await act(async () => {
			await expect(currentHook().submit()).rejects.toThrow();
		});

		expect(queueItems[0]).toMatchObject({
			status: "failed",
			error: {
				kind: "exchange-error",
				entries: [
					{ index: 0, text: "No liquidity available for market order." },
					{ index: 1, text: "A rejection nobody documented" },
				],
			},
			children: [
				{ market: MAIN_COIN, status: "rejected", error: "No liquidity available for market order." },
				{ market: BUILDER_COIN, status: "rejected", error: "A rejection nobody documented" },
			],
		});
		const failed = queueItems[0];
		if (!failed) throw new Error("Expected the close-all notification");
		expect(
			getOrderNotificationCopy(failed, (descriptor) => i18n._(descriptor), getNumberFormatters()).error,
		).toBeUndefined();
		expect(currentHook().error).toBe(
			"Order 1: No liquidity is available for this market order.; Order 2: A rejection nobody documented",
		);
	});

	it("retranslates an existing partial result with its counts when the locale changes", async () => {
		mocks.executeOrder.mockRejectedValueOnce({
			name: "ApiRequestError",
			response: {
				status: "ok",
				response: {
					type: "order",
					data: {
						statuses: [
							{ filled: { totalSz: "1.25", avgPx: "99.5", oid: 1 } },
							{ error: "No liquidity available for market order." },
						],
					},
				},
			},
		});

		await act(async () => {
			await currentHook().submit();
		});
		expect(currentHook().error).toContain("1 of 2 close orders were fully filled");

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		expect(currentHook().error).toBe("تم تنفيذ 1 من أصل 2 من أوامر الإغلاق. راجع المراكز قبل إعادة المحاولة.");
		expect(currentHook().phase).toBe("partial");
		expect(mocks.executeOrder).toHaveBeenCalledOnce();
	});

	it("retranslates a stored close-plan validation error when the locale changes", async () => {
		const snapshot = createSnapshot();
		currentSnapshot = {
			...snapshot,
			targets: snapshot.targets.map((target) =>
				target.coin === MAIN_COIN ? { ...target, signedPositionSize: "0.0001" } : target,
			),
		};
		mocks.livePositions = createLivePositions().map((position) =>
			position.coin === MAIN_COIN ? { ...position, szi: "0.0001" } : position,
		);
		mocks.freshSizes.set(MAIN_COIN, "0.0001");
		act(() => root.render(createElement(Probe)));

		let submissionError: unknown;
		await act(async () => {
			try {
				await currentHook().submit();
			} catch (cause) {
				submissionError = cause;
			}
		});
		expect(submissionError).toEqual(expect.objectContaining({ message: BELOW_PRECISION_MESSAGE }));
		expect(currentHook().error).toBe(BELOW_PRECISION_MESSAGE);
		expect(mocks.mutateOrder).not.toHaveBeenCalled();

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		expect(currentHook().error).toBe(BELOW_PRECISION_MESSAGE_AR);
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
	});

	it("keeps reconciliation and the exclusive locks when filled orders do not leave every target flat", async () => {
		mocks.confirmationSizes.set(MAIN_COIN, "0.10");

		let outcome: Awaited<ReturnType<ReturnType<typeof usePositionCloseAllSubmit>["submit"]>> | undefined;
		await act(async () => {
			outcome = await currentHook().submit();
		});

		expect(outcome?.state).toBe("reconciling");
		expect(currentHook()).toMatchObject({ phase: "reconciling", isReconciling: true });
		expect(hasPendingOrderForAssets("Mainnet", USER, [MAIN_ASSET_ID, BUILDER_ASSET_ID])).toBe(true);
		expect(mocks.clearinghouseState).toHaveBeenCalledTimes(4);
		expect(queueItems[0]).toMatchObject({
			status: "confirming",
			children: [{ status: "filled" }, { status: "filled" }],
		});
		expect(queueItems[0]?.positionsClosed).not.toBe(true);
	});

	it("retains filled-order evidence and reconciliation when the owner unmounts before the SDK responds", async () => {
		let release!: (value: ReturnType<typeof createConfirmedResponse>) => void;
		mocks.executeOrder.mockReturnValueOnce(
			new Promise((resolve) => {
				release = resolve;
			}),
		);
		let submission!: ReturnType<ReturnType<typeof usePositionCloseAllSubmit>["submit"]>;
		await act(async () => {
			submission = currentHook().submit();
		});
		expect(mocks.executeOrder).toHaveBeenCalledOnce();
		const queueId = queueItems[0]?.id;
		act(() => root.render(null));
		await act(async () => {
			release(createConfirmedResponse());
			await expect(submission).resolves.toMatchObject({ state: "reconciling" });
		});
		expect(getOrderQueueItem(queueId)).toMatchObject({
			owner: USER,
			env: "Mainnet",
			status: "confirming",
			children: [
				{ status: "filled", filledSize: "1.25" },
				{ status: "filled", filledSize: "2.5" },
			],
		});
		expect(getOrderQueueItem(queueId)?.positionsClosed).not.toBe(true);
		expect(hasPendingOrderForAssets("Mainnet", USER, [MAIN_ASSET_ID, BUILDER_ASSET_ID])).toBe(true);
		expect(mocks.clearinghouseState).toHaveBeenCalledTimes(2);
	});

	it("reports an incomplete filled quantity instead of claiming all positions closed", async () => {
		mocks.executeOrder.mockResolvedValueOnce({
			status: "ok",
			response: {
				type: "order",
				data: {
					statuses: [
						{ filled: { totalSz: "0.25", avgPx: "99.5", oid: 1 } },
						{ filled: { totalSz: "2.5", avgPx: "201", oid: 2 } },
					],
				},
			},
		});

		let outcome: Awaited<ReturnType<ReturnType<typeof usePositionCloseAllSubmit>["submit"]>> | undefined;
		await act(async () => {
			outcome = await currentHook().submit();
		});

		expect(outcome).toMatchObject({ state: "partial", acceptedCount: 1, rejectedCount: 1, totalCount: 2 });
		expect(currentHook()).toMatchObject({ phase: "partial", isPartial: true });
		expect(mocks.clearinghouseState).toHaveBeenCalledTimes(2);
		expect(queueItems[0]).toMatchObject({
			status: "partial",
			acceptedCount: 1,
			totalCount: 2,
			children: [
				{ status: "partial", filledSize: "0.25", size: "1.25" },
				{ status: "filled", filledSize: "2.5" },
			],
		});
	});

	it("shows one pending batch before refreshing data and attributes an identity-change failure to its original account", async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const original = mocks.clearinghouseState.getMockImplementation();
		mocks.clearinghouseState.mockImplementationOnce(async (params) => {
			await gate;
			return original?.(params);
		});
		let submission!: Promise<unknown>;
		await act(async () => {
			submission = currentHook()
				.submit()
				.catch((error: unknown) => error);
		});
		expect(queueItems).toHaveLength(1);
		const queueId = queueItems[0]?.id;
		expect(queueItems[0]).toMatchObject({
			status: "pending",
			operation: "close-all",
			owner: USER,
			env: "Mainnet",
			children: [
				{ market: MAIN_COIN, size: "1.25" },
				{ market: BUILDER_COIN, size: "2.5" },
			],
		});
		expect(mocks.executeOrder).not.toHaveBeenCalled();
		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		mocks.env = "Testnet";
		act(() => root.render(createElement(Probe)));
		await act(async () => {
			release();
			await submission;
		});
		expect(queueItems).toHaveLength(1);
		expect(queueItems[0]).toMatchObject({ id: queueId, status: "failed", owner: USER, env: "Mainnet" });
		expect(mocks.executeOrder).not.toHaveBeenCalled();
	});

	it("reports partial execution when no target filled completely", async () => {
		mocks.executeOrder.mockResolvedValueOnce({
			status: "ok",
			response: {
				type: "order",
				data: {
					statuses: [
						{ filled: { totalSz: "0.25", avgPx: "99.5", oid: 1 } },
						{ filled: { totalSz: "0.5", avgPx: "201", oid: 2 } },
					],
				},
			},
		});
		let outcome: unknown;
		await act(async () => {
			outcome = await currentHook().submit();
		});
		expect(outcome).toMatchObject({ state: "partial", acceptedCount: 0, totalCount: 2 });
		expect(queueItems[0]).toMatchObject({
			status: "partial",
			acceptedCount: 0,
			totalCount: 2,
			children: [
				{ status: "partial", filledSize: "0.25" },
				{ status: "partial", filledSize: "0.5" },
			],
		});
	});

	it("rejects an expired preview before acquiring locks or refreshing account state", async () => {
		currentSnapshot = { ...createSnapshot(), capturedAtMs: Date.now() - 31_000 };
		act(() => root.render(createElement(Probe)));

		await expect(
			act(async () => {
				await currentHook().submit();
			}),
		).rejects.toThrow("preview expired");
		expect(mocks.lockRequest).not.toHaveBeenCalled();
		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
	});

	it("fails closed before REST when the visible position set changes", async () => {
		mocks.livePositions = [mocks.livePositions[0] as LivePosition];
		act(() => root.render(createElement(Probe)));

		await expect(
			act(async () => {
				await currentHook().submit();
			}),
		).rejects.toThrow("Positions changed");
		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
	});

	it("blocks an active TWAP before refreshing either DEX", async () => {
		mocks.activeTwapCoins = [BUILDER_COIN];
		act(() => root.render(createElement(Probe)));

		await expect(
			act(async () => {
				await currentHook().submit();
			}),
		).rejects.toThrow("A TWAP is active");
		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
	});

	it("keeps an ambiguous batch in reconciliation and prevents duplicate submission", async () => {
		mocks.executeOrder.mockResolvedValueOnce({
			status: "ok",
			response: {
				type: "order",
				data: { statuses: [{ resting: { oid: 1 } }, { resting: { oid: 2 } }] },
			},
		});
		let outcome: Awaited<ReturnType<ReturnType<typeof usePositionCloseAllSubmit>["submit"]>> | undefined;
		await act(async () => {
			outcome = await currentHook().submit();
		});

		expect(outcome?.state).toBe("reconciling");
		expect(currentHook()).toMatchObject({ phase: "reconciling", isReconciling: true });
		expect(hasPendingOrderForAssets("Mainnet", USER, [MAIN_ASSET_ID, BUILDER_ASSET_ID])).toBe(true);
		expect(queueItems[0]).toMatchObject({
			status: "confirming",
			countMode: "filled",
			children: [{ status: "accepted" }, { status: "accepted" }],
		});
		expect(pendingSubmissions[0]).toMatchObject({
			queueId: queueItems[0]?.id,
			feedback: {
				operation: "close-all",
				countMode: "filled",
				children: [
					{ market: MAIN_COIN, size: "1.25" },
					{ market: BUILDER_COIN, size: "2.5" },
				],
			},
		});
		const refreshCount = mocks.clearinghouseState.mock.calls.length;
		await act(async () => {
			expect(await currentHook().submit()).toEqual({ state: "blocked" });
		});
		expect(mocks.clearinghouseState).toHaveBeenCalledTimes(refreshCount);
	});
});
