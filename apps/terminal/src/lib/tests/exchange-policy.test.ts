import { assertExchangeMutationAllowed, isPortfolioMarginActivation } from "@gatu/hl-react/exchange-policy";
import { describe, expect, it } from "vitest";

const USER = "0x1234567890abcdef1234567890abcdef12345678";
const BLOCKED_MESSAGE = "Portfolio margin activation is temporarily unavailable";

describe("exchange mutation policy", () => {
	it("recognizes every SDK portfolio margin activation shape", () => {
		expect(
			isPortfolioMarginActivation("userSetAbstraction", {
				user: USER,
				abstraction: "portfolioMargin",
			}),
		).toBe(true);
		expect(
			isPortfolioMarginActivation("userPortfolioMargin", {
				user: USER,
				enabled: true,
			}),
		).toBe(true);
		expect(isPortfolioMarginActivation("agentSetAbstraction", { abstraction: "p" })).toBe(true);
	});

	it("fails closed by default for every activation path", () => {
		expect(() =>
			assertExchangeMutationAllowed("userSetAbstraction", {
				user: USER,
				abstraction: "portfolioMargin",
			}),
		).toThrow(BLOCKED_MESSAGE);
		expect(() =>
			assertExchangeMutationAllowed("userPortfolioMargin", {
				user: USER,
				enabled: true,
			}),
		).toThrow(BLOCKED_MESSAGE);
		expect(() => assertExchangeMutationAllowed("agentSetAbstraction", { abstraction: "p" })).toThrow(BLOCKED_MESSAGE);
	});

	it("allows disabling and switching away while the activation gate is closed", () => {
		expect(() =>
			assertExchangeMutationAllowed("userSetAbstraction", {
				user: USER,
				abstraction: "disabled",
			}),
		).not.toThrow();
		expect(() =>
			assertExchangeMutationAllowed("userSetAbstraction", {
				user: USER,
				abstraction: "unifiedAccount",
			}),
		).not.toThrow();
		expect(() =>
			assertExchangeMutationAllowed("userPortfolioMargin", {
				user: USER,
				enabled: false,
			}),
		).not.toThrow();
		expect(() => assertExchangeMutationAllowed("agentSetAbstraction", { abstraction: "i" })).not.toThrow();
		expect(() => assertExchangeMutationAllowed("agentSetAbstraction", { abstraction: "u" })).not.toThrow();
	});

	it("allows activation only when the injected policy is enabled", () => {
		expect(() =>
			assertExchangeMutationAllowed(
				"userSetAbstraction",
				{
					user: USER,
					abstraction: "portfolioMargin",
				},
				"true" as unknown as boolean,
			),
		).toThrow(BLOCKED_MESSAGE);
		expect(() =>
			assertExchangeMutationAllowed(
				"userSetAbstraction",
				{
					user: USER,
					abstraction: "portfolioMargin",
				},
				true,
			),
		).not.toThrow();
		expect(() =>
			assertExchangeMutationAllowed(
				"userPortfolioMargin",
				{
					user: USER,
					enabled: true,
				},
				true,
			),
		).not.toThrow();
		expect(() => assertExchangeMutationAllowed("agentSetAbstraction", { abstraction: "p" }, true)).not.toThrow();
	});

	it("does not classify isolated management payloads without market and position context", () => {
		expect(() =>
			assertExchangeMutationAllowed("updateLeverage", { asset: 1, isCross: false, leverage: 5 }),
		).not.toThrow();
		expect(() =>
			assertExchangeMutationAllowed("updateIsolatedMargin", { asset: 1, isBuy: true, ntli: -1 }),
		).not.toThrow();
		expect(() =>
			assertExchangeMutationAllowed("updateIsolatedMargin", { asset: 1, isBuy: true, ntli: "-1" }),
		).not.toThrow();
	});
});
