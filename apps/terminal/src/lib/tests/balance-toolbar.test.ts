import { describe, expect, it } from "vitest";
import {
	getTradingToolbarBalanceSummary,
	getTradingToolbarSpotPnl,
	isTradingToolbarBalancePositive,
} from "@/domain/trade/balance-toolbar";
import type { BalanceRow } from "@/domain/trade/balances";
import type { SpotBalance } from "@/hooks/trade/use-account-balances";

const usdcBalance: SpotBalance = {
	coin: "USDC",
	token: 0,
	total: "100.000000000000000001",
	hold: "20.000000000000000001",
	entryNtl: "0",
};

const hypeBalance: SpotBalance = {
	coin: "HYPE",
	token: 150,
	total: "2.5",
	hold: "0",
	entryNtl: "50",
};

describe("trading toolbar balance metrics", () => {
	it.each(["unifiedAccount", "portfolioMargin"] as const)(
		"uses shared Spot equity and transferable USDC in %s mode",
		(accountAbstraction) => {
			const summary = getTradingToolbarBalanceSummary({
				accountAbstraction,
				marginSummary: { accountValue: "999999" } as never,
				perpSummary: { accountValue: "888888" },
				spotBalances: [usdcBalance, hypeBalance],
				tokenUsdPrices: { HYPE: "30" },
				withdrawable: "777777",
			});

			expect(summary).toEqual({
				totalAssets: "175.000000000000000001",
				withdrawable: "80",
			});
		},
	);

	it("keeps separate-account equity and withdrawable isolated from Spot balances", () => {
		const summary = getTradingToolbarBalanceSummary({
			accountAbstraction: "disabled",
			marginSummary: { accountValue: "123.450000000000000001" } as never,
			perpSummary: { accountValue: "999" },
			spotBalances: [usdcBalance, hypeBalance],
			tokenUsdPrices: { HYPE: "30" },
			withdrawable: "12.340000000000000001",
		});

		expect(summary).toEqual({
			totalAssets: "123.450000000000000001",
			withdrawable: "12.340000000000000001",
		});
	});

	it.each(["default", "dexAbstraction", "unknown", null] as const)(
		"does not infer a balance source for unresolved mode %s",
		(accountAbstraction) => {
			expect(
				getTradingToolbarBalanceSummary({
					accountAbstraction,
					marginSummary: { accountValue: "123" } as never,
					perpSummary: { accountValue: "123" },
					spotBalances: [usdcBalance],
					withdrawable: "99",
				}),
			).toEqual({ totalAssets: "0", withdrawable: "0" });
		},
	);

	it("derives Spot PNL and ratio with decimal arithmetic", () => {
		const row: BalanceRow = {
			asset: "HYPE",
			type: "spot",
			available: "2",
			transferable: "2",
			inOrder: "0",
			total: "2",
			usdValue: "20",
			entryNtl: "16",
		};

		expect(getTradingToolbarSpotPnl(row, "10")).toEqual({
			pnl: "4",
			pnlRatio: "0.25",
			tone: "profit",
		});
	});

	it("does not present PNL without a valid positive cost basis and mid", () => {
		const row: BalanceRow = {
			asset: "HYPE",
			type: "spot",
			available: "2",
			transferable: "2",
			inOrder: "0",
			total: "2",
			usdValue: "20",
			entryNtl: "0",
		};

		expect(getTradingToolbarSpotPnl(row, "10")).toBeNull();
		expect(getTradingToolbarSpotPnl({ ...row, entryNtl: "16" }, "invalid")).toBeNull();
		expect(getTradingToolbarSpotPnl({ ...row, type: "perp", entryNtl: "16" }, "10")).toBeNull();
	});

	it("checks positive action balances without parseFloat coercion", () => {
		expect(isTradingToolbarBalancePositive("0.000000000000000001")).toBe(true);
		expect(isTradingToolbarBalancePositive("0")).toBe(false);
		expect(isTradingToolbarBalancePositive("invalid")).toBe(false);
	});
});
