import { ARBITRUM_MAINNET_CHAIN_ID, ARBITRUM_SEPOLIA_CHAIN_ID } from "@/config/contracts";

export const CCTP_ARBITRUM_DOMAIN = 3;
export const CCTP_HYPEREVM_DOMAIN = 19;
export const CCTP_FAST_FINALITY_THRESHOLD = 1000;
export const CCTP_AUTHORIZATION_WINDOW_SECONDS = 60 * 60;
export const CCTP_MAX_DEPOSIT_USDC = 10_000_000n * 10n ** 6n;
export const CCTP_TESTNET_MAX_DEPOSIT_USDC = 1_000n * 10n ** 6n;

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
 * balance, receipt, and recovery guards before funds can move.
 */
export function resolveCctpDepositFeatureFlags(
	env: CctpDepositFeatureEnv = import.meta.env as CctpDepositFeatureEnv,
): CctpDepositFeatureFlags {
	return {
		mainnetSponsoredWallet: env.VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED === "true",
		testnetExternalWallet: env.VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED === "true",
		testnetSponsoredWallet: env.VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED === "true",
	};
}

export const CCTP_DEPOSIT_FEATURES = resolveCctpDepositFeatureFlags();

export function isCctpExternalDepositEnabled(isTestnet: boolean): boolean {
	return isTestnet ? CCTP_DEPOSIT_FEATURES.testnetExternalWallet : true;
}

export function isCctpSponsoredDepositEnabled(isTestnet: boolean): boolean {
	return isTestnet ? CCTP_DEPOSIT_FEATURES.testnetSponsoredWallet : CCTP_DEPOSIT_FEATURES.mainnetSponsoredWallet;
}

const CCTP_FEE_PATH = `/v2/burn/USDC/fees/${CCTP_ARBITRUM_DOMAIN}/${CCTP_HYPEREVM_DOMAIN}?forward=true&hyperCoreDeposit=true`;
const CCTP_FAST_ALLOWANCE_PATH = "/v2/fastBurn/USDC/allowance";

export const CCTP_DEPOSIT_NETWORKS = {
	mainnet: {
		chainId: ARBITRUM_MAINNET_CHAIN_ID,
		chainName: "Arbitrum One",
		displayName: "Arbitrum",
		rpcUrl: "https://arb1.arbitrum.io/rpc",
		blockExplorerUrl: "https://arbiscan.io",
		feeApiUrl: `https://iris-api.circle.com${CCTP_FEE_PATH}`,
		fastAllowanceApiUrl: `https://iris-api.circle.com${CCTP_FAST_ALLOWANCE_PATH}`,
		usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
		cctpExtension: "0xA95d9c1F655341597C94393fDdc30cf3c08E4fcE",
		cctpExtensionV2: "0x3289e443a95B28Bcedacc4B33C689b0C9b84ffAB",
		cctpForwarder: "0xb21D281DEdb17AE5B501F6AA8256fe38C4e45757",
		sourceDomain: CCTP_ARBITRUM_DOMAIN,
		destinationDomain: CCTP_HYPEREVM_DOMAIN,
		usdcAuthorizationName: "USD Coin",
		usdcAuthorizationVersion: "2",
	},
	testnet: {
		chainId: ARBITRUM_SEPOLIA_CHAIN_ID,
		chainName: "Arbitrum Sepolia",
		displayName: "Arbitrum Sepolia",
		rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
		blockExplorerUrl: "https://sepolia.arbiscan.io",
		feeApiUrl: `https://iris-api-sandbox.circle.com${CCTP_FEE_PATH}`,
		fastAllowanceApiUrl: `https://iris-api-sandbox.circle.com${CCTP_FAST_ALLOWANCE_PATH}`,
		usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
		cctpExtension: "0x8E4e3d0E95C1bEC4F3eC7F69aa48473E0Ab6eB8D",
		cctpExtensionV2: "0xC1Fec4e5DAf8796A490653359536f9c2a9C158aE",
		cctpForwarder: "0x02e39ECb8368b41bF68FF99ff351aC9864e5E2a2",
		sourceDomain: CCTP_ARBITRUM_DOMAIN,
		destinationDomain: CCTP_HYPEREVM_DOMAIN,
		usdcAuthorizationName: "USD Coin",
		usdcAuthorizationVersion: "2",
	},
} as const;

export type CctpDepositNetwork = keyof typeof CCTP_DEPOSIT_NETWORKS;
export type CctpDepositConfig = (typeof CCTP_DEPOSIT_NETWORKS)[CctpDepositNetwork];

export function getCctpDepositConfig(isTestnet: boolean): CctpDepositConfig {
	return CCTP_DEPOSIT_NETWORKS[isTestnet ? "testnet" : "mainnet"];
}
