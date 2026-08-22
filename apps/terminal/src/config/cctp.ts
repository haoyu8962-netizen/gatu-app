export const ARBITRUM_CCTP_DOMAIN = 3;
export const CCTP_WITHDRAWAL_GAS_LIMIT = 200_000;
export const CCTP_AUTOMATIC_FORWARDING_DATA = "0x";
export const CCTP_MINIMUM_FEE_MULTIPLIER = 2;
export const LEGACY_WITHDRAWAL_FEE_USDC = "1";
export const LEGACY_MINIMUM_WITHDRAWAL_USDC = "1";

export const CCTP_NETWORKS = {
	mainnet: {
		hyperEvmRpcUrl: "https://rpc.hyperliquid.xyz/evm",
		coreDepositWallet: "0x6B9E773128f453f5c2C60935Ee2DE2CBc5390A24" as const,
	},
	testnet: {
		hyperEvmRpcUrl: "https://rpc.hyperliquid-testnet.xyz/evm",
		coreDepositWallet: "0x0B80659a4076E9E93C7DbE0f10675A16a3e5C206" as const,
	},
} as const;
