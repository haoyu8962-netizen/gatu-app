import type { AbstractWallet } from "@nktkas/hyperliquid/signing";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useWalletClient } from "wagmi";
import { WalletAccountMismatchError } from "../errors";
import { infoKey } from "../hooks/useInfo";
import { useHttpTransport } from "../hooks/useTransport";
import {
	acceptHyperliquidTerms,
	assertLegalStatusAllowsTermsAcceptance,
	type LegalStatus,
	parseLegalStatus,
	runWithLegalRequestTimeout,
} from "../legal";
import { useHyperliquid } from "../provider";
import { toHyperliquidWallet, walletClientMatchesAddress } from "../wallet";
import type { HyperliquidEnv } from "./types";

export interface TermsAcceptanceWalletContext {
	address: `0x${string}`;
	env: HyperliquidEnv;
}

export type TermsAcceptanceWalletResolver = (
	context: TermsAcceptanceWalletContext,
) => AbstractWallet | null | undefined | Promise<AbstractWallet | null | undefined>;

export interface UseTermsAcceptanceOptions {
	resolveWallet?: TermsAcceptanceWalletResolver;
}

export function useTermsAcceptance({ resolveWallet }: UseTermsAcceptanceOptions = {}) {
	const { clientKey, env, info } = useHyperliquid();
	const address = clientKey === "disconnected" ? undefined : (clientKey as `0x${string}`);
	const { data: walletClient } = useWalletClient();
	const transport = useHttpTransport();
	const queryClient = useQueryClient();
	const identityRef = useRef({ address, env });
	identityRef.current = { address, env };

	function assertIdentityCurrent(startAddress: `0x${string}`, startEnv: HyperliquidEnv) {
		const currentIdentity = identityRef.current;
		if (currentIdentity.env !== startEnv || currentIdentity.address?.toLowerCase() !== startAddress.toLowerCase()) {
			throw new Error("Wallet changed while accepting terms");
		}
	}

	return useMutation<LegalStatus, Error, void>({
		mutationKey: ["hl", "acceptTerms2", env, address],
		mutationFn: async () => {
			const startAddress = address?.toLowerCase() as `0x${string}` | undefined;
			const startEnv = env;
			if (!startAddress) throw new WalletAccountMismatchError();

			const resolvedWallet = await resolveWallet?.({ address: startAddress, env: startEnv });
			assertIdentityCurrent(startAddress, startEnv);
			let wallet = resolvedWallet;
			if (!wallet) {
				if (!walletClientMatchesAddress(walletClient, startAddress)) {
					throw new WalletAccountMismatchError();
				}
				wallet = toHyperliquidWallet(walletClient, startAddress);
			}
			if (!wallet) throw new WalletAccountMismatchError();

			await acceptHyperliquidTerms({
				wallet,
				transport,
				env: startEnv,
				user: startAddress,
				beforeSubmit: async () => {
					assertIdentityCurrent(startAddress, startEnv);
					const freshResponse = await runWithLegalRequestTimeout((signal) =>
						info.legalCheck({ user: startAddress }, signal),
					);
					assertIdentityCurrent(startAddress, startEnv);
					assertLegalStatusAllowsTermsAcceptance(parseLegalStatus(freshResponse as unknown));
				},
			});
			assertIdentityCurrent(startAddress, startEnv);

			const confirmedResponse = await runWithLegalRequestTimeout((signal) =>
				info.legalCheck({ user: startAddress }, signal),
			);
			assertIdentityCurrent(startAddress, startEnv);
			const confirmedStatus = parseLegalStatus(confirmedResponse as unknown);
			if (!confirmedStatus.acceptedTerms) {
				throw new Error("Terms acceptance could not be confirmed");
			}
			assertIdentityCurrent(startAddress, startEnv);
			queryClient.setQueryData(infoKey("legalCheck", { user: startAddress }, startEnv), confirmedResponse);
			return confirmedStatus;
		},
	});
}
