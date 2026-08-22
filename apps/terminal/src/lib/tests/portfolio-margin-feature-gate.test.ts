import { describe, expect, it } from "vitest";
import { resolvePortfolioMarginFeatureFlags } from "@/config/portfolio-margin";
import { assertPortfolioMarginActivationAllowed } from "@/hooks/trade/use-account-abstraction-control";

describe("portfolio margin activation gate", () => {
	it("fails closed when configuration is absent or not exactly true", () => {
		expect(resolvePortfolioMarginFeatureFlags({})).toEqual({ activationEnabled: false });
		expect(
			resolvePortfolioMarginFeatureFlags({
				VITE_PORTFOLIO_MARGIN_ACTIVATION_ENABLED: "TRUE",
			}),
		).toEqual({ activationEnabled: false });
		expect(
			resolvePortfolioMarginFeatureFlags({
				VITE_PORTFOLIO_MARGIN_ACTIVATION_ENABLED: "1",
			}),
		).toEqual({ activationEnabled: false });
	});

	it("enables activation only for an exact true value", () => {
		expect(
			resolvePortfolioMarginFeatureFlags({
				VITE_PORTFOLIO_MARGIN_ACTIVATION_ENABLED: "true",
			}),
		).toEqual({ activationEnabled: true });
	});

	it("blocks every portfolio margin write while allowing an existing account to switch away", () => {
		expect(() => assertPortfolioMarginActivationAllowed("unifiedAccount", "portfolioMargin", false)).toThrow(
			"Portfolio margin activation is temporarily unavailable",
		);
		expect(() => assertPortfolioMarginActivationAllowed(null, "portfolioMargin", false)).toThrow(
			"Portfolio margin activation is temporarily unavailable",
		);
		expect(() => assertPortfolioMarginActivationAllowed("portfolioMargin", "portfolioMargin", false)).toThrow(
			"Portfolio margin activation is temporarily unavailable",
		);
		expect(() => assertPortfolioMarginActivationAllowed("portfolioMargin", "unifiedAccount", false)).not.toThrow();
		expect(() => assertPortfolioMarginActivationAllowed("unifiedAccount", "portfolioMargin", true)).not.toThrow();
	});
});
