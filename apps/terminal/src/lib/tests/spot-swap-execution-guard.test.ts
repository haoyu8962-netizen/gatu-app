import type { OrderParameters } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import {
	assertSpotSwapExecutionAllowed,
	SpotSwapExecutionError,
	type SpotSwapExecutionState,
} from "@/domain/trade/spot-swap-execution-guard";

const order: OrderParameters["orders"][number] = {
	a: 10_001,
	b: true,
	p: "1.01",
	s: "10",
	r: false,
	t: { limit: { tif: "FrontendMarket" } },
};

function state(overrides: Partial<SpotSwapExecutionState> = {}): SpotSwapExecutionState {
	return {
		active: true,
		accountDataReady: true,
		tradeRestricted: false,
		tradingActionsBlocked: false,
		assetId: 10_001,
		marketName: "PURR/USDC",
		bookCoin: "PURR/USDC",
		bookStatus: "active",
		bookIsStale: false,
		bookReceivedAt: 1_000,
		balanceReceivedAt: 1_000,
		currentBalance: "100",
		requiredInput: "10.1",
		expectedOrder: order,
		...overrides,
	};
}

const params: OrderParameters = { orders: [order], grouping: "na" };

describe("spot swap SDK execution guard", () => {
	it("accepts an exact fresh quote", () => {
		expect(() => assertSpotSwapExecutionAllowed(params, state(), 1_001)).not.toThrow();
	});

	it("rejects an expired or reduced live balance", () => {
		expect(() => assertSpotSwapExecutionAllowed(params, state(), 61_001)).toThrow("Live swap data");
		expect(() => assertSpotSwapExecutionAllowed(params, state({ currentBalance: "10" }), 1_001)).toThrow(
			"balance changed",
		);
	});

	it("compares the exact protocol balance without number rounding", () => {
		expect(() =>
			assertSpotSwapExecutionAllowed(
				params,
				state({
					currentBalance: "9007199254740992.000000000000000001",
					requiredInput: "9007199254740992.000000000000000002",
				}),
				1_001,
			),
		).toThrow("balance changed");
	});

	it("rejects a book immediately after its receipt deadline", () => {
		expect(() => assertSpotSwapExecutionAllowed(params, state(), 16_001)).toThrow("Live swap data");
	});

	it("rejects mismatched markets, stale balances, and changed quotes", () => {
		expect(() => assertSpotSwapExecutionAllowed(params, state({ bookCoin: "HYPE/USDC" }), 1_001)).toThrow();
		expect(() => assertSpotSwapExecutionAllowed(params, state({ accountDataReady: false }), 1_001)).toThrow();
		expect(() =>
			assertSpotSwapExecutionAllowed({ ...params, orders: [{ ...order, p: "1.02" }] }, state(), 1_001),
		).toThrow("quote changed");
	});

	it("exposes stable reasons and normalizes malformed live balances", () => {
		expectExecutionReason(
			() => assertSpotSwapExecutionAllowed(params, state({ currentBalance: "not-a-balance" }), 1_001),
			"balance-unavailable",
		);
		expectExecutionReason(
			() => assertSpotSwapExecutionAllowed({ ...params, orders: [{ ...order, p: "1.02" }] }, state(), 1_001),
			"quote-changed",
		);
	});
});

function expectExecutionReason(action: () => void, reason: ConstructorParameters<typeof SpotSwapExecutionError>[0]) {
	try {
		action();
		throw new Error("Expected spot swap execution guard to reject");
	} catch (error) {
		expect(error).toBeInstanceOf(SpotSwapExecutionError);
		expect(error).toMatchObject({ reason });
	}
}
