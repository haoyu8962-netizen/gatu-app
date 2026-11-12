import { useMutation } from "@tanstack/react-query";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { ExchangeActionDeadlineError, startExchangeActionDeadline } from "../internal/exchange/request-scheduler";
import { readPersistTradingConnection } from "./agent-storage";
import { useHyperliquidOwnerSigner } from "./owner-signer-provider";
import type { RegistrationStatus } from "./types";
import { useAgentRegistration } from "./use-agent-registration";
import { useBuilderFeeApproval } from "./use-builder-fee-approval";
import { useTradingStatus } from "./use-trading-status";

/**
 * The Agent approval of this authorization went through and the builder-fee step after it was not signed in time.
 * It is not reported as the deadline error, whose text says that nothing was signed or sent.
 */
export class TradingAuthorizationIncompleteError extends Error {
	constructor(options?: ErrorOptions) {
		super("The Agent was approved, but the builder fee approval was not signed in time", options);
		this.name = "TradingAuthorizationIncompleteError";
	}
}

export interface UseTradingAuthorizationResult {
	authorize: () => Promise<Address>;
	status: RegistrationStatus;
	error: Error | null;
}

export interface UseTradingAuthorizationOptions {
	requiresBuilderFee?: boolean;
}

export function useTradingAuthorization(options: UseTradingAuthorizationOptions = {}): UseTradingAuthorizationResult {
	const requiresBuilderFee = options.requiresBuilderFee !== false;
	const ownerSigner = useHyperliquidOwnerSigner();
	const tradingStatus = useTradingStatus();
	const agentRegistration = useAgentRegistration({ enabled: tradingStatus.signerMode === "agent" });
	const builderFeeApproval = useBuilderFeeApproval();

	const authorization = useMutation({
		mutationKey: [
			"hl",
			"tradingAuthorization",
			tradingStatus.signerMode,
			tradingStatus.signerAddress,
			requiresBuilderFee,
		],
		// The deadline starts at the click (ADR 0053); the request never waits offline before it.
		networkMode: "always",
		mutationFn: async (): Promise<Address> => {
			ownerSigner?.assertCurrent();
			const deadline = startExchangeActionDeadline();
			const refetchRequirements = requiresBuilderFee ? tradingStatus.refetch : tradingStatus.refetchSigner;
			let registeredAddress = tradingStatus.signerAddress;
			let newlyVerifiedAgentAddress: Address | undefined;
			let builderFeeDeadline = deadline;
			let requirements = await refetchRequirements();
			ownerSigner?.assertCurrent();

			if (requirements.needsAgent) {
				registeredAddress = await agentRegistration.register({
					persistConnection: readPersistTradingConnection(),
					deadline,
				});
				// The user has just confirmed the Agent approval in the wallet, which can take longer than the limit:
				// the builder-fee step, itself a wallet prompt on this path, counts from here (ADR 0053 decision 8).
				builderFeeDeadline = startExchangeActionDeadline();
				ownerSigner?.assertCurrent();
				newlyVerifiedAgentAddress = registeredAddress;
				requirements = await refetchRequirements(newlyVerifiedAgentAddress);
				ownerSigner?.assertCurrent();
			}

			if (requiresBuilderFee && requirements.needsBuilderFee) {
				try {
					await builderFeeApproval.approve(builderFeeDeadline);
				} catch (error) {
					if (newlyVerifiedAgentAddress && error instanceof ExchangeActionDeadlineError) {
						throw new TradingAuthorizationIncompleteError({ cause: error });
					}
					throw error;
				}
				ownerSigner?.assertCurrent();
			}

			const confirmed = await refetchRequirements(newlyVerifiedAgentAddress);
			ownerSigner?.assertCurrent();
			if (!confirmed.isSignerReady || (requiresBuilderFee && !confirmed.isBuilderFeeReady)) {
				throw new Error("Trading authorization could not be confirmed");
			}
			return registeredAddress ?? zeroAddress;
		},
	});

	let status: RegistrationStatus = "idle";
	if (requiresBuilderFee && builderFeeApproval.status === "approving_fee") status = "approving_fee";
	else if (agentRegistration.status === "approving_agent") status = "approving_agent";
	else if (authorization.isPending) status = "verifying";
	else if (
		authorization.isError ||
		(requiresBuilderFee && builderFeeApproval.status === "error") ||
		agentRegistration.status === "error"
	) {
		status = "error";
	}

	return {
		authorize: authorization.mutateAsync,
		status,
		error: authorization.error ?? (requiresBuilderFee ? builderFeeApproval.error : null) ?? agentRegistration.error,
	};
}
