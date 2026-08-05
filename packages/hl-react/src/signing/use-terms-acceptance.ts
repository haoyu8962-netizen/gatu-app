import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useWalletClient } from "wagmi";
import { WalletAccountMismatchError } from "../errors";
import { infoKey } from "../hooks/useInfo";
import { useHttpTransport } from "../hooks/useTransport";
import { acceptHyperliquidTerms, type LegalStatus, parseLegalStatus } from "../legal";
import { useHyperliquid } from "../provider";
import { toHyperliquidWallet, walletClientMatchesAddress } from "../wallet";

export function useTermsAcceptance() {
	const { clientKey, env, info } = useHyperliquid();
	const address = clientKey === "disconnected" ? undefined : (clientKey as `0x${string}`);
	const { data: walletClient } = useWalletClient();
	const transport = useHttpTransport();
	const queryClient = useQueryClient();
	const identityRef = useRef({ address, env });
	identityRef.current = { address, env };

	return useMutation<LegalStatus, Error, void>({
		mutationKey: ["hl", "acceptTerms2", env, address],
		mutationFn: async () => {
			const startAddress = address;
			const startEnv = env;
			if (!startAddress || !walletClientMatchesAddress(walletClient, startAddress)) {
				throw new WalletAccountMismatchError();
			}
			const wallet = toHyperliquidWallet(walletClient, startAddress);
			if (!wallet) throw new WalletAccountMismatchError();

			await acceptHyperliquidTerms({ wallet, transport, env: startEnv, user: startAddress });
			const currentIdentity = identityRef.current;
			if (currentIdentity.env !== startEnv || currentIdentity.address?.toLowerCase() !== startAddress.toLowerCase()) {
				throw new Error("Wallet changed while accepting terms");
			}

			const confirmedResponse = await info.legalCheck({ user: startAddress });
			const confirmedStatus = parseLegalStatus(confirmedResponse as unknown);
			if (!confirmedStatus.acceptedTerms) {
				throw new Error("Terms acceptance could not be confirmed");
			}
			queryClient.setQueryData(infoKey("legalCheck", { user: startAddress }, startEnv), confirmedResponse);
			return confirmedStatus;
		},
	});
}
