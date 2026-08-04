// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PositionCloseAllSnapshot } from "@/domain/trade/position-close-all";
import { usePositionCloseAllSubmit } from "@/hooks/trade/use-position-close-all-submit";
import { getPendingOrderActions, hasPendingOrderForAssets } from "@/stores/use-pending-order-store";
import { getPendingTwapActions } from "@/stores/use-pending-twap-store";
import { createI18nRoot } from "./harness/react";

const USER = "0x1111111111111111111111111111111111111111" as const;
const MAIN_COIN = "BTC";
const BUILDER_COIN = "xyz:CXMT";
const MAIN_ASSET_ID = 1;
const BUILDER_ASSET_ID = 120_031;

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

function Probe() {
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
				markPx: "100",
				marginMode: "cross",
				quoteSymbol: "USDC",
			},
			{
				coin: BUILDER_COIN,
				dex: "xyz",
				assetId: BUILDER_ASSET_ID,
				szDecimals: 3,
				signedPositionSize: "-2.500",
				markPx: "200",
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
		expect(mocks.clearinghouseState.mock.calls.map(([params]) => params)).toEqual(
			expect.arrayContaining([
				{ user: USER, dex: "" },
				{ user: USER, dex: "xyz" },
			]),
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
		expect(currentHook().error).toContain("1 of 2 close orders were accepted");
		await act(async () => {
			expect(await currentHook().submit()).toEqual({ state: "blocked" });
		});
		expect(mocks.clearinghouseState).toHaveBeenCalledTimes(2);
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
		const refreshCount = mocks.clearinghouseState.mock.calls.length;
		await act(async () => {
			expect(await currentHook().submit()).toEqual({ state: "blocked" });
		});
		expect(mocks.clearinghouseState).toHaveBeenCalledTimes(refreshCount);
	});
});
