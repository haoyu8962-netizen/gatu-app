import { describe, expect, it } from "vitest";
import {
	getAccountBalanceSummary,
	getPerpBalanceRows,
	getSpotAvailable,
	getSpotAvailableValue,
	getSpotBalanceData,
	getSpotBalanceRows,
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

	it("uses maintenance-adjusted available values in balance rows", () => {
		const rows = getSpotBalanceRows([usdcBalance], maintenanceAvailable);

		expect(rows).toEqual([
			expect.objectContaining({
				asset: "USDC",
				available: "4947.18019669",
				total: "8105.34686269",
			}),
		]);
	});

	it("keeps perps account equity and spot token balances in separate row groups", () => {
		const perpRows = getPerpBalanceRows({
			accountValue: "1620.34",
			totalMarginUsed: "1564.34",
		});
		const spotRows = getSpotBalanceRows([usdcBalance], maintenanceAvailable);

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

	it("keeps standard or unknown accounts separated and flags funds sitting in spot", () => {
		const standard = getAccountBalanceSummary({
			accountAbstraction: "disabled",
			marginSummary: { accountValue: "0", totalMarginUsed: "0", totalRawUsd: "0" } as never,
			perpSummary: { accountValue: "0", totalMarginUsed: "0" },
			withdrawable: "0",
			spotBalances: [settledSpotUsdcBalance],
		});
		const unknown = getAccountBalanceSummary({
			accountAbstraction: null,
			marginSummary: { accountValue: "0", totalMarginUsed: "0", totalRawUsd: "0" } as never,
			perpSummary: { accountValue: "0", totalMarginUsed: "0" },
			withdrawable: "0",
			spotBalances: [settledSpotUsdcBalance],
		});

		expect(standard.usesSpotStateForPerps).toBe(false);
		expect(standard.accountEquity).toBe(0);
		expect(standard.available).toBe(0);
		expect(standard.spotUsdcAvailable).toBeCloseTo(567.680532);
		expect(standard.hasSpotFundsWhenPerpWithdrawableZero).toBe(true);
		expect(unknown.usesSpotStateForPerps).toBe(false);
		expect(unknown.hasSpotFundsWhenPerpWithdrawableZero).toBe(true);
	});

	it("uses the API withdrawable for perp available and derives the open-order hold", () => {
		const perpRows = getPerpBalanceRows(
			{ accountValue: "1620.34", totalMarginUsed: "1564.34", totalNtlPos: "7821.7" },
			undefined,
			undefined,
			undefined,
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
			undefined,
			"0",
		);

		expect(perpRows[0]).toMatchObject({ available: "0", inOrder: "0" });

		const withOrders = getPerpBalanceRows(
			{ accountValue: "200", totalMarginUsed: "50", totalNtlPos: "1000" },
			undefined,
			undefined,
			undefined,
			"70",
		);

		expect(withOrders[0]).toMatchObject({ available: "70", inOrder: "30" });
	});

	it("values non-USDC spot balances at current mid price with entryNtl fallback", () => {
		const hypeBalance: SpotBalance = { coin: "HYPE", token: 150, total: "10", hold: "0", entryNtl: "200" };

		const pricedRows = getSpotBalanceRows([hypeBalance], undefined, undefined, { HYPE: "30" });
		expect(pricedRows[0]).toMatchObject({ asset: "HYPE", usdValue: "300", entryNtl: "200" });

		const unpricedRows = getSpotBalanceRows([hypeBalance]);
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
	});

	it("keeps outcome-market balances in account value and display rows", () => {
		const rows = getSpotBalanceRows([outcomeBalance]);

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
