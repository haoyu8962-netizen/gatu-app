import { type ReactNode, useEffect } from "react";
import { EmailEmbeddedWalletContext, useEmailEmbeddedWalletSession } from "@/hooks/wallet/use-email-embedded-wallet";

interface Props {
	children: ReactNode;
}

export function EmailEmbeddedWalletProvider({ children }: Props) {
	const wallet = useEmailEmbeddedWalletSession();
	const { needsEmbeddedWallet, isCreatingEmbeddedWallet, embeddedWalletError, ensureEmailEmbeddedWallet } = wallet;

	useEffect(() => {
		if (!needsEmbeddedWallet || isCreatingEmbeddedWallet || embeddedWalletError) return;
		void ensureEmailEmbeddedWallet().catch(() => undefined);
	}, [embeddedWalletError, ensureEmailEmbeddedWallet, isCreatingEmbeddedWallet, needsEmbeddedWallet]);

	return <EmailEmbeddedWalletContext value={wallet}>{children}</EmailEmbeddedWalletContext>;
}
