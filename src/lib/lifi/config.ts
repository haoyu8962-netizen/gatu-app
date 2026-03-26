import { createConfig, EVM } from "@lifi/sdk";
import type { Config as WagmiConfig } from "@wagmi/core";
import { getClient, getConnectorClient, switchChain } from "@wagmi/core";
import type { Client } from "viem";
import { config as wagmiConfig } from "@/config/wagmi";

const wc = wagmiConfig as unknown as WagmiConfig;

export function initLiFi() {
	return createConfig({
		integrator: "hypeterminal",
		providers: [
			EVM({
				getWalletClient: () => getConnectorClient(wc) as Promise<Client>,
				switchChain: async (chainId: number) => {
					const result = await switchChain(wc, { chainId });
					return getClient(wc, { chainId: result.id }) as Client;
				},
			}),
		],
	});
}
