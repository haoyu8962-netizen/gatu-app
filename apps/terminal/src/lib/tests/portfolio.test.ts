import { describe, expect, it } from "vitest";
import {
	calculateAllDexPerpEquityUsd,
	calculateCoreAccountEquity,
	calculateEarnBalance,
	calculateFourteenDayVolume,
	calculateVaultEquity,
	getLatestHistoryValue,
	getPortfolioQueryStatus,
	getPortfolioSnapshot,
	hasBorrowLendExposure,
	PORTFOLIO_MAX_AGE_MS,
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

	it("reads the newest valid history value", () => {
		const history: InfoResponse<"portfolio">[number][1]["accountValueHistory"] = [
			[1, "100"],
			[2, "125"],
			[3, "100"],
			[4, "120"],
		];

		expect(getLatestHistoryValue(history)).toBe("120");
		expect(getLatestHistoryValue([])).toBeNull();
		expect(getLatestHistoryValue([[1, "invalid"]])).toBeNull();
	});

	it("sums maker and taker volume for the latest fourteen calendar entries", () => {
		const dailyVolume = Array.from({ length: 16 }, (_, index) => ({
			date: `2026-07-${String(16 - index).padStart(2, "0")}`,
			userCross: "10",
			userAdd: "2.5",
			exchange: "1000",
		}));

		expect(calculateFourteenDayVolume(dailyVolume)).toBe("175");
		expect(calculateFourteenDayVolume([])).toBe("0");
		expect(calculateFourteenDayVolume(undefined)).toBeNull();
	});

	it("leaves the current, unfinished day out of the fourteen-day volume", () => {
		const dailyVolume = Array.from({ length: 16 }, (_, index) => ({
			date: `2026-07-${String(16 - index).padStart(2, "0")}`,
			userCross: String(16 - index),
			userAdd: "0",
			exchange: "1000",
		}));

		expect(calculateFourteenDayVolume(dailyVolume)).toBe("119");
		expect(calculateFourteenDayVolume(dailyVolume.slice(0, 1))).toBe("0");
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

	it("converts and sums separate DEX account values using each collateral token", () => {
		expect(
			calculateAllDexPerpEquityUsd({
				accounts: [
					{ dex: "", accountValue: "500" },
					{ dex: "xyz", accountValue: "100" },
					{ dex: "empty", accountValue: "0" },
				],
				collaterals: [{ dex: "xyz", collateralToken: "USDH" }],
				tokenUsdPrices: { USDH: "0.99" },
			}),
		).toBe("599");
	});

	it("does not understate separate DEX equity when collateral pricing is unavailable", () => {
		expect(
			calculateAllDexPerpEquityUsd({
				accounts: [{ dex: "xyz", accountValue: "100" }],
				collaterals: [{ dex: "xyz", collateralToken: "USDH" }],
				tokenUsdPrices: undefined,
			}),
		).toBeNull();
	});

	it("requires complete current account sources without falling back to history", () => {
		const vaults = [
			{ vaultAddress: "0x0000000000000000000000000000000000000001", equity: "25", lockedUntilTimestamp: 0 },
		] as InfoResponse<"userVaultEquities">;

		expect(calculateVaultEquity(vaults)).toBe("25");
		expect(
			resolveCurrentTotalEquity({
				coreEquity: "750",
				vaultEquity: "25",
				earnBalance: "10",
				currentSourcesAvailable: true,
			}),
		).toBe("785");
		expect(
			resolveCurrentTotalEquity({
				coreEquity: "750",
				vaultEquity: "25",
				earnBalance: "10",
				currentSourcesAvailable: false,
			}),
		).toBeNull();
		expect(
			resolveCurrentTotalEquity({
				coreEquity: "750",
				vaultEquity: "25",
				earnBalance: "10",
				currentSourcesAvailable: false,
			}),
		).toBeNull();
	});
});

describe("portfolio valuation completeness", () => {
	const state = (supply: string, borrow = "0") =>
		({
			tokenToState: [[150, { supply: { basis: supply, value: supply }, borrow: { basis: borrow, value: borrow } }]],
			health: "healthy",
			healthFactor: null,
		}) as InfoResponse<"borrowLendUserState">;
	const reserves = (oraclePx: string) => [[150, { oraclePx }]] as InfoResponse<"allBorrowLendReserveStates">;

	it("requires valid prices for both assets and liabilities", () => {
		for (const data of [state("2"), state("0", "2"), state("2", "2")]) {
			expect(calculateEarnBalance(data, [])).toBeNull();
			for (const price of ["0", "-1", "invalid"]) expect(calculateEarnBalance(data, reserves(price))).toBeNull();
		}
		expect(calculateEarnBalance(state("0", "2"), reserves("86.82"))).toBe("-173.64");
		expect(hasBorrowLendExposure(state("2", "2"))).toBe(true);
	});

	it("distinguishes zero lending from unavailable and invalid lending", () => {
		expect(calculateEarnBalance(state("0"), undefined)).toBe("0");
		expect(calculateEarnBalance(undefined, reserves("1"))).toBeNull();
		for (const value of ["invalid", "-1", ""]) expect(calculateEarnBalance(state(value), reserves("1"))).toBeNull();
		expect(calculateVaultEquity(undefined)).toBeNull();
		expect(calculateVaultEquity([])).toBe("0");
		expect(calculateVaultEquity([{ equity: "invalid" }] as InfoResponse<"userVaultEquities">)).toBeNull();
	});

	it("never drops an unpriced token from a partially valued lending portfolio", () => {
		const data = state("2");
		data.tokenToState.push([0, { supply: { basis: "100", value: "100" }, borrow: { basis: "0", value: "0" } }]);
		expect(
			calculateEarnBalance(data, [[0, { oraclePx: "1" }]] as InfoResponse<"allBorrowLendReserveStates">),
		).toBeNull();
	});

	it("preserves decimal precision and negative total equity", () => {
		expect(
			resolveCurrentTotalEquity({
				coreEquity: "9007199254740993.01",
				vaultEquity: "0.02",
				earnBalance: "0",
				currentSourcesAvailable: true,
			}),
		).toBe("9007199254740993.03");
		expect(
			resolveCurrentTotalEquity({
				coreEquity: "100",
				vaultEquity: "0",
				earnBalance: "-200",
				currentSourcesAvailable: true,
			}),
		).toBe("-100");
		expect(
			resolveCurrentTotalEquity({
				coreEquity: "100",
				vaultEquity: null,
				earnBalance: "0",
				currentSourcesAvailable: true,
			}),
		).toBeNull();
		expect(
			calculateCoreAccountEquity({ spotEquity: "100", perpEquity: null, usesSharedQuoteBalance: false }),
		).toBeNull();
		expect(
			calculateAllDexPerpEquityUsd({
				accounts: [{ dex: "", accountValue: "invalid" }],
				collaterals: [],
				tokenUsdPrices: {},
			}),
		).toBeNull();
	});
});

describe("portfolio query freshness", () => {
	const now = 1_800_000_000_000;
	const query = {
		data: [],
		dataUpdatedAt: now,
		isError: false,
		isPending: false,
		isPlaceholderData: false,
		isFetchedAfterMount: true,
	};
	it("keeps fresh data during a normal refresh and rejects expired or failed cached data", () => {
		expect(getPortfolioQueryStatus(query, true, now)).toBe("ready");
		expect(getPortfolioQueryStatus(query, true, now + PORTFOLIO_MAX_AGE_MS)).toBe("stale");
		expect(getPortfolioQueryStatus({ ...query, isError: true }, true, now)).toBe("error");
		expect(getPortfolioQueryStatus({ ...query, dataUpdatedAt: now + 1 }, true, now)).toBe("stale");
	});
	it("does not reuse disabled, placeholder, missing, or pending data", () => {
		expect(getPortfolioQueryStatus(query, false, now)).toBe("unavailable");
		expect(getPortfolioQueryStatus({ ...query, isPlaceholderData: true }, true, now)).toBe("loading");
		expect(getPortfolioQueryStatus({ ...query, data: undefined }, true, now)).toBe("unavailable");
		expect(getPortfolioQueryStatus({ ...query, isPending: true }, true, now)).toBe("loading");
	});
});
