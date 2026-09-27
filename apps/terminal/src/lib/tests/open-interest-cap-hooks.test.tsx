// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import { createI18nRoot } from "./harness/react";

const USER = "0x00000000000000000000000000000000000000aa";

const testState = vi.hoisted(() => ({
	address: "0x00000000000000000000000000000000000000aa" as string | undefined,
	isConnected: true,
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

vi.mock("@/lib/hyperliquid", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/hyperliquid")>()),
	getAccountLedgerRefreshKey: () => "ledger-7",
	useInfo: () => ({ data: undefined, status: "pending" }),
	useSubscription: (method: string, params: unknown, options: unknown) => {
		testState.subscriptionCalls.push([method, params, options]);
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
}));

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

	it("reads the cap from the existing webData3 subscription without changing its key", () => {
		const result = render();
		const webData3Calls = testState.subscriptionCalls.filter(([method]) => method === "webData3");

		expect(result.balances.perpsAtOpenInterestCap).toEqual(["CANTO", "km:AAPL", "BTC"]);
		expect(webData3Calls.length).toBeGreaterThan(0);
		for (const call of webData3Calls) {
			expect(call).toEqual(["webData3", { user: USER }, { enabled: true, refreshKey: "ledger-7" }]);
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
