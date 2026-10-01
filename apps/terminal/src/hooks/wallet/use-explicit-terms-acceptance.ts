import { useSignTypedData } from "@privy-io/react-auth";
import { useHyperliquidOwnerSigner } from "@sairn/hl-react";
import { useCallback, useRef } from "react";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { type TermsAcceptanceWalletResolver, useTermsAcceptance } from "@/lib/hyperliquid";
import { createPrivyLegalSigner } from "@/lib/wallet/privy-legal-signer";
import { hasSameWalletAddress } from "@/lib/wallet/privy-wagmi";
import { useWalletSession } from "./use-wallet-session";

export function useExplicitTermsAcceptance() {
	const { signTypedData } = useSignTypedData();
	const ownerSigner = useHyperliquidOwnerSigner();
	const { connectedWalletAddress, embeddedWalletAddress, walletIntent } = useWalletSession();
	const embeddedSession = walletIntent === "embedded";
	const identityRef = useRef({ connectedWalletAddress, embeddedWalletAddress, walletIntent });
	identityRef.current = { connectedWalletAddress, embeddedWalletAddress, walletIntent };
	const assertSigningSessionCurrent = useCallback(
		({ address }: { address: `0x${string}`; env: "Mainnet" | "Testnet" }) => {
			if (walletIntent === "ambiguous" || walletIntent === "unavailable") {
				throw new Error("The active Privy login wallet cannot be verified for terms acceptance.");
			}
			if (!embeddedSession) return;
			if (!ownerSigner?.wallet || !hasSameWalletAddress(address, ownerSigner.ownerAddress)) {
				throw new Error("The exact email signing session is unavailable for terms acceptance.");
			}
			ownerSigner.assertCurrent();
		},
		[embeddedSession, ownerSigner, walletIntent],
	);
	const resolveWallet = useCallback<TermsAcceptanceWalletResolver>(
		({ address, env }) => {
			assertSigningSessionCurrent({ address, env });
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
					assertSigningSessionCurrent({ address, env });
				},
			});
		},
		[assertSigningSessionCurrent, connectedWalletAddress, embeddedSession, embeddedWalletAddress, signTypedData],
	);

	return useTermsAcceptance({ resolveWallet, assertSigningSessionCurrent });
}
