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

	it("uses spot clearinghouse USDC for unified account equity, available, and withdrawable", () => {
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
