import type { PrivyClientConfig } from "@privy-io/react-auth";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { getNetwork } from "@/lib/network";
import { BRIDGE_CHAINS } from "./wagmi";

export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;
const privyDefaultChain = getNetwork() === "testnet" ? arbitrumSepolia : arbitrum;

export const privyConfig: PrivyClientConfig = {
	defaultChain: privyDefaultChain,
	supportedChains: [...BRIDGE_CHAINS],
	embeddedWallets: {
		ethereum: {
			createOnLogin: "users-without-wallets",
		},
		showWalletUIs: false,
	},
	loginMethods: ["wallet", "email"],
	appearance: {
		showWalletLoginFirst: true,
	},
};
