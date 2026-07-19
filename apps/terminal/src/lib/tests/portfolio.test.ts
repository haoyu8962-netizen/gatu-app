import { describe, expect, it } from "vitest";
import {
	calculateCoreAccountEquity,
	calculateEarnBalance,
	calculateFourteenDayVolume,
	calculateMaxDrawdown,
	calculateVaultEquity,
	getLatestHistoryValue,
	getPortfolioSnapshot,
	resolveCurrentTotalEquity,
} from "@/domain/portfolio";
import type { InfoResponse } from "@/lib/hyperliquid";

const emptySnapshot = { accountValueHistory: [], pnlHistory: [], vlm: "0" };

describe("portfolio data", () => {
	it("selects combined and perps snapshots without relying on tuple indexes", () => {
		const portfolio = [
			["day", { ...emptySnapshot, vlm: "10" }],
			["week", emptySnapshot],
			["month", { ...emptySnapshot, vlm: "300" }],
			["allTime", emptySnapshot],
			["perpDay", emptySnapshot],
			["perpWeek", emptySnapshot],
			["perpMonth", { ...emptySnapshot, vlm: "250" }],
			["perpAllTime", emptySnapshot],
		] as InfoResponse<"portfolio">;

		expect(getPortfolioSnapshot(portfolio, "combined", "month")?.vlm).toBe("300");
		expect(getPortfolioSnapshot(portfolio, "perps", "month")?.vlm).toBe("250");
	});

	it("reads the newest history value and calculates peak-to-trough drawdown", () => {
		const history: InfoResponse<"portfolio">[number][1]["accountValueHistory"] = [
			[1, "100"],
			[2, "125"],
			[3, "100"],
			[4, "120"],
		];

		expect(getLatestHistoryValue(history)).toBe("120");
		expect(calculateMaxDrawdown(history)).toBe("-0.2");
		expect(calculateMaxDrawdown([])).toBe("0");
	});

	it("sums maker and taker volume for the latest fourteen calendar entries", () => {
		const dailyVolume = Array.from({ length: 16 }, (_, index) => ({
			date: `2026-07-${String(16 - index).padStart(2, "0")}`,
			userCross: "10",
			userAdd: "2.5",
			exchange: "1000",
		}));

		expect(calculateFourteenDayVolume(dailyVolume)).toBe("175");
	});

	it("values net borrow/lend balances with reserve oracle prices", () => {
		const userState = {
			tokenToState: [
				[0, { supply: { basis: "100", value: "100" }, borrow: { basis: "10", value: "10" } }],
				[1, { supply: { basis: "2", value: "2" }, borrow: { basis: "0", value: "0" } }],
			],
			health: "healthy",
			healthFactor: null,
		} as InfoResponse<"borrowLendUserState">;
		const reserves = [
			[0, { oraclePx: "1" }],
			[1, { oraclePx: "2500" }],
		] as InfoResponse<"allBorrowLendReserveStates">;

		expect(calculateEarnBalance(userState, reserves)).toBe("5090");
	});

	it("keeps shared collateral out of fallback equity double counting", () => {
		expect(calculateCoreAccountEquity({ spotEquity: "500", perpEquity: "500", usesSharedQuoteBalance: true })).toBe(
			"500",
		);
		expect(calculateCoreAccountEquity({ spotEquity: "500", perpEquity: "250", usesSharedQuoteBalance: false })).toBe(
			"750",
		);
	});

	it("prefers portfolio history and otherwise combines current account sources", () => {
		const vaults = [
			{ vaultAddress: "0x0000000000000000000000000000000000000001", equity: "25", lockedUntilTimestamp: 0 },
		] as InfoResponse<"userVaultEquities">;

		expect(calculateVaultEquity(vaults)).toBe("25");
		expect(
			resolveCurrentTotalEquity({ portfolioValue: "900", coreEquity: "750", vaultEquity: "25", earnBalance: "10" }),
		).toBe("900");
		expect(
			resolveCurrentTotalEquity({ portfolioValue: "0", coreEquity: "750", vaultEquity: "25", earnBalance: "10" }),
		).toBe("785");
	});
});
