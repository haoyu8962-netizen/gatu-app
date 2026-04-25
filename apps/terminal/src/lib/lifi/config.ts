import { createConfig, EVM } from "@lifi/sdk";
import type { Config as WagmiConfig } from "@wagmi/core";
import { getAccount, getConnectorClient, switchChain } from "@wagmi/core";
import type { Client } from "viem";
import { LIFI_INTEGRATOR } from "@/config/app";
import { config as wagmiConfig } from "@/config/wagmi";

const wc = wagmiConfig as unknown as WagmiConfig;

export function initLiFi() {
	return createConfig({
		integrator: LIFI_INTEGRATOR,
		providers: [
			EVM({
				getWalletClient: async () => {
					const account = getAccount(wc);
					return getConnectorClient(wc, { account: account.address }) as Promise<Client>;
				},
				switchChain: async (chainId: number) => {
					await switchChain(wc, { chainId });
					const account = getAccount(wc);
					return getConnectorClient(wc, { account: account.address, chainId }) as Promise<Client>;
				},
			}),
		],
	});
}
