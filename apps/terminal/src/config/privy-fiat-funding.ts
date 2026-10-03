import { type PrivyFiatFundingFeatureEnv, resolvePrivyFiatFundingFeatureFlags } from "./privy-fiat-funding-flags";

export const PRIVY_FIAT_FUNDING_FEATURES = resolvePrivyFiatFundingFeatureFlags(
	import.meta.env as PrivyFiatFundingFeatureEnv,
);

export function isPrivyFiatFundingEnabled(isTestnet: boolean): boolean {
	return isTestnet ? PRIVY_FIAT_FUNDING_FEATURES.testnet : PRIVY_FIAT_FUNDING_FEATURES.mainnet;
}
