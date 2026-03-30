import { type Chain, createConfig, http } from "wagmi";
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

const BRIDGE_TRANSPORTS = Object.fromEntries(BRIDGE_CHAINS.map((chain) => [chain.id, http()])) as Record<
	(typeof BRIDGE_CHAINS)[number]["id"],
	ReturnType<typeof http>
>;

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

export function createWagmiConfig(options: WagmiConfigOptions = {}) {
	const { mockWallets = [] } = options;
	const mockConnectors = createMockConnectors(mockWallets);

	return createConfig({
		chains: BRIDGE_CHAINS,
		connectors: [
			...mockConnectors,
			injected(),
			coinbaseWallet(),
			walletConnect({ projectId: import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID }),
		],
		transports: BRIDGE_TRANSPORTS,
		ssr: true,
	});
}

export const MOCK_WALLETS: MockWalletConfig[] = [
	{
		name: "Mock Wallet",
		address: "0x5b5d51203a0f9079f8aeb098a6523a13f298c060",
	},
];

export const config = createWagmiConfig({
	mockWallets: MOCK_WALLETS,
});
