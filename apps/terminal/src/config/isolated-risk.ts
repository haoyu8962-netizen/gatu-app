export interface IsolatedRiskFeatureEnv {
	VITE_ISOLATED_RISK_INCREASE_ENABLED?: string;
}

export interface IsolatedRiskFeatureFlags {
	increaseEnabled: boolean;
}

/**
 * Opening or increasing isolated positions is a separately reviewed rollout.
 * The gate is embedded at build time and fails closed unless it is exactly true.
 */
export function resolveIsolatedRiskFeatureFlags(
	env: IsolatedRiskFeatureEnv = import.meta.env as IsolatedRiskFeatureEnv,
): IsolatedRiskFeatureFlags {
	return {
		increaseEnabled: env.VITE_ISOLATED_RISK_INCREASE_ENABLED === "true",
	};
}

export const ISOLATED_RISK_FEATURES = resolveIsolatedRiskFeatureFlags();

export function assertIsolatedRiskIncreaseAllowed(
	mode: "cross" | "isolated",
	enabled = ISOLATED_RISK_FEATURES.increaseEnabled,
): void {
	if (mode === "isolated" && enabled !== true) {
		throw new Error("Opening or increasing isolated positions is temporarily unavailable");
	}
}
