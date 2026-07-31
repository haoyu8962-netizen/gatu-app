import { useSignTypedData } from "@privy-io/react-auth";
import { useRef, useState } from "react";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import type { ExchangeParams, ExchangeResponse } from "@/lib/hyperliquid";
import {
	captureAgentRegistrationExecutionLease,
	createExchangeClient,
	startAgentRegistrationExecution,
	useExchange,
	useHyperliquid,
} from "@/lib/hyperliquid";
import { createPrivyAgentSigner } from "@/lib/wallet/privy-agent-signer";
import { hasSameWalletAddress } from "@/lib/wallet/privy-wagmi";
import { useWalletSession } from "./use-wallet-session";

export interface ExplicitAgentApproval {
	mutateAsync: (
		params: ExchangeParams<"approveAgent">,
		options?: ExplicitAgentApprovalOptions,
	) => Promise<ExchangeResponse<"approveAgent">>;
	isPending: boolean;
}

export interface ExplicitAgentApprovalOptions {
	/**
	 * Forwarded to the direct embedded-wallet SDK request. External-wallet
	 * fallback can only reject an already-aborted operation before dispatch;
	 * its wallet prompt cannot be cancelled after the mutation starts.
	 */
	signal?: AbortSignal;
}

/**
 * Agent approval must always be an explicit master-wallet action. Privy email
 * sessions use a dedicated signer so the per-action confirmation UI cannot be
 * suppressed by the app-wide embedded-wallet setting.
 */
export function useExplicitAgentApproval(): ExplicitAgentApproval {
	const fallbackApproval = useExchange("approveAgent");
	const { signTypedData } = useSignTypedData();
	const { env, exchangeLifecycle } = useHyperliquid();
	const { walletAddress, connectedWalletAddress, embeddedWalletAddress, hasWalletAccess } = useWalletSession();
	const inFlightRef = useRef(false);
	const [isPrivyApprovalPending, setIsPrivyApprovalPending] = useState(false);

	async function mutateAsync(
		params: ExchangeParams<"approveAgent">,
		options: ExplicitAgentApprovalOptions = {},
	): Promise<ExchangeResponse<"approveAgent">> {
		throwIfApprovalAborted(options.signal);
		if (!hasWalletAccess || !walletAddress) {
			throw new Error("Connect the selected Hyperliquid master wallet before approving mobile access.");
		}
		if (inFlightRef.current) {
			throw new Error("A mobile access approval is already pending.");
		}

		inFlightRef.current = true;
		try {
			if (!hasSameWalletAddress(walletAddress, embeddedWalletAddress)) {
				return await fallbackApproval.mutateAsync(params);
			}

			setIsPrivyApprovalPending(true);
			const registrationLease = captureAgentRegistrationExecutionLease(env, walletAddress);
			if (!registrationLease) {
				throw new Error("The wallet session changed before mobile access approval.");
			}
			const guarded = await startAgentRegistrationExecution(
				registrationLease,
				() => exchangeLifecycle.active && options.signal?.aborted !== true,
				() => {
					const signer = createPrivyAgentSigner({
						expectedAddress: walletAddress,
						activeAddress: connectedWalletAddress,
						embeddedWalletAddress,
						chainId: env === "Testnet" ? arbitrumSepolia.id : arbitrum.id,
						signTypedData,
					});
					const client = createExchangeClient(signer, env === "Testnet");
					return client.approveAgent(params, options.signal ? { signal: options.signal } : undefined);
				},
			);
			if (guarded.status === "invalidated") {
				throw new Error("The wallet session changed before mobile access approval.");
			}
			return await guarded.execution;
		} finally {
			inFlightRef.current = false;
			setIsPrivyApprovalPending(false);
		}
	}

	return {
		mutateAsync,
		isPending: fallbackApproval.isPending || isPrivyApprovalPending,
	};
}

function throwIfApprovalAborted(signal: AbortSignal | undefined): void {
	if (!signal?.aborted) return;
	const error = new Error("The mobile access approval was cancelled before signing.");
	error.name = "AbortError";
	throw error;
}
