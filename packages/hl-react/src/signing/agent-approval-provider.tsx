import { createContext, type ReactNode, useContext } from "react";
import type { Address } from "viem";
import type { ExchangeParams, ExchangeResponse } from "../types/clients";

export interface AgentApprovalOptions {
	applicationReview?: "confirmed";
	/** @internal Binds trading-connection approval to its exact pre-saved candidate. */
	registrationPublicKey?: Address;
	/** @internal Cancels a stale registration attempt before it can submit. */
	signal?: AbortSignal;
}

export type AgentApprovalMutateAsync = (
	params: ExchangeParams<"approveAgent">,
	options?: AgentApprovalOptions,
) => Promise<ExchangeResponse<"approveAgent">>;

const AgentApprovalContext = createContext<AgentApprovalMutateAsync | null>(null);

export interface HyperliquidAgentApprovalProviderProps {
	children?: ReactNode;
	mutateAsync: AgentApprovalMutateAsync;
}

/** Supplies a host-specific master-wallet approval path to every nested Agent registration flow. */
export function HyperliquidAgentApprovalProvider({ children, mutateAsync }: HyperliquidAgentApprovalProviderProps) {
	return <AgentApprovalContext.Provider value={mutateAsync}>{children}</AgentApprovalContext.Provider>;
}

export function useAgentApprovalOverride(): AgentApprovalMutateAsync | null {
	return useContext(AgentApprovalContext);
}
