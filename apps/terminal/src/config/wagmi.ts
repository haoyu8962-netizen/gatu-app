import { createConfig } from "@privy-io/wagmi";
import type { Chain } from "viem";
import { http } from "wagmi";
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
import type { MockWalletConfig } from "@/lib/wallet-utils";

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

// Connectors are intentionally omitted: Privy drives wagmi's connector state for both
// external and embedded wallets. Wallet selection happens through Privy's login modal,
// wired in providers/root.tsx + config/privy.ts.
export const config = createConfig({
	chains: BRIDGE_CHAINS,
	transports: BRIDGE_TRANSPORTS,
});

// Retained as data for the dev-only mock wallet section in wallet-modal.tsx. With Privy
// driving connectors these are no longer registered as wagmi connectors.
export const MOCK_WALLETS: MockWalletConfig[] = import.meta.env.DEV
	? [
			{
				name: "Mock Wallet",
				address: "0x5b5d51203a0f9079f8aeb098a6523a13f298c060",
			},
		]
	: [];
