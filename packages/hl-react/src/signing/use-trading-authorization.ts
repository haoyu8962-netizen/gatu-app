import { useMutation } from "@tanstack/react-query";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { readPersistTradingConnection } from "./agent-storage";
import { useHyperliquidOwnerSigner } from "./owner-signer-provider";
import type { RegistrationStatus } from "./types";
import { useAgentRegistration } from "./use-agent-registration";
import { useBuilderFeeApproval } from "./use-builder-fee-approval";
import { useTradingStatus } from "./use-trading-status";

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
		mutationFn: async (): Promise<Address> => {
			ownerSigner?.assertCurrent();
			const refetchRequirements = requiresBuilderFee ? tradingStatus.refetch : tradingStatus.refetchSigner;
			let registeredAddress = tradingStatus.signerAddress;
			let newlyVerifiedAgentAddress: Address | undefined;
			let requirements = await refetchRequirements();
			ownerSigner?.assertCurrent();

			if (requirements.needsAgent) {
				registeredAddress = await agentRegistration.register({
					persistConnection: readPersistTradingConnection(),
				});
				ownerSigner?.assertCurrent();
				newlyVerifiedAgentAddress = registeredAddress;
				requirements = await refetchRequirements(newlyVerifiedAgentAddress);
				ownerSigner?.assertCurrent();
			}

			if (requiresBuilderFee && requirements.needsBuilderFee) {
				await builderFeeApproval.approve();
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
