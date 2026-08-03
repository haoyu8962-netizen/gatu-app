import { useMutation } from "@tanstack/react-query";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import type { RegistrationStatus } from "./types";
import { useAgentRegistration } from "./use-agent-registration";
import { useAgentStatus } from "./use-agent-status";
import { useBuilderFeeApproval } from "./use-builder-fee-approval";

export interface UseTradingAuthorizationResult {
	authorize: () => Promise<Address>;
	status: RegistrationStatus;
	error: Error | null;
}

export function useTradingAuthorization(): UseTradingAuthorizationResult {
	const agentStatus = useAgentStatus();
	const agentRegistration = useAgentRegistration();
	const builderFeeApproval = useBuilderFeeApproval();

	const authorization = useMutation({
		mutationKey: ["hl", "tradingAuthorization", agentStatus.agentAddress],
		mutationFn: async (): Promise<Address> => {
			let registeredAddress = agentStatus.agentAddress;
			let newlyVerifiedAgentAddress: Address | undefined;
			let requirements = await agentStatus.refetch();

			if (requirements.needsAgent) {
				registeredAddress = await agentRegistration.register();
				newlyVerifiedAgentAddress = registeredAddress;
				requirements = await agentStatus.refetch(newlyVerifiedAgentAddress);
			}

			if (requirements.needsBuilderFee) {
				await builderFeeApproval.approve();
			}

			const confirmed = await agentStatus.refetch(newlyVerifiedAgentAddress);
			if (!confirmed.isReady) throw new Error("Trading authorization could not be confirmed");
			return registeredAddress ?? zeroAddress;
		},
	});

	let status: RegistrationStatus = "idle";
	if (builderFeeApproval.status === "approving_fee") status = "approving_fee";
	else if (agentRegistration.status === "approving_agent") status = "approving_agent";
	else if (authorization.isPending) status = "verifying";
	else if (authorization.isError || builderFeeApproval.status === "error" || agentRegistration.status === "error") {
		status = "error";
	}

	return {
		authorize: authorization.mutateAsync,
		status,
		error: authorization.error ?? builderFeeApproval.error ?? agentRegistration.error,
	};
}
