import type { PrivyClientConfig } from "@privy-io/react-auth";

export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;

// Embedded wallets are plain EOAs. Do NOT enable smart wallets / account abstraction:
// Hyperliquid agent + builder-fee approvals require an EOA ECDSA signature, which the
// existing agent layer (packages/hl-react/src/signing) depends on.
export const privyConfig: PrivyClientConfig = {
	embeddedWallets: {
		createOnLogin: "users-without-wallets",
		showWalletUIs: true,
	},
	loginMethods: ["wallet", "email"],
	appearance: {
		showWalletLoginFirst: true,
	},
};
