import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { AbstractWallet } from "@nktkas/hyperliquid/signing";
import { useSignTypedData } from "@privy-io/react-auth";
import { useConnectionWalletClient } from "@sairn/hl-react";
import { assertExchangeSigningDeadline } from "@sairn/hl-react/internal/exchange/request-scheduler";
import { useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
import { isAddress, type WalletClient } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { createActionError } from "@/lib/errors/action-error";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";
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
	const walletClient = useConnectionWalletClient().data as WalletClient | undefined;
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
		if (!isAddress(params.agentAddress)) throw createActionError("request-invalid");
		if (
			registrationPublicKey &&
			(!isAddress(registrationPublicKey) || registrationPublicKey.toLowerCase() !== params.agentAddress.toLowerCase())
		) {
			throw createActionError("request-invalid");
		}
		if (!hasWalletAccess || !walletAddress) throw createActionError("wallet-unavailable");
		if (inFlightRef.current) {
			throw new LocalizedActionError(msg`Another wallet approval is already in progress. Try again after it finishes.`);
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
				throw createActionError("wallet-mismatch");
			}
			if (!hasSameWalletAddress(connectedWalletAddress, walletAddress)) throw createActionError("wallet-mismatch");
			if (approvalWalletIntent === "embedded" && !hasSameWalletAddress(embeddedWalletAddress, walletAddress)) {
				throw createActionError("wallet-mismatch");
			}
			if (
				approvalWalletIntent === "external" &&
				(!walletClient || !hasSameWalletAddress(walletClient.account?.address, walletAddress))
			) {
				throw createActionError("wallet-mismatch");
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
					throw createActionError("identity-changed");
				}
				if (
					approvalWalletIntent === "embedded" &&
					!hasSameWalletAddress(current.embeddedWalletAddress, walletAddress)
				) {
					throw createActionError("identity-changed");
				}
				if (approvalWalletIntent === "external" && !hasSameWalletAddress(current.walletClientAddress, walletAddress)) {
					throw createActionError("identity-changed");
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
				throw createActionError("identity-changed");
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
				if (options.deadline) assertExchangeSigningDeadline(options.deadline);
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
						throw createActionError("identity-changed");
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
						reviewCopy: {
							title: i18n._(msg`Approve mobile trading access`),
							description: i18n._(msg`Review and approve this Hyperliquid Agent permission.`),
							buttonText: i18n._(msg`Approve access`),
						},
					});
				} else {
					if (!walletClient) throw createActionError("wallet-mismatch");
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
							throw createActionError("identity-changed");
						}
						return await submission.execution;
					},
				};
				const client = createExchangeClient(signer, env === "Testnet", undefined, transport);
				return client.approveAgent(params, options.signal ? { signal: options.signal } : undefined);
			});
			if (guarded.status === "invalidated") {
				throw createActionError("identity-changed");
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
