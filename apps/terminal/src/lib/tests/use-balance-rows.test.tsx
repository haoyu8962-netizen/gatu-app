// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBalanceRowDisplayAvailable } from "@/domain/trade/balances";
import { useBalanceRows } from "@/hooks/trade/use-balance-rows";

const mocks = vi.hoisted(() => ({
	activeAssetData: {
		availableToTrade: ["800.000000000000000001", "700.125"] as [string, string],
	},
	activeAssetStatus: "success" as "idle" | "loading" | "success" | "stale" | "error",
	accountAbstraction: "unifiedAccount" as string | null,
	dex: "xyz",
	hasError: false,
	isConnected: true,
	isDataStale: false,
	isLoading: false,
	market: {
		kind: "builderPerp" as const,
		name: "xyz:GOOGL",
		quoteToken: { name: "USDC" },
	} as { kind: "builderPerp"; name: string; quoteToken: { name: string } } | { kind: "spot"; name: string } | undefined,
	side: "buy" as "buy" | "sell",
	spotStateStatus: "success" as "idle" | "loading" | "success" | "stale" | "error",
	perpStateStatus: "success" as "idle" | "loading" | "success" | "stale" | "error",
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ isConnected: mocks.isConnected }),
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderSide: () => mocks.side,
}));

vi.mock("@/hooks/trade/use-active-asset-data", () => ({
	useActiveAssetData: () => ({
		data: mocks.activeAssetData,
		market: mocks.market,
		status: mocks.activeAssetStatus,
	}),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: (value: string | null) =>
		value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin",
	useSelectedDexBalances: () => ({
		dex: mocks.dex,
		marginSummary: { accountValue: "15.332055", totalMarginUsed: "14.083869", totalRawUsd: "15.332055" },
		perpSummary: { accountValue: "15.332055", totalMarginUsed: "14.083869" },
		spotBalances: [{ coin: "USDC", token: 0, total: "15.332055", hold: "15.332055", entryNtl: "0" }],
		spotAvailableAfterMaintenance: [[0, "1.248186"]],
		accountAbstraction: mocks.accountAbstraction,
		withdrawable: "0",
		spotStateStatus: mocks.spotStateStatus,
		perpStateStatus: mocks.perpStateStatus,
		isDataStale: mocks.isDataStale,
		isLoading: mocks.isLoading,
		hasError: mocks.hasError,
	}),
}));

vi.mock("@/hooks/trade/use-spot-token-usd-prices", () => ({
	useSpotTokenUsdPrices: () => ({ USDC: "1" }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useBalanceRows> | null = null;

function Probe() {
	hookValue = useBalanceRows();
	return null;
}

describe("useBalanceRows", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		hookValue = null;
		mocks.activeAssetData = { availableToTrade: ["800.000000000000000001", "700.125"] };
		mocks.activeAssetStatus = "success";
		mocks.accountAbstraction = "unifiedAccount";
		mocks.dex = "xyz";
		mocks.hasError = false;
		mocks.isConnected = true;
		mocks.isDataStale = false;
		mocks.isLoading = false;
		mocks.market = { kind: "builderPerp", name: "xyz:GOOGL", quoteToken: { name: "USDC" } };
		mocks.side = "buy";
		mocks.spotStateStatus = "success";
		mocks.perpStateStatus = "success";
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		hookValue = null;
	});

	function renderHook() {
		act(() => root.render(createElement(Probe)));
		if (!hookValue) throw new Error("Expected balance rows hook value");
		return hookValue;
	}

	function firstPerpRow(result: ReturnType<typeof useBalanceRows>) {
		const row = result.perpBalances[0];
		if (!row) throw new Error("Expected a perp balance row");
		return row;
	}

	it("uses the same directional trade capacity as order entry while preserving transfer limits", () => {
		let result = renderHook();
		expect(result.perpBalances[0]).toMatchObject({
			total: "15.332055",
			available: "1.248186",
			transferable: "0",
			tradeAvailable: "800.000000000000000001",
		});
		expect(getBalanceRowDisplayAvailable(firstPerpRow(result))).toBe("800.000000000000000001");

		mocks.side = "sell";
		result = renderHook();
		expect(getBalanceRowDisplayAvailable(firstPerpRow(result))).toBe("700.125");
	});

	it("shows unavailable instead of falling back to a different balance field while the market feed is pending", () => {
		mocks.activeAssetStatus = "loading";
		const result = renderHook();

		expect(result.perpBalances[0]?.tradeAvailable).toBeNull();
		expect(getBalanceRowDisplayAvailable(firstPerpRow(result))).toBeNull();
	});

	it("does not expose a different availability field while the selected market is unresolved", () => {
		mocks.market = undefined;
		const result = renderHook();

		expect(firstPerpRow(result).tradeAvailable).toBeNull();
		expect(getBalanceRowDisplayAvailable(firstPerpRow(result))).toBeNull();
	});

	it("does not expose main-DEX funds actions for a separate HIP-3 balance", () => {
		mocks.accountAbstraction = "disabled";
		const result = renderHook();

		expect(firstPerpRow(result)).toMatchObject({
			total: "15.332055",
			tradeAvailable: "800.000000000000000001",
			transferable: "0",
		});
		expect(result.perpFundsActionsEnabled).toBe(false);
		expect(result.internalTransfersEnabled).toBe(true);
	});

	it.each([
		["stale", false, false],
		["loading", true, false],
		["error", false, true],
	] as const)("fails closed for %s account data while preserving cached rows", (status, isLoading, hasError) => {
		mocks.perpStateStatus = status;
		mocks.isDataStale = status === "stale";
		mocks.isLoading = isLoading;
		mocks.hasError = hasError;
		const result = renderHook();

		expect(result.perpBalances).toHaveLength(1);
		expect(result.accountDataReady).toBe(false);
		expect(result.internalTransfersEnabled).toBe(false);
		expect(result.perpFundsActionsEnabled).toBe(false);
	});
});
