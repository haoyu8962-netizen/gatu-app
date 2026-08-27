import type { AbstractWallet } from "@nktkas/hyperliquid/signing";
import { useSignTypedData } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
import { isAddress } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { useWalletClient } from "wagmi";
import type { AgentApprovalOptions, ExchangeParams, ExchangeResponse } from "@/lib/hyperliquid";
import {
	captureAgentRegistrationExecutionLease,
	createExchangeClient,
	HttpTransport,
	type IRequestTransport,
	isAgentRegistrationExecutionLeaseCurrent,
	startAgentRegistrationExecution,
	startAgentRegistrationSubmission,
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

export type ExplicitAgentApprovalOptions = AgentApprovalOptions;

/**
 * Agent approval must always be initiated by an explicit master-wallet action.
 * The dedicated Privy signer may hide its second confirmation only after the
 * caller confirms that the user reviewed the permission in the application.
 */
export function useExplicitAgentApproval(): ExplicitAgentApproval {
	const queryClient = useQueryClient();
	const { signTypedData } = useSignTypedData();
	const { data: walletClient } = useWalletClient();
	const { enforceLegalActions, env, exchangeLifecycle, info } = useHyperliquid();
	const { walletAddress, connectedWalletAddress, embeddedWalletAddress, hasWalletAccess, walletIntent } =
		useWalletSession();
	const inFlightRef = useRef<symbol | null>(null);
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
	const [isExplicitApprovalPending, setIsExplicitApprovalPending] = useState(false);

	useLayoutEffect(() => {
		identityRef.current = {
			connectedWalletAddress,
			embeddedWalletAddress,
			env,
			hasWalletAccess,
			walletAddress,
			walletClientAddress,
			walletIntent,
		};
	}, [
		connectedWalletAddress,
		embeddedWalletAddress,
		env,
		hasWalletAccess,
		walletAddress,
		walletClientAddress,
		walletIntent,
	]);

	async function mutateAsync(
		params: ExchangeParams<"approveAgent">,
		options: ExplicitAgentApprovalOptions = {},
	): Promise<ExchangeResponse<"approveAgent">> {
		const applicationReview = options.applicationReview === "confirmed" ? "confirmed" : undefined;
		const registrationPublicKey = options.registrationPublicKey;
		throwIfApprovalAborted(options.signal);
		if (!isAddress(params.agentAddress)) {
			throw new Error("A valid Agent address is required.");
		}
		if (
			registrationPublicKey &&
			(!isAddress(registrationPublicKey) || registrationPublicKey.toLowerCase() !== params.agentAddress.toLowerCase())
		) {
			throw new Error("The pending Agent address changed before approval.");
		}
		if (!hasWalletAccess || !walletAddress) {
			throw new Error("Connect the selected Hyperliquid master wallet before approving mobile access.");
		}
		if (inFlightRef.current) {
			throw new Error("A mobile access approval is already pending.");
		}

		const attempt = Symbol("explicit-agent-approval");
		inFlightRef.current = attempt;
		const releaseAttempt = () => {
			if (inFlightRef.current !== attempt) return;
			inFlightRef.current = null;
			setIsExplicitApprovalPending(false);
		};
		options.signal?.addEventListener("abort", releaseAttempt, { once: true });
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
			const registrationLease = captureAgentRegistrationExecutionLease(
				env,
				walletAddress,
				registrationPublicKey ? { agentPublicKey: registrationPublicKey } : undefined,
			);
			if (!registrationLease) {
				throw new Error("The wallet session changed before mobile access approval.");
			}
			const canSubmit = () => {
				try {
					assertApprovalSessionCurrent();
					return true;
				} catch {
					return false;
				}
			};
			const guarded = await startAgentRegistrationExecution(registrationLease, canSubmit, () => {
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
						applicationReview,
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
				const baseTransport = new HttpTransport({ isTestnet: env === "Testnet" });
				const transport: IRequestTransport = {
					isTestnet: baseTransport.isTestnet,
					async request<T>(endpoint: "info" | "exchange", payload: unknown, signal?: AbortSignal): Promise<T> {
						const execute = () =>
							baseTransport.request<T>(endpoint, payload, registrationPublicKey ? undefined : signal);
						const submission = registrationPublicKey
							? await startAgentRegistrationSubmission(registrationLease, canSubmit, execute)
							: await startAgentRegistrationExecution(registrationLease, canSubmit, execute);
						if (submission.status === "invalidated") {
							throw new Error("The wallet session changed before mobile access approval.");
						}
						return await submission.execution;
					},
				};
				const client = createExchangeClient(signer, env === "Testnet", undefined, transport);
				return client.approveAgent(params, options.signal ? { signal: options.signal } : undefined);
			});
			if (guarded.status === "invalidated") {
				throw new Error("The wallet session changed before mobile access approval.");
			}
			return await guarded.execution;
		} finally {
			options.signal?.removeEventListener("abort", releaseAttempt);
			releaseAttempt();
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
