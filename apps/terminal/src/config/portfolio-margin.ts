export interface PortfolioMarginFeatureEnv {
	VITE_PORTFOLIO_MARGIN_ACTIVATION_ENABLED?: string;
}

export interface PortfolioMarginFeatureFlags {
	activationEnabled: boolean;
}

/**
 * Portfolio margin is still a high-risk pre-alpha account mode. Activation is
 * fail-closed and embedded at build time; changing this flag requires a new
 * build and deployment.
 */
export function resolvePortfolioMarginFeatureFlags(
	env: PortfolioMarginFeatureEnv = import.meta.env as PortfolioMarginFeatureEnv,
): PortfolioMarginFeatureFlags {
	return {
		activationEnabled: env.VITE_PORTFOLIO_MARGIN_ACTIVATION_ENABLED === "true",
	};
}

export const PORTFOLIO_MARGIN_FEATURES = resolvePortfolioMarginFeatureFlags();
