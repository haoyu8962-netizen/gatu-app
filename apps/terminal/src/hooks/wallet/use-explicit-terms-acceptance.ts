import { useSignTypedData } from "@privy-io/react-auth";
import { useCallback, useRef } from "react";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { type TermsAcceptanceWalletResolver, useTermsAcceptance } from "@/lib/hyperliquid";
import { createPrivyLegalSigner } from "@/lib/wallet/privy-legal-signer";
import { hasSameWalletAddress } from "@/lib/wallet/privy-wagmi";
import { useWalletSession } from "./use-wallet-session";

/** Uses Privy's explicit, exact-address confirmation UI for email-wallet consent. */
export function useExplicitTermsAcceptance() {
	const { signTypedData } = useSignTypedData();
	const { connectedWalletAddress, embeddedWalletAddress, walletIntent } = useWalletSession();
	const embeddedSession = walletIntent === "embedded";
	const identityRef = useRef({ connectedWalletAddress, embeddedWalletAddress, walletIntent });
	identityRef.current = { connectedWalletAddress, embeddedWalletAddress, walletIntent };
	const resolveWallet = useCallback<TermsAcceptanceWalletResolver>(
		({ address, env }) => {
			if (walletIntent === "ambiguous" || walletIntent === "unavailable") {
				throw new Error("The active Privy login wallet cannot be verified for terms acceptance.");
			}
			if (!embeddedSession) return undefined;
			if (!hasSameWalletAddress(address, embeddedWalletAddress)) {
				throw new Error("The exact email wallet is unavailable for terms acceptance.");
			}
			return createPrivyLegalSigner({
				expectedAddress: address,
				activeAddress: connectedWalletAddress,
				embeddedWalletAddress,
				chainId: env === "Testnet" ? arbitrumSepolia.id : arbitrum.id,
				signTypedData,
				beforeSubmit: () => {
					const current = identityRef.current;
					if (
						current.walletIntent !== "embedded" ||
						!hasSameWalletAddress(address, current.connectedWalletAddress) ||
						!hasSameWalletAddress(address, current.embeddedWalletAddress)
					) {
						throw new Error("The email wallet changed before terms acceptance.");
					}
				},
			});
		},
		[connectedWalletAddress, embeddedSession, embeddedWalletAddress, signTypedData, walletIntent],
	);

	return useTermsAcceptance({ resolveWallet });
}
