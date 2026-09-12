import type { AllBorrowLendReserveStatesResponse } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import { getAccountLeverageCollateralValue } from "@/domain/trade/account-leverage";

const collaterals = [
	{ dex: "", tokenIndex: 0, tokenName: "USDC" },
	{ dex: "xyz", tokenIndex: 0, tokenName: "USDC" },
	{ dex: "cash", tokenIndex: 1, tokenName: "USDT" },
];
const spotBalances = [
	{ token: 0, coin: "USDC", total: "100.000001", hold: "0", entryNtl: "0" },
	{ token: 1, coin: "USDT", total: "20", hold: "0", entryNtl: "0" },
	{ token: 150, coin: "HYPE", total: "10", hold: "0", entryNtl: "0" },
	{ token: 200, coin: "OTHER", total: "1000", hold: "0", entryNtl: "0" },
];
const input = { collaterals, spotBalances, tokenUsdPrices: { USDT: "0.99", HYPE: "100", OTHER: "20" } };

function reserves(ltv = "0.65", oraclePx = "80"): AllBorrowLendReserveStatesResponse {
	return [[150, { ltv, oraclePx }]] as AllBorrowLendReserveStatesResponse;
}

describe("account leverage collateral", () => {
	it("counts each settlement asset once and excludes other Spot holdings in unified mode", () => {
		expect(getAccountLeverageCollateralValue({ ...input, portfolioMargin: false })).toBe("119.800001");
	});
	it("adds only eligible non-settlement assets at server oracle price times LTV", () => {
		expect(getAccountLeverageCollateralValue({ ...input, portfolioMargin: true, reserves: reserves() })).toBe(
			"639.800001",
		);
	});
	it("keeps portfolio leverage unavailable while required reserve data is missing", () => {
		expect(getAccountLeverageCollateralValue({ ...input, portfolioMargin: true })).toBeNull();
		expect(getAccountLeverageCollateralValue({ ...input, portfolioMargin: true, reserves: [] })).toBe("119.800001");
	});
	it("does not require reserve data for an account holding settlement assets only", () => {
		expect(
			getAccountLeverageCollateralValue({ ...input, spotBalances: spotBalances.slice(0, 2), portfolioMargin: true }),
		).toBe("119.800001");
	});
	it.each([
		["bad", "80"],
		["1.01", "80"],
		["-0.1", "80"],
		["0.65", "0"],
		["0.65", "bad"],
	])("rejects invalid LTV %s or oracle price %s", (ltv, price) => {
		expect(
			getAccountLeverageCollateralValue({ ...input, portfolioMargin: true, reserves: reserves(ltv, price) }),
		).toBeNull();
	});
	it("ignores non-collateral reserves with a zero LTV", () => {
		expect(getAccountLeverageCollateralValue({ ...input, portfolioMargin: true, reserves: reserves("0", "0") })).toBe(
			"119.800001",
		);
	});
	it("preserves negative settlement balances and fails closed on unknown collateral identities", () => {
		expect(
			getAccountLeverageCollateralValue({
				...input,
				spotBalances: [{ ...spotBalances[0], total: "-2" }],
				portfolioMargin: false,
			}),
		).toBe("-2");
		expect(
			getAccountLeverageCollateralValue({
				...input,
				collaterals: [{ dex: "", tokenIndex: null, tokenName: "USDC" }],
				portfolioMargin: false,
			}),
		).toBeNull();
	});
});
