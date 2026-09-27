// @vitest-environment jsdom

import type { CompactSubscriptionClient } from "@gatu/hl-react";
import {
	HyperliquidStoreContext,
	HyperliquidTransportContext,
	type HyperliquidTransportContextValue,
} from "@gatu/hl-react/provider";
import { createHyperliquidStore, type HyperliquidStore } from "@gatu/hl-react/store";
import type { InfoClient } from "@nktkas/hyperliquid";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import { createI18nRoot } from "./harness/react";

const USER = "0x00000000000000000000000000000000000000aa";

const testState = vi.hoisted(() => ({
	address: "0x00000000000000000000000000000000000000aa" as string | undefined,
	isConnected: true,
	liveSubscriptions: false,
	ledgerEvent: undefined as unknown,
	webData3: {
		data: undefined as unknown,
		status: "active" as "idle" | "subscribing" | "active" | "error",
		isStale: false,
	},
	subscriptionCalls: [] as unknown[][],
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: testState.address, isConnected: testState.isConnected }),
}));

vi.mock("@/lib/hyperliquid", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/hyperliquid")>();
	const liveSubscription = actual.useSubscription as (method: string, params: unknown, options: unknown) => unknown;
	return {
		...actual,
		useInfo: () => ({ data: undefined, status: "pending" }),
		useSubscription: (method: string, params: unknown, options: unknown) => {
			testState.subscriptionCalls.push([method, params, options]);
			if (testState.liveSubscriptions) return liveSubscription(method, params, options);
			if (method === "userNonFundingLedgerUpdates") {
				return {
					data: testState.ledgerEvent,
					status: "active",
					isStale: false,
					error: null,
					lastMessageAt: 1,
					unsubscribe: undefined,
				};
			}
			if (method === "webData3") {
				return {
					data: testState.webData3.data,
					status: testState.webData3.status,
					isStale: testState.webData3.isStale,
					error: null,
					lastMessageAt: 1,
					unsubscribe: undefined,
				};
			}
			return {
				data: undefined,
				status: "subscribing",
				isStale: false,
				error: null,
				lastMessageAt: undefined,
				unsubscribe: undefined,
			};
		},
	};
});

vi.mock("@/lib/hyperliquid/hooks/useMarketsInfo", () => ({ useSelectedMarketInfo: () => ({ data: undefined }) }));

vi.mock("@/hooks/trade/use-asset-leverage", () => ({
	useAssetLeverage: () => ({
		transactionIdentity: "Mainnet:0",
		displayLeverage: 10,
		currentLeverage: 10,
		pendingLeverage: null,
		committedLeverage: null,
		maxLeverage: 50,
		setPendingLeverage: vi.fn(),
		resetPending: vi.fn(),
		maxTradeSzs: [10, 10],
		maxTradeSzsRaw: ["10", "10"],
		availableToTrade: [1_000, 1_000],
		marginMode: "cross",
		hasPosition: false,
		positionStateReady: true,
		switchMarginMode: vi.fn(),
		applyMarginAndLeverage: vi.fn(),
		isUpdating: false,
		updateError: null,
		isSwitchingMode: false,
		switchModeError: null,
		isOnlyIsolated: false,
		allowsCrossMargin: true,
		allowsIsolatedMarginRemoval: false,
		subscriptionStatus: "success",
		subscriptionReceivedAt: 1,
	}),
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => ({ setSize: vi.fn(), setSizeSelection: vi.fn(), setSizeMode: vi.fn() }),
	useOrderSizeSource: () => null,
	useOrderType: () => "limit",
}));

import { type AccountBalances, useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";

const PERP_MARKET = {
	kind: "perp",
	name: "BTC",
	pairName: "BTC-USDC",
	assetId: 0,
	szDecimals: 3,
} as UnifiedMarketInfo;

const BUILDER_MARKET = {
	kind: "builderPerp",
	name: "km:AAPL",
	pairName: "AAPL-USDH",
	assetId: 110_000,
	szDecimals: 2,
	dex: "km",
} as UnifiedMarketInfo;

const SPOT_MARKET = {
	kind: "spot",
	name: "@107",
	pairName: "HYPE/USDC",
	assetId: 10_107,
	szDecimals: 2,
	tokensInfo: [{ name: "HYPE" }, { name: "USDC" }],
} as unknown as UnifiedMarketInfo;

function webData3Event(capped: string[][], user = USER) {
	return {
		userState: { agentAddress: null, agentValidUntil: null, cumLedger: "0", serverTime: 1, isVault: false, user },
		perpDexStates: capped.map((coins) => ({ totalVaultEquity: "0", perpsAtOpenInterestCap: coins })),
	};
}

function ledgerUpdate(time: number, hash: string) {
	return { time, hash, delta: { type: "deposit", usdc: "1" } };
}

function ledgerEvent(updates: ReturnType<typeof ledgerUpdate>[], isSnapshot = false) {
	return { user: USER, isSnapshot, nonFundingLedgerUpdates: updates };
}

interface ProbeResult {
	balances: AccountBalances;
	isOpenInterestCapped: boolean;
}

function Probe({ market, onRender }: { market: UnifiedMarketInfo; onRender: (result: ProbeResult) => void }) {
	const balances = useDefaultDexBalances();
	const orderEntry = useOrderEntryData({
		market,
		side: "buy",
		markPx: 100,
		sizeMode: "base",
		sizeInput: "1",
		limitPx: 100,
		marketOrderSizing: null,
	});
	onRender({ balances, isOpenInterestCapped: orderEntry.isOpenInterestCapped });
	return null;
}

describe("open-interest cap account data flow", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.address = USER;
		testState.isConnected = true;
		testState.ledgerEvent = ledgerEvent([ledgerUpdate(7, "0x07")]);
		testState.webData3 = {
			data: webData3Event([["CANTO"], ["km:AAPL", "BTC"]]),
			status: "active",
			isStale: false,
		};
		testState.subscriptionCalls = [];
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render(market: UnifiedMarketInfo = PERP_MARKET): ProbeResult {
		let result: ProbeResult | undefined;
		testState.subscriptionCalls = [];
		act(() =>
			root.render(
				createElement(Probe, {
					market,
					onRender: (next: ProbeResult) => {
						result = next;
					},
				}),
			),
		);
		if (!result) throw new Error("Probe did not render");
		return result;
	}

	it("reads the cap from the existing webData3 subscription keyed by the ledger refresh key", () => {
		const result = render();
		const webData3Calls = testState.subscriptionCalls.filter(([method]) => method === "webData3");

		expect(result.balances.perpsAtOpenInterestCap).toEqual(["CANTO", "km:AAPL", "BTC"]);
		expect(webData3Calls.length).toBeGreaterThan(0);
		for (const call of webData3Calls) {
			expect(call).toEqual(["webData3", { user: USER }, { enabled: true, refreshKey: "7:0x07:1" }]);
		}
	});

	it.each([
		["perp", PERP_MARKET, true],
		["HIP-3", BUILDER_MARKET, true],
		["spot", SPOT_MARKET, false],
	])("flags a listed %s market only when it can be capped", (_label, market, expected) => {
		expect(render(market).isOpenInterestCapped).toBe(expected);
	});

	it("does not flag a perp that the snapshot does not list", () => {
		testState.webData3.data = webData3Event([["CANTO"], ["km:AAPL"]]);
		expect(render(PERP_MARKET).isOpenInterestCapped).toBe(false);
		expect(render(PERP_MARKET).balances.perpsAtOpenInterestCap).toEqual(["CANTO", "km:AAPL"]);
	});

	it.each([
		["subscribing", () => Object.assign(testState.webData3, { status: "subscribing" })],
		["failed", () => Object.assign(testState.webData3, { status: "error" })],
		["stale", () => Object.assign(testState.webData3, { isStale: true })],
		["missing", () => Object.assign(testState.webData3, { data: undefined })],
		[
			"another account's",
			() => Object.assign(testState.webData3, { data: webData3Event([["BTC"]], `0x${"b".repeat(40)}`) }),
		],
		[
			"disconnected",
			() => {
				testState.isConnected = false;
			},
		],
	])("treats a %s snapshot as unknown and never flags the market", (_label, arrange) => {
		arrange();
		const result = render(PERP_MARKET);

		expect(result.balances.perpsAtOpenInterestCap).toBeNull();
		expect(result.isOpenInterestCapped).toBe(false);
	});
});

const LIVE_METHODS = ["userNonFundingLedgerUpdates", "webData3", "allDexsClearinghouseState", "spotState"] as const;

interface LiveSubscription {
	method: (typeof LIVE_METHODS)[number];
	params: unknown;
	listener: (event: unknown) => void;
}

function createLiveSubscriptionClient(subscriptions: LiveSubscription[]): CompactSubscriptionClient {
	return Object.fromEntries(
		LIVE_METHODS.map((method) => [
			method,
			async (params: unknown, listener: (event: unknown) => void) => {
				subscriptions.push({ method, params, listener });
				return { unsubscribe: async () => {} };
			},
		]),
	) as unknown as CompactSubscriptionClient;
}

describe("open-interest cap across ledger-driven webData3 resubscriptions", () => {
	let container: HTMLDivElement;
	let root: Root;
	let store: HyperliquidStore;
	let subscriptions: LiveSubscription[];
	let latest: ProbeResult | undefined;

	beforeEach(() => {
		testState.address = USER;
		testState.isConnected = true;
		testState.liveSubscriptions = true;
		testState.subscriptionCalls = [];
		store = createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
		subscriptions = [];
		latest = undefined;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		testState.liveSubscriptions = false;
	});

	async function mount() {
		const transport: HyperliquidTransportContextValue = {
			info: {} as InfoClient,
			subscription: createLiveSubscriptionClient(subscriptions),
			env: "Mainnet",
			isTestnet: false,
		};
		act(() =>
			root.render(
				createElement(
					HyperliquidStoreContext.Provider,
					{ value: store },
					createElement(
						HyperliquidTransportContext.Provider,
						{ value: transport },
						createElement(Probe, {
							market: PERP_MARKET,
							onRender: (next: ProbeResult) => {
								latest = next;
							},
						}),
					),
				),
			),
		);
		await act(async () => {});
	}

	function subscriptionsOf(method: LiveSubscription["method"]) {
		return subscriptions.filter((subscription) => subscription.method === method);
	}

	async function emit(method: LiveSubscription["method"], event: unknown, index = -1) {
		await act(async () => subscriptionsOf(method).at(index)?.listener(event));
	}

	function lastWebData3Call() {
		return testState.subscriptionCalls.filter(([method]) => method === "webData3").at(-1);
	}

	function liveWebData3Keys() {
		return Object.keys(store.getState().subscriptions).filter((key) => key.includes('"webData3"'));
	}

	async function expectLedgerRefresh(update: ReturnType<typeof ledgerUpdate>, refreshKey: string) {
		await emit("userNonFundingLedgerUpdates", ledgerEvent([update]));

		expect(lastWebData3Call()).toEqual(["webData3", { user: USER }, { enabled: true, refreshKey }]);
		const [webData3Key] = liveWebData3Keys();
		expect(liveWebData3Keys()).toEqual([expect.stringContaining(JSON.stringify({ refreshKey }))]);
		expect(store.getState().subscriptions[webData3Key]).toEqual({ status: "active" });
		expect(latest).toMatchObject({ balances: { perpsAtOpenInterestCap: null }, isOpenInterestCapped: false });

		await emit("webData3", webData3Event([["BTC"]]), -2);
		expect(latest).toMatchObject({ balances: { perpsAtOpenInterestCap: null }, isOpenInterestCapped: false });

		await emit("webData3", webData3Event([["BTC"]]));
		expect(latest).toMatchObject({ balances: { perpsAtOpenInterestCap: ["BTC"] }, isOpenInterestCapped: true });
	}

	it("resubscribes on each ledger update and stays unknown until the new snapshot lists the market", async () => {
		await mount();
		await emit("userNonFundingLedgerUpdates", ledgerEvent([], true));
		await emit("webData3", webData3Event([["BTC"]]));

		expect(lastWebData3Call()).toEqual(["webData3", { user: USER }, { enabled: true, refreshKey: undefined }]);
		expect(liveWebData3Keys()).toEqual([expect.not.stringContaining("refreshKey")]);
		expect(latest).toMatchObject({ balances: { perpsAtOpenInterestCap: ["BTC"] }, isOpenInterestCapped: true });

		await expectLedgerRefresh(ledgerUpdate(1_000, "0x01"), "1000:0x01:1");
		await expectLedgerRefresh(ledgerUpdate(2_000, "0x02"), "2000:0x02:2");

		expect(subscriptionsOf("webData3").map(({ params }) => params)).toEqual([
			{ user: USER },
			{ user: USER },
			{ user: USER },
		]);
	});
});
