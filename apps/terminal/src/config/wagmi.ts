import type { Chain } from "viem";
import { createConfig, http } from "wagmi";
import {
	arbitrum,
	aurora,
	avalanche,
	base,
	blast,
	bsc,
	celo,
	fantom,
	gnosis,
	linea,
	mainnet,
	mantle,
	mode,
	moonbeam,
	optimism,
	polygon,
	polygonZkEvm,
	scroll,
	zkSync,
} from "wagmi/chains";
import { coinbaseWallet, injected, mock, walletConnect } from "wagmi/connectors";
import { APP_NAME } from "@/config/app";
import type { MockWalletConfig } from "@/lib/wallet-utils";
import { registerMockWallet } from "@/lib/wallet-utils";

// All chains supported for LiFi bridging — wagmi requires these upfront
const BRIDGE_CHAINS = [
	arbitrum,
	mainnet,
	polygon,
	optimism,
	base,
	bsc,
	avalanche,
	fantom,
	gnosis,
	zkSync,
	scroll,
	linea,
	mode,
	blast,
	mantle,
	celo,
	moonbeam,
	aurora,
	polygonZkEvm,
] as const satisfies readonly [Chain, ...Chain[]];

const DEFAULT_ETHEREUM_RPC_URL = "https://ethereum-rpc.publicnode.com";

export function getBridgeRpcUrl(
	chain: Pick<Chain, "id">,
	env: Record<string, string | undefined> = import.meta.env,
): string | undefined {
	if (chain.id === mainnet.id) return env.VITE_ETHEREUM_RPC_URL || DEFAULT_ETHEREUM_RPC_URL;
	return undefined;
}

const BRIDGE_TRANSPORTS = Object.fromEntries(
	BRIDGE_CHAINS.map((chain) => [chain.id, http(getBridgeRpcUrl(chain))]),
) as Record<(typeof BRIDGE_CHAINS)[number]["id"], ReturnType<typeof http>>;

function createMockConnectors(mockWallets: MockWalletConfig[]) {
	return mockWallets.map((wallet) => {
		registerMockWallet(wallet);
		return mock({
			accounts: [wallet.address],
			features: { reconnect: true },
		});
	});
}

interface WagmiConfigOptions {
	mockWallets?: MockWalletConfig[];
}

const WALLET_CONNECT_PROJECT_ID = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID;
const WALLET_CONNECT_METADATA = {
	name: APP_NAME,
	description: "Professional trading terminal for Hyperliquid.",
	url: "https://hypeterminal.xyz",
	icons: ["https://hypeterminal.xyz/icon-192.png"],
};

export function createWagmiConfig(options: WagmiConfigOptions = {}) {
	const { mockWallets = [] } = options;
	const mockConnectors = createMockConnectors(mockWallets);

	return createConfig({
		chains: BRIDGE_CHAINS,
		connectors: [
			...mockConnectors,
			injected(),
			coinbaseWallet(),
			walletConnect({
				projectId: WALLET_CONNECT_PROJECT_ID,
				metadata: WALLET_CONNECT_METADATA,
				showQrModal: false,
			}),
		],
		transports: BRIDGE_TRANSPORTS,
		ssr: true,
	});
}

export const MOCK_WALLETS: MockWalletConfig[] = import.meta.env.DEV
	? [
			{
				name: "Mock Wallet",
				address: "0x5b5d51203a0f9079f8aeb098a6523a13f298c060",
			},
		]
	: [];

export const config = createWagmiConfig({
	mockWallets: MOCK_WALLETS,
});
