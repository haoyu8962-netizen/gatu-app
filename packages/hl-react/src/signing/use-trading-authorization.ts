import { useMutation } from "@tanstack/react-query";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { readPersistTradingConnection } from "./agent-storage";
import type { RegistrationStatus } from "./types";
import { useAgentRegistration } from "./use-agent-registration";
import { useAgentStatus } from "./use-agent-status";
import { useBuilderFeeApproval } from "./use-builder-fee-approval";

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
	const agentStatus = useAgentStatus();
	const agentRegistration = useAgentRegistration();
	const builderFeeApproval = useBuilderFeeApproval();

	const authorization = useMutation({
		mutationKey: ["hl", "tradingAuthorization", agentStatus.agentAddress, requiresBuilderFee],
		mutationFn: async (): Promise<Address> => {
			const refetchRequirements = requiresBuilderFee ? agentStatus.refetch : agentStatus.refetchAgent;
			let registeredAddress = agentStatus.agentAddress;
			let newlyVerifiedAgentAddress: Address | undefined;
			let requirements = await refetchRequirements();

			if (requirements.needsAgent) {
				registeredAddress = await agentRegistration.register({
					persistConnection: readPersistTradingConnection(),
				});
				newlyVerifiedAgentAddress = registeredAddress;
				requirements = await refetchRequirements(newlyVerifiedAgentAddress);
			}

			if (requiresBuilderFee && requirements.needsBuilderFee) {
				await builderFeeApproval.approve();
			}

			const confirmed = await refetchRequirements(newlyVerifiedAgentAddress);
			if (!confirmed.isAgentReady || (requiresBuilderFee && !confirmed.isBuilderFeeReady)) {
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
