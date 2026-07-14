import { createConfig, EVM } from "@lifi/sdk";
import type { Config as WagmiConfig } from "@wagmi/core";
import { getAccount, getConnectorClient, switchChain } from "@wagmi/core";
import type { Client } from "viem";
import { LIFI_INTEGRATOR } from "@/config/app";
import { config as wagmiConfig } from "@/config/wagmi";

const wc = wagmiConfig as unknown as WagmiConfig;
let lifiInitialized = false;

async function getActiveWalletClient(chainId?: number): Promise<Client> {
	const account = getAccount(wc);
	if (!account.isConnected || !account.address) {
		throw new Error("Wallet connection unavailable. Reconnect your wallet and try again.");
	}

	return getConnectorClient(wc, { account: account.address, chainId }) as Promise<Client>;
}

export function initLiFi() {
	if (lifiInitialized) return;

	createConfig({
		integrator: LIFI_INTEGRATOR,
		providers: [
			EVM({
				getWalletClient: () => getActiveWalletClient(),
				switchChain: async (chainId: number) => {
					const account = getAccount(wc);
					if (!account.isConnected || !account.address) {
						throw new Error("Wallet connection unavailable. Reconnect your wallet and try again.");
					}
					await switchChain(wc, { chainId });
					return getActiveWalletClient(chainId);
				},
			}),
		],
	});
	lifiInitialized = true;
}
