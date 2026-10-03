export interface PrivyFiatFundingFeatureEnv {
	VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED?: string;
	VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED?: string;
}

export interface PrivyFiatFundingFeatureFlags {
	mainnet: boolean;
	testnet: boolean;
}

/**
 * Card funding opens a third-party payment and KYC flow, so each network has its own fail-closed
 * build flag (ADR 0034). This module has no build-time environment access so the Vite config and
 * the runtime can share it.
 */
export function resolvePrivyFiatFundingFeatureFlags(env: PrivyFiatFundingFeatureEnv): PrivyFiatFundingFeatureFlags {
	return {
		mainnet: env.VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED === "true",
		testnet: env.VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED === "true",
	};
}
