import { describe, expect, it } from "vitest";
import { SMALL_BALANCE_THRESHOLD_USD } from "@/config/trade";
import {
	accountOverviewNeedsTokenUsdPrices,
	addSpotMarketPriceAliases,
	type BalanceRow,
	filterBalanceRowsByUsdValue,
	getAccountBalanceSummary,
	getAccountEquityValue,
	getAvailableFromTotals,
	getBalanceRowDisplayAvailable,
	getPerpBalanceRows,
	getPerpRiskSummaryUsdValue,
	getPerpRiskSummaryValue,
	getSpotAccountValueUsdValue,
	getSpotAvailable,
	getSpotAvailableValue,
	getSpotBalanceData,
	getSpotBalanceRows,
	getSpotTransferable,
	getSpotTransferableValue,
	getTokenAmountUsdValue,
	getUnifiedAccountMarginRatioValue,
	isQuoteBalanceSharedWithPerps,
	type SpotAvailableAfterMaintenance,
} from "@/domain/trade/balances";
import type { SpotBalance } from "@/hooks/trade/use-account-balances";

const usdcBalance: SpotBalance = {
	coin: "USDC",
	token: 0,
	total: "8105.34686269",
	hold: "3140.833333",
	entryNtl: "0",
};

const maintenanceAvailable: SpotAvailableAfterMaintenance = [[0, "4947.18019669"]];

const settledSpotUsdcBalance: SpotBalance = {
	coin: "USDC",
	token: 0,
	total: "567.680532",
	hold: "0",
	entryNtl: "0",
};

const outcomeBalance: SpotBalance = {
	coin: "+42",
	total: "2",
	hold: "0.5",
	entryNtl: "17.25",
};

describe("trade balances", () => {
	it("uses tokenToAvailableAfterMaintenance for spot available balances when present", () => {
		expect(getSpotAvailableValue(usdcBalance, maintenanceAvailable)).toBe("4947.18019669");
		expect(getSpotAvailable(usdcBalance, maintenanceAvailable)).toBeCloseTo(4947.18019669);
	});

	it("falls back to total minus hold for older spot payloads", () => {
		expect(getSpotAvailableValue(usdcBalance)).toBe("4964.51352969");
		expect(getSpotAvailable(usdcBalance)).toBeCloseTo(4964.51352969);
	});

	it("uses settled balance rather than maintenance buying power for spendable funds", () => {
		expect(getAvailableFromTotals("41.17419", "41.17419")).toBe(0);
		expect(getAvailableFromTotals("41.17419", "21.17419")).toBe(20);
	});

	it("uses total minus hold for spot transfers even when maintenance buying power differs", () => {
		expect(getSpotTransferableValue(usdcBalance)).toBe("4964.51352969");
		expect(getSpotTransferable(usdcBalance)).toBeCloseTo(4964.51352969);
		expect(getSpotAvailableValue(usdcBalance, maintenanceAvailable)).toBe("4947.18019669");
	});

	it("does not allow a fully held spot balance to leave the account", () => {
		const fullyHeld: SpotBalance = { coin: "USDC", token: 0, total: "488.239063", hold: "488.239063", entryNtl: "0" };

		expect(getSpotTransferableValue(fullyHeld)).toBe("0");
		expect(getSpotTransferable(fullyHeld)).toBe(0);
	});

	it("uses maintenance-adjusted available values in balance rows", () => {
		const rows = getSpotBalanceRows([usdcBalance], maintenanceAvailable, "disabled");

		expect(rows).toEqual([
			expect.objectContaining({
				asset: "USDC",
				available: "4947.18019669",
				total: "8105.34686269",
			}),
		]);
	});

	it("keeps perps account equity and spot token balances in separate row groups", () => {
		const perpRows = getPerpBalanceRows(
			{
				accountValue: "1620.34",
				totalMarginUsed: "1564.34",
			},
			undefined,
			undefined,
			"disabled",
		);
		const spotRows = getSpotBalanceRows([usdcBalance], maintenanceAvailable, "disabled");

		expect(perpRows).toEqual([
			expect.objectContaining({
				asset: "USDC",
				type: "perp",
				available: "56",
				total: "1620.34",
			}),
		]);
		expect(spotRows).toHaveLength(1);
		expect(spotRows[0]).toMatchObject({
			asset: "USDC",
			type: "spot",
			available: "4947.18019669",
			total: "8105.34686269",
		});
	});

	it("classifies shared USDC as perps collateral in unified account mode", () => {
		const perpRows = getPerpBalanceRows(
			{
				accountValue: "1620.34",
				totalMarginUsed: "1564.34",
			},
			[usdcBalance],
			maintenanceAvailable,
			"unifiedAccount",
		);
		const spotRows = getSpotBalanceRows([usdcBalance], maintenanceAvailable, "unifiedAccount");

		expect(perpRows).toEqual([
			expect.objectContaining({
				asset: "USDC",
				type: "perp",
				available: "4947.18019669",
				total: "8105.34686269",
			}),
		]);
		expect(spotRows).toEqual([]);
	});

	it("shows selected-market trade capacity without treating it as transferable funds", () => {
		const fullyHeld: SpotBalance = {
			coin: "USDC",
			token: 0,
			total: "15.332055",
			hold: "15.332055",
			entryNtl: "0",
		};
		const [row] = getPerpBalanceRows(
			{ accountValue: "15.332055", totalMarginUsed: "14.083869" },
			[fullyHeld],
			[[0, "1.248186"]],
			"unifiedAccount",
			"0",
			{ tradeAvailable: "800.000000000000000001" },
		);

		expect(row).toMatchObject({
			asset: "USDC",
			total: "15.332055",
			available: "1.248186",
			transferable: "0",
			tradeAvailable: "800.000000000000000001",
		});
		if (!row) throw new Error("Expected a shared collateral row");
		expect(getBalanceRowDisplayAvailable(row)).toBe("800.000000000000000001");
	});

	it("uses the selected standard DEX total account value while keeping withdrawal capacity separate", () => {
		const [row] = getPerpBalanceRows(
			{ accountValue: "13104.510288", totalMarginUsed: "4" },
			undefined,
			undefined,
			"disabled",
			"3",
			{
				marginSummary: {
					accountValue: "13109.482328",
					totalMarginUsed: "4",
					totalNtlPos: "100.02765",
					totalRawUsd: "13009.454678",
				},
				tradeAvailable: "700.125",
			},
		);

		expect(row).toMatchObject({
			total: "13109.482328",
			available: "3",
			transferable: "3",
			tradeAvailable: "700.125",
		});
		if (!row) throw new Error("Expected a standard perp balance row");
		expect(getBalanceRowDisplayAvailable(row)).toBe("700.125");
	});

	it("uses the selected HIP-3 collateral token without duplicating its shared Spot row", () => {
		const hypeCollateral: SpotBalance = {
			coin: "HYPE",
			token: 150,
			total: "9.5",
			hold: "1.5",
			entryNtl: "0",
		};
		const perpRows = getPerpBalanceRows(null, [hypeCollateral], [[150, "7.25"]], "portfolioMargin", "0", {
			quoteToken: "HYPE",
			tokenUsdPrices: { HYPE: "30" },
			tradeAvailable: "80",
		});
		const spotRows = getSpotBalanceRows([hypeCollateral], [[150, "7.25"]], "portfolioMargin", undefined, "HYPE");

		expect(perpRows[0]).toMatchObject({ asset: "HYPE", total: "9.5", usdValue: "285", tradeAvailable: "80" });
		expect(spotRows).toEqual([]);
	});

	it("only treats unified account and portfolio margin as shared balance modes", () => {
		expect(isQuoteBalanceSharedWithPerps("unifiedAccount")).toBe(true);
		expect(isQuoteBalanceSharedWithPerps("portfolioMargin")).toBe(true);
		expect(isQuoteBalanceSharedWithPerps("dexAbstraction")).toBe(false);
		expect(isQuoteBalanceSharedWithPerps("disabled")).toBe(false);
		expect(isQuoteBalanceSharedWithPerps(null)).toBe(false);
	});

	it("uses spot clearinghouse USDC for unified account equity and available", () => {
		const summary = getAccountBalanceSummary({
			accountAbstraction: "unifiedAccount",
			marginSummary: { accountValue: "0", totalMarginUsed: "0", totalRawUsd: "0" } as never,
			perpSummary: { accountValue: "0", totalMarginUsed: "0" },
			withdrawable: "0",
			spotBalances: [settledSpotUsdcBalance],
		});

		expect(summary.usesSpotStateForPerps).toBe(true);
		expect(summary.accountEquity).toBeCloseTo(567.680532);
		expect(summary.available).toBeCloseTo(567.680532);
		expect(summary.withdrawable).toBeCloseTo(567.680532);
		expect(summary.perpAccountValue).toBe(0);
		expect(summary.perpWithdrawable).toBe(0);
	});

	it("can keep builder perp dex balances isolated from unified spot balances", () => {
		const summary = getAccountBalanceSummary({
			accountAbstraction: "unifiedAccount",
			marginSummary: { accountValue: "0", totalMarginUsed: "0", totalRawUsd: "0" } as never,
			perpSummary: { accountValue: "0", totalMarginUsed: "0" },
			withdrawable: "0",
			spotBalances: [settledSpotUsdcBalance],
			allowSpotStateForPerps: false,
		});

		expect(summary.usesSpotStateForPerps).toBe(false);
		expect(summary.accountEquity).toBe(0);
		expect(summary.available).toBe(0);
		expect(summary.withdrawable).toBe(0);
		expect(summary.spotUsdcAvailable).toBeCloseTo(567.680532);
		expect(summary.hasSpotFundsWhenPerpWithdrawableZero).toBe(true);
	});

	it("keeps unified withdrawable initial-margin constrained while available tracks maintenance", () => {
		const summary = getAccountBalanceSummary({
			accountAbstraction: "unifiedAccount",
			marginSummary: { accountValue: "0", totalMarginUsed: "0", totalRawUsd: "0" } as never,
			perpSummary: { accountValue: "0", totalMarginUsed: "0" },
			withdrawable: "0",
			spotBalances: [usdcBalance],
			spotAvailableAfterMaintenance: maintenanceAvailable,
		});

		expect(summary.available).toBeCloseTo(4947.18019669);
		expect(summary.withdrawable).toBeCloseTo(4964.51352969);
		expect(summary.spotUsdcWithdrawable).toBeCloseTo(4964.51352969);
	});

	it("reports zero unified withdrawable when the L1 holds the full unified margin", () => {
		const fullyHeld: SpotBalance = { coin: "USDC", token: 0, total: "488.239063", hold: "488.239063", entryNtl: "0" };
		const summary = getAccountBalanceSummary({
			accountAbstraction: "unifiedAccount",
			marginSummary: { accountValue: "0", totalMarginUsed: "0", totalRawUsd: "0" } as never,
			perpSummary: { accountValue: "0", totalMarginUsed: "0" },
			withdrawable: "0",
			spotBalances: [fullyHeld],
			spotAvailableAfterMaintenance: [[0, "363.646903"]],
		});

		expect(summary.withdrawable).toBe(0);
		expect(summary.available).toBeCloseTo(363.646903);
	});

	it("keeps standard accounts separate and fails closed for unresolved modes", () => {
		const standard = getAccountBalanceSummary({
			accountAbstraction: "disabled",
			marginSummary: { accountValue: "0", totalMarginUsed: "0", totalRawUsd: "0" } as never,
			perpSummary: { accountValue: "0", totalMarginUsed: "0" },
			withdrawable: "0",
			spotBalances: [settledSpotUsdcBalance],
		});
		const unknown = getAccountBalanceSummary({
			accountAbstraction: "default",
			marginSummary: { accountValue: "0", totalMarginUsed: "0", totalRawUsd: "0" } as never,
			perpSummary: { accountValue: "0", totalMarginUsed: "0" },
			withdrawable: "0",
			spotBalances: [settledSpotUsdcBalance],
		});

		expect(standard.usesSpotStateForPerps).toBe(false);
		expect(standard.isAvailable).toBe(true);
		expect(standard.mode).toBe("separate");
		expect(standard.accountEquity).toBe(0);
		expect(standard.available).toBe(0);
		expect(standard.spotUsdcAvailable).toBeCloseTo(567.680532);
		expect(standard.hasSpotFundsWhenPerpWithdrawableZero).toBe(true);
		expect(unknown.usesSpotStateForPerps).toBe(false);
		expect(unknown.isAvailable).toBe(false);
		expect(unknown.mode).toBe("unavailable");
		expect(unknown.accountEquity).toBe(0);
		expect(unknown.available).toBe(0);
		expect(unknown.withdrawable).toBe(0);
		expect(unknown.spotUsdcAvailable).toBe(0);
		expect(unknown.hasSpotFundsWhenPerpWithdrawableZero).toBe(false);
		expect(getPerpBalanceRows({ accountValue: "10" }, undefined, undefined, "dexAbstraction")).toEqual([]);
		expect(getSpotBalanceRows([settledSpotUsdcBalance], undefined, "unknown")).toEqual([]);
	});

	it("uses the API withdrawable for perp available and derives the open-order hold", () => {
		const perpRows = getPerpBalanceRows(
			{ accountValue: "1620.34", totalMarginUsed: "1564.34", totalNtlPos: "7821.7" },
			undefined,
			undefined,
			"disabled",
			"40",
		);

		expect(perpRows).toEqual([
			expect.objectContaining({
				asset: "USDC",
				type: "perp",
				available: "40",
				inOrder: "16",
				total: "1620.34",
			}),
		]);
	});

	it("does not report the 10% transfer floor as an open-order hold above 10x leverage", () => {
		const perpRows = getPerpBalanceRows(
			{ accountValue: "60", totalMarginUsed: "50", totalNtlPos: "1000" },
			undefined,
			undefined,
			"disabled",
			"0",
		);

		expect(perpRows[0]).toMatchObject({ available: "0", inOrder: "0" });

		const withOrders = getPerpBalanceRows(
			{ accountValue: "200", totalMarginUsed: "50", totalNtlPos: "1000" },
			undefined,
			undefined,
			"disabled",
			"70",
		);

		expect(withOrders[0]).toMatchObject({ available: "70", inOrder: "30" });
	});

	it("values non-USDC spot balances at current mid price with entryNtl fallback", () => {
		const hypeBalance: SpotBalance = { coin: "HYPE", token: 150, total: "10", hold: "0", entryNtl: "200" };

		const pricedRows = getSpotBalanceRows([hypeBalance], undefined, "disabled", { HYPE: "30" });
		expect(pricedRows[0]).toMatchObject({ asset: "HYPE", usdValue: "300", entryNtl: "200" });

		const unpricedRows = getSpotBalanceRows([hypeBalance], undefined, "disabled");
		expect(unpricedRows[0]).toMatchObject({ asset: "HYPE", usdValue: "200" });

		const summary = getAccountBalanceSummary({
			accountAbstraction: "unifiedAccount",
			marginSummary: { accountValue: "0", totalMarginUsed: "0", totalRawUsd: "0" } as never,
			perpSummary: { accountValue: "0", totalMarginUsed: "0" },
			withdrawable: "0",
			spotBalances: [settledSpotUsdcBalance, hypeBalance],
			tokenUsdPrices: { HYPE: "30" },
		});
		expect(summary.accountEquity).toBeCloseTo(867.680532);
		expect(
			getAccountEquityValue({
				accountAbstraction: "unifiedAccount",
				marginSummary: null,
				perpSummary: null,
				spotBalances: [settledSpotUsdcBalance, hypeBalance],
				tokenUsdPrices: { HYPE: "30" },
			}),
		).toBe("867.680532");
	});

	it("aggregates cross-DEX risk values without floating-point loss", () => {
		const summary = getPerpRiskSummaryValue([
			{
				marginSummary: { totalNtlPos: "9007199254740992.1", totalMarginUsed: "0.000000000000000001" } as never,
				crossMaintenanceMarginUsed: "0.02",
				assetPositions: [{ position: { unrealizedPnl: "0.1" } }] as never,
			},
			{
				marginSummary: { totalNtlPos: "-9007199254740992", totalMarginUsed: "0.000000000000000002" } as never,
				crossMaintenanceMarginUsed: "0.03",
				assetPositions: [{ position: { unrealizedPnl: "-0.025" } }] as never,
			},
		]);

		expect(summary).toEqual({
			totalNtlPos: "0.1",
			totalMarginUsed: "3e-18",
			crossMaintenanceMarginUsed: "0.05",
			unrealizedPnl: "0.075",
		});
	});

	it("converts each perp DEX from its collateral token before aggregating risk", () => {
		const summary = getPerpRiskSummaryUsdValue(
			[
				{
					collateralToken: "USDC",
					marginSummary: { totalNtlPos: "100", totalMarginUsed: "10" } as never,
					crossMaintenanceMarginUsed: "5",
					assetPositions: [{ position: { unrealizedPnl: "2" } }] as never,
				},
				{
					collateralToken: "HYPE",
					marginSummary: { totalNtlPos: "10", totalMarginUsed: "1" } as never,
					crossMaintenanceMarginUsed: "0.5",
					assetPositions: [{ position: { unrealizedPnl: "-0.25" } }] as never,
				},
			],
			{ HYPE: "30" },
		);

		expect(summary).toEqual({
			totalNtlPos: "400",
			totalMarginUsed: "40",
			crossMaintenanceMarginUsed: "20",
			unrealizedPnl: "-5.5",
		});
	});

	it("fails closed instead of treating entry notional as a current account valuation", () => {
		const hypeBalance: SpotBalance = { coin: "HYPE", token: 150, total: "10", hold: "0", entryNtl: "200" };

		expect(getSpotAccountValueUsdValue([settledSpotUsdcBalance, hypeBalance], { HYPE: "30" })).toBe("867.680532");
		expect(getSpotAccountValueUsdValue([settledSpotUsdcBalance, hypeBalance])).toBeNull();
		expect(getTokenAmountUsdValue("10", "HYPE", { HYPE: "30" })).toBe("300");
		expect(getTokenAmountUsdValue("10", "HYPE", {})).toBeNull();
		expect(
			getPerpRiskSummaryUsdValue(
				[
					{
						collateralToken: "UNKNOWN",
						marginSummary: { totalNtlPos: "1", totalMarginUsed: "0" } as never,
					},
				],
				{},
			),
		).toBeNull();
	});

	it("requires the price stream only when non-USDC account values actually need conversion", () => {
		const hypeBalance: SpotBalance = { coin: "HYPE", token: 150, total: "10", hold: "0", entryNtl: "200" };
		const hypeRisk = {
			collateralToken: "HYPE",
			marginSummary: { totalNtlPos: "1", totalMarginUsed: "0" } as never,
			crossMaintenanceMarginUsed: "0",
		};

		expect(
			accountOverviewNeedsTokenUsdPrices({
				accountValues: [{ token: "USDC", value: "100" }],
				spotBalances: [settledSpotUsdcBalance],
			}),
		).toBe(false);
		expect(accountOverviewNeedsTokenUsdPrices({ spotBalances: [{ ...hypeBalance, total: "0" }] })).toBe(false);
		expect(accountOverviewNeedsTokenUsdPrices({ spotBalances: [hypeBalance] })).toBe(true);
		expect(accountOverviewNeedsTokenUsdPrices({ perpRiskStates: [hypeRisk] })).toBe(true);
	});

	it("computes the official unified-account ratio per collateral token", () => {
		const ratio = getUnifiedAccountMarginRatioValue({
			states: [
				{
					dex: "",
					crossMaintenanceMarginUsed: "20",
					assetPositions: [
						{ position: { leverage: { type: "cross" }, marginUsed: "10" } },
						{ position: { leverage: { type: "isolated" }, marginUsed: "100" } },
					] as never,
				},
				{
					dex: "cash",
					crossMaintenanceMarginUsed: "15",
					assetPositions: [{ position: { leverage: { type: "isolated" }, marginUsed: "50" } }] as never,
				},
			],
			collaterals: [
				{ dex: "", token: 0 },
				{ dex: "cash", token: 1 },
			],
			spotBalances: [
				{ coin: "USDC", token: 0, total: "1100", hold: "0", entryNtl: "0" },
				{ coin: "USDT", token: 1, total: "200", hold: "0", entryNtl: "0" },
			],
		});

		// USDC: 20 / (1100 - 100); USDT: 15 / (200 - 50). The maximum is 10%.
		expect(ratio).toBe("0.1");
	});

	it("fails closed when unified collateral metadata or available collateral is missing", () => {
		const state = { dex: "cash", crossMaintenanceMarginUsed: "1", assetPositions: [] };
		expect(getUnifiedAccountMarginRatioValue({ states: [state], collaterals: [], spotBalances: [] })).toBeNull();
		expect(
			getUnifiedAccountMarginRatioValue({
				states: [state],
				collaterals: [{ dex: "cash", token: 1 }],
				spotBalances: [{ coin: "USDT", token: 1, total: "0", hold: "0", entryNtl: "0" }],
			}),
		).toBeNull();
	});

	it("maps canonical spot mids back to raw balance token names", () => {
		const spotMarkets = [
			{
				kind: "spot",
				name: "@142",
				tokensInfo: [{ name: "UBTC" }, { name: "USDC" }],
			},
			{
				kind: "spot",
				name: "@107",
				tokensInfo: [{ name: "HYPE" }, { name: "USDC" }],
			},
		] as never;
		const prices = addSpotMarketPriceAliases({ HYPE: "31", "@107": "30", "@142": "50000" }, spotMarkets);
		const rows = getSpotBalanceRows(
			[
				{ coin: "UBTC", token: 1, total: "0.1", hold: "0", entryNtl: "4000" },
				{ coin: "HYPE", token: 150, total: "10", hold: "0", entryNtl: "200" },
			],
			undefined,
			"disabled",
			prices,
		);

		expect(rows[0]?.usdValue).toBe("5000");
		expect(rows[1]?.usdValue).toBe("300");
	});

	it("converts non-USDC spot quote mids through their USDC market without floating-point loss", () => {
		const spotMarkets = [
			{
				kind: "spot",
				name: "@301",
				tokensInfo: [{ name: "AXL" }, { name: "USDH" }],
			},
			{
				kind: "spot",
				name: "@150",
				tokensInfo: [{ name: "USDH" }, { name: "USDC" }],
			},
		] as never;

		const prices = addSpotMarketPriceAliases({ "@301": "0.057843", "@150": "0.99555" }, spotMarkets);

		expect(prices?.USDH).toBe("0.99555");
		expect(prices?.AXL).toBe("0.05758559865");
	});

	it("prefers a direct USDC spot price over an indirect quote route", () => {
		const spotMarkets = [
			{
				kind: "spot",
				name: "@301",
				tokensInfo: [{ name: "AXL" }, { name: "USDH" }],
			},
			{
				kind: "spot",
				name: "@302",
				tokensInfo: [{ name: "AXL" }, { name: "USDC" }],
			},
			{
				kind: "spot",
				name: "@150",
				tokensInfo: [{ name: "USDH" }, { name: "USDC" }],
			},
		] as never;

		const prices = addSpotMarketPriceAliases({ "@301": "0.057843", "@302": "0.058", "@150": "0.99555" }, spotMarkets);

		expect(prices?.AXL).toBe("0.058");
	});

	it("does not label a quote-denominated mid as USD when no quote conversion exists", () => {
		const spotMarkets = [
			{
				kind: "spot",
				name: "@301",
				tokensInfo: [{ name: "AXL" }, { name: "UNKNOWN" }],
			},
		] as never;

		const prices = addSpotMarketPriceAliases({ "@301": "0.057843" }, spotMarkets);

		expect(prices?.AXL).toBeUndefined();
	});

	it("does not use a same-named perp mid as an unresolved spot token USD price", () => {
		const spotMarkets = [
			{
				kind: "spot",
				name: "@301",
				tokensInfo: [{ name: "AXL" }, { name: "UNKNOWN" }],
			},
		] as never;

		const prices = addSpotMarketPriceAliases({ AXL: "2.5", "@301": "0.057843" }, spotMarkets);
		const rows = getSpotBalanceRows(
			[{ coin: "AXL", token: 301, total: "10", hold: "0", entryNtl: "0.5" }],
			undefined,
			"disabled",
			prices,
		);

		expect(prices?.AXL).toBeUndefined();
		expect(rows[0]?.usdValue).toBe("0.5");
	});

	it("keeps outcome-market balances in account value and display rows", () => {
		const rows = getSpotBalanceRows([outcomeBalance], undefined, "disabled");

		expect(rows).toEqual([
			expect.objectContaining({
				asset: "+42",
				available: "1.5",
				total: "2",
				usdValue: "17.25",
			}),
		]);

		const summary = getAccountBalanceSummary({
			accountAbstraction: "unifiedAccount",
			marginSummary: { accountValue: "0", totalMarginUsed: "0", totalRawUsd: "0" } as never,
			perpSummary: { accountValue: "0", totalMarginUsed: "0" },
			withdrawable: "0",
			spotBalances: [settledSpotUsdcBalance, outcomeBalance],
		});

		expect(summary.accountEquity).toBeCloseTo(584.930532);
	});

	it("uses maintenance-adjusted available values for spot order-entry balances", () => {
		const data = getSpotBalanceData(
			[usdcBalance],
			{
				kind: "spot",
				tokensInfo: [{ name: "PURR" }, { name: "USDC" }],
			} as never,
			maintenanceAvailable,
		);

		expect(data.quoteAvailable).toBeCloseTo(4947.18019669);
	});
});

describe("hide small balances", () => {
	function row(asset: string, usdValue: string): BalanceRow {
		return {
			asset,
			type: "spot",
			available: "1",
			transferable: "1",
			inOrder: "0",
			total: "1",
			usdValue,
			entryNtl: "0",
		};
	}

	it("hides rows under $5 except HYPE, as the official terminal does", () => {
		const rows = [row("PURR", "4.99"), row("UBTC", "5"), row("HYPE", "0.5"), row("USDC", "12")];

		expect(SMALL_BALANCE_THRESHOLD_USD).toBe(5);
		expect(filterBalanceRowsByUsdValue(rows, SMALL_BALANCE_THRESHOLD_USD).map((item) => item.asset)).toEqual([
			"UBTC",
			"HYPE",
			"USDC",
		]);
	});
});
