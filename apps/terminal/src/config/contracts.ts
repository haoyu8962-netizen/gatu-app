export { BRIDGE2_ABI } from "./abi/bridge2";

export const ARBITRUM_MAINNET_CHAIN_ID = 42161;
export const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
export const ARBITRUM_CHAIN_ID = ARBITRUM_MAINNET_CHAIN_ID;
export const HYPERCORE_CHAIN_ID = 1337;
export const HYPERCORE_USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

export const DEPOSIT_NETWORKS = {
	mainnet: {
		chainId: ARBITRUM_MAINNET_CHAIN_ID,
		chainName: "Arbitrum One",
		displayName: "Arbitrum",
		rpcUrl: "https://arb1.arbitrum.io/rpc",
		blockExplorerUrl: "https://arbiscan.io",
		usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const,
		bridge2: "0x2df1c51e09aecf9cacb7bc98cb1742757f163df7" as const,
		usdcPermitName: "USD Coin",
		usdcPermitVersion: "2",
		smartDepositEnabled: true,
	},
	testnet: {
		chainId: ARBITRUM_SEPOLIA_CHAIN_ID,
		chainName: "Arbitrum Sepolia",
		displayName: "Arbitrum Sepolia",
		rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
		blockExplorerUrl: "https://sepolia.arbiscan.io",
		usdc: "0x1baAbB04529D43a73232B713C0FE471f7c7334d5" as const,
		bridge2: "0x08cfc1B6b2dCF36A1480b99353A354AA8AC56f89" as const,
		usdcPermitName: "USDC2",
		usdcPermitVersion: "1",
		smartDepositEnabled: true,
	},
} as const;

export const CONTRACTS = {
	arbitrum: {
		usdc: DEPOSIT_NETWORKS.mainnet.usdc,
		bridge2: DEPOSIT_NETWORKS.mainnet.bridge2,
	},
} as const;

export const USDC_DECIMALS = 6;
export const MIN_DEPOSIT_USDC = 5n * 10n ** 6n;
export const MIN_WITHDRAW_USD = 1;
export const WITHDRAWAL_FEE_USD = 1;
