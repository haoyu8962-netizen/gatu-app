export interface CctpDepositFeatureEnv {
	VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED?: string;
	VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED?: string;
	VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED?: string;
}

export interface CctpDepositFeatureFlags {
	mainnetSponsoredWallet: boolean;
	testnetExternalWallet: boolean;
	testnetSponsoredWallet: boolean;
}

/**
 * Direct Mainnet deposits from an external owner wallet are a permanent product
 * capability. Testnet and sponsored deposits remain independently gated, while
 * every path still passes the runtime routing, geo, signer, fee, allowance,
 * balance, receipt, and recovery guards before funds can move. This module has
 * no build-time environment access so the Vite config and the runtime can share it.
 */
export function resolveCctpDepositFeatureFlags(env: CctpDepositFeatureEnv): CctpDepositFeatureFlags {
	return {
		mainnetSponsoredWallet: env.VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED === "true",
		testnetExternalWallet: env.VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED === "true",
		testnetSponsoredWallet: env.VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED === "true",
	};
}
