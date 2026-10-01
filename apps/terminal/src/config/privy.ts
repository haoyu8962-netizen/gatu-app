import type { PrivyClientConfig, WalletListEntry } from "@privy-io/react-auth";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { getNetwork } from "@/lib/network";
import { BRIDGE_CHAINS } from "./wagmi";

export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;
const privyDefaultChain = getNetwork() === "testnet" ? arbitrumSepolia : arbitrum;

type PrivyTheme = "dark" | "light";
type PrivyClientConfigWithPasskeysDisabled = PrivyClientConfig & {
	globalDisablePasskeys: true;
};

const PRIVY_APPEARANCE_BY_THEME = {
	dark: {
		theme: "#0F1A1F",
		accentColor: "#EDEEF2",
		logo: "/brand/lockup-on-dark.svg",
	},
	light: {
		theme: "#FFFFFF",
		accentColor: "#15171E",
		logo: "/brand/lockup-on-light.svg",
	},
} as const satisfies Record<
	PrivyTheme,
	Pick<NonNullable<PrivyClientConfig["appearance"]>, "accentColor" | "logo" | "theme">
>;

export const PRIVY_WALLET_LIST = [
	"binance",
	"metamask",
	"okx_wallet",
	"bitget_wallet",
	"uniswap",
	"coinbase_wallet",
	"detected_ethereum_wallets",
	"wallet_connect",
] as const satisfies readonly WalletListEntry[];

function createPrivyConfig(theme: PrivyTheme): PrivyClientConfigWithPasskeysDisabled {
	return {
		defaultChain: privyDefaultChain,
		supportedChains: [...BRIDGE_CHAINS],
		embeddedWallets: {
			ethereum: {
				createOnLogin: "users-without-wallets",
			},
			showWalletUIs: false,
		},
		loginMethods: ["wallet", "email"],
		globalDisablePasskeys: true,
		appearance: {
			...PRIVY_APPEARANCE_BY_THEME[theme],
			showWalletLoginFirst: true,
			walletChainType: "ethereum-only",
			walletList: [...PRIVY_WALLET_LIST],
		},
	};
}

export const PRIVY_CONFIG_BY_THEME = {
	dark: createPrivyConfig("dark"),
	light: createPrivyConfig("light"),
} as const satisfies Record<PrivyTheme, PrivyClientConfigWithPasskeysDisabled>;

export const privyConfig = PRIVY_CONFIG_BY_THEME.dark;
