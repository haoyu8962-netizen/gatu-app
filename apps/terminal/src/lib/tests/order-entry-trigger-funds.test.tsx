// @vitest-environment jsdom
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	orderType: "stopMarket",
	perpStateStatus: "success",
	spotStateStatus: "success",
	clearinghouseStates: [] as [string, { marginSummary: { accountValue: string } }][],
	spotBalances: [] as { coin: string; token: number; total: string; hold: string; entryNtl: string }[],
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: "0x00000000000000000000000000000000000000aa", isConnected: true }),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: () => true,
	useDefaultDexBalances: () => ({
		accountAbstraction: "ordinary",
		isLoading: false,
		allDexClearinghouseStates: testState.clearinghouseStates,
		perpStateStatus: testState.perpStateStatus,
		spotBalances: testState.spotBalances,
		spotAvailableAfterMaintenance: null,
		spotStateStatus: testState.spotStateStatus,
		spotStateReceivedAt: 1,
		perpsAtOpenInterestCap: [],
	}),
}));

vi.mock("@/hooks/trade/use-asset-leverage", () => ({
	useAssetLeverage: () => ({
		transactionIdentity: "Mainnet:7",
		displayLeverage: 10,
		currentLeverage: 10,
		pendingLeverage: null,
		committedLeverage: null,
		maxLeverage: 50,
		setPendingLeverage: vi.fn(),
		resetPending: vi.fn(),
		maxTradeSzs: [0, 0],
		maxTradeSzsRaw: ["0", "0"],
		availableToTrade: [0, 0],
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
	useOrderType: () => testState.orderType,
}));

import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";

const HYPE_MARKET = {
	kind: "perp",
	name: "HYPE",
	pairName: "HYPE-USDC",
	assetId: 7,
	szDecimals: 2,
} as UnifiedMarketInfo;

describe("trigger orders on a funded account need no free balance (official terminal parity)", () => {
	let root: Root;
	let container: HTMLDivElement;
	let latest: ReturnType<typeof useOrderEntryData> | null;

	function Probe() {
		latest = useOrderEntryData({
			market: HYPE_MARKET,
			side: "buy",
			markPx: 100,
			sizeMode: "base",
			sizeInput: "1",
			marketOrderSizing: null,
		});
		return null;
	}

	function render() {
		act(() => root.render(createElement(Probe)));
		if (!latest) throw new Error("Expected order entry data");
		return latest;
	}

	beforeEach(() => {
		testState.orderType = "stopMarket";
		testState.perpStateStatus = "success";
		testState.spotStateStatus = "success";
		testState.clearinghouseStates = [
			["", { marginSummary: { accountValue: "0" } }],
			["xyz", { marginSummary: { accountValue: "25" } }],
		];
		testState.spotBalances = [];
		latest = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("exempts a stop order when any DEX of a current snapshot holds equity", () => {
		expect(render().requiresAvailableBalance).toBe(false);
	});

	it("exempts a take-profit order when only a spot balance is held", () => {
		testState.orderType = "takeProfitLimit";
		testState.clearinghouseStates = [["", { marginSummary: { accountValue: "0" } }]];
		testState.spotBalances = [{ coin: "USDC", token: 0, total: "5", hold: "5", entryNtl: "0" }];
		expect(render().requiresAvailableBalance).toBe(false);
	});

	it("keeps requiring free balance for a limit order, an empty account and an unconfirmed snapshot", () => {
		testState.orderType = "limit";
		expect(render().requiresAvailableBalance).toBe(true);

		testState.orderType = "stopMarket";
		testState.clearinghouseStates = [["", { marginSummary: { accountValue: "0" } }]];
		expect(render().requiresAvailableBalance).toBe(true);

		testState.clearinghouseStates = [["xyz", { marginSummary: { accountValue: "25" } }]];
		testState.perpStateStatus = "stale";
		expect(render().requiresAvailableBalance).toBe(true);

		testState.perpStateStatus = "success";
		testState.spotStateStatus = "error";
		expect(render().requiresAvailableBalance).toBe(true);
	});

	it("fails a perp entry closed when its side has no capacity", () => {
		testState.orderType = "limit";
		expect(render().exceedsMaxSize).toBe(true);
	});
});
