import type { AbstractWallet } from "@nktkas/hyperliquid/signing";
import { useSignTypedData } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { useWalletClient } from "wagmi";
import type { ExchangeParams, ExchangeResponse } from "@/lib/hyperliquid";
import {
	captureAgentRegistrationExecutionLease,
	createExchangeClient,
	isAgentRegistrationExecutionLeaseCurrent,
	startAgentRegistrationExecution,
	useHyperliquid,
	verifyLegalActionAllowed,
} from "@/lib/hyperliquid";
import { createExternalAgentSigner } from "@/lib/wallet/external-agent-signer";
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
	 * Forwarded to direct embedded- and external-wallet SDK requests and checked
	 * before signing and again before the signed request is submitted.
	 */
	signal?: AbortSignal;
}

/**
 * Agent approval must always be an explicit master-wallet action. Privy email
 * sessions use a dedicated signer so the per-action confirmation UI cannot be
 * suppressed by the app-wide embedded-wallet setting.
 */
export function useExplicitAgentApproval(): ExplicitAgentApproval {
	const queryClient = useQueryClient();
	const { signTypedData } = useSignTypedData();
	const { data: walletClient } = useWalletClient();
	const { enforceLegalActions, env, exchangeLifecycle, info } = useHyperliquid();
	const { walletAddress, connectedWalletAddress, embeddedWalletAddress, hasWalletAccess, walletIntent } =
		useWalletSession();
	const inFlightRef = useRef(false);
	const walletClientAddress = walletClient?.account?.address;
	const identityRef = useRef({
		connectedWalletAddress,
		embeddedWalletAddress,
		env,
		hasWalletAccess,
		walletAddress,
		walletClientAddress,
		walletIntent,
	});
	identityRef.current = {
		connectedWalletAddress,
		embeddedWalletAddress,
		env,
		hasWalletAccess,
		walletAddress,
		walletClientAddress,
		walletIntent,
	};
	const [isExplicitApprovalPending, setIsExplicitApprovalPending] = useState(false);

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
			const approvalWalletIntent = walletIntent;
			if (approvalWalletIntent !== "embedded" && approvalWalletIntent !== "external") {
				throw new Error("The active wallet does not match the selected Hyperliquid account.");
			}
			if (!hasSameWalletAddress(connectedWalletAddress, walletAddress)) {
				throw new Error("The active wallet does not match the selected Hyperliquid account.");
			}
			if (approvalWalletIntent === "embedded" && !hasSameWalletAddress(embeddedWalletAddress, walletAddress)) {
				throw new Error("The active embedded wallet does not match the selected Hyperliquid account.");
			}
			if (
				approvalWalletIntent === "external" &&
				(!walletClient || !hasSameWalletAddress(walletClient.account?.address, walletAddress))
			) {
				throw new Error("The active external wallet does not match the selected Hyperliquid account.");
			}
			const assertApprovalSessionCurrent = () => {
				throwIfApprovalAborted(options.signal);
				const current = identityRef.current;
				if (
					!exchangeLifecycle.active ||
					!current.hasWalletAccess ||
					current.env !== env ||
					current.walletIntent !== approvalWalletIntent ||
					!hasSameWalletAddress(current.walletAddress, walletAddress) ||
					!hasSameWalletAddress(current.connectedWalletAddress, walletAddress)
				) {
					throw new Error("The wallet session changed before mobile access approval.");
				}
				if (
					approvalWalletIntent === "embedded" &&
					!hasSameWalletAddress(current.embeddedWalletAddress, walletAddress)
				) {
					throw new Error("The wallet session changed before mobile access approval.");
				}
				if (approvalWalletIntent === "external" && !hasSameWalletAddress(current.walletClientAddress, walletAddress)) {
					throw new Error("The wallet session changed before mobile access approval.");
				}
			};

			setIsExplicitApprovalPending(true);
			if (enforceLegalActions) {
				await verifyLegalActionAllowed({
					queryClient,
					info,
					env,
					owner: walletAddress,
				});
			}
			assertApprovalSessionCurrent();
			const registrationLease = captureAgentRegistrationExecutionLease(env, walletAddress);
			if (!registrationLease) {
				throw new Error("The wallet session changed before mobile access approval.");
			}
			const guarded = await startAgentRegistrationExecution(
				registrationLease,
				() => {
					try {
						assertApprovalSessionCurrent();
						return true;
					} catch {
						return false;
					}
				},
				() => {
					const beforeSubmit = async () => {
						assertApprovalSessionCurrent();
						if (enforceLegalActions) {
							await verifyLegalActionAllowed({
								queryClient,
								info,
								env,
								owner: walletAddress,
								forceFresh: true,
							});
						}
						assertApprovalSessionCurrent();
						if (!(await isAgentRegistrationExecutionLeaseCurrent(registrationLease))) {
							throw new Error("The wallet session changed before mobile access approval.");
						}
						assertApprovalSessionCurrent();
					};
					let signer: AbstractWallet;
					if (approvalWalletIntent === "embedded") {
						signer = createPrivyAgentSigner({
							expectedAddress: walletAddress,
							activeAddress: connectedWalletAddress,
							embeddedWalletAddress,
							chainId: env === "Testnet" ? arbitrumSepolia.id : arbitrum.id,
							signTypedData,
							beforeSubmit,
						});
					} else {
						if (!walletClient) {
							throw new Error("The active external wallet does not match the selected Hyperliquid account.");
						}
						signer = createExternalAgentSigner({
							expectedAddress: walletAddress,
							walletClient,
							beforeSubmit,
						});
					}
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
			setIsExplicitApprovalPending(false);
		}
	}

	return {
		mutateAsync,
		isPending: isExplicitApprovalPending,
	};
}

function throwIfApprovalAborted(signal: AbortSignal | undefined): void {
	if (!signal?.aborted) return;
	const error = new Error("The mobile access approval was cancelled before signing.");
	error.name = "AbortError";
	throw error;
}
