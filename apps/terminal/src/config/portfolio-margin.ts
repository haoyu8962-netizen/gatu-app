export interface PortfolioMarginFeatureEnv {
	VITE_PORTFOLIO_MARGIN_ACTIVATION_ENABLED?: string;
}

export interface PortfolioMarginFeatureFlags {
	activationEnabled: boolean;
}

export function resolvePortfolioMarginFeatureFlags(
	env: PortfolioMarginFeatureEnv = import.meta.env as PortfolioMarginFeatureEnv,
): PortfolioMarginFeatureFlags {
	return {
		activationEnabled: env.VITE_PORTFOLIO_MARGIN_ACTIVATION_ENABLED === "true",
	};
}

export const PORTFOLIO_MARGIN_FEATURES = resolvePortfolioMarginFeatureFlags();
