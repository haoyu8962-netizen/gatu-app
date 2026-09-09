import type { Address } from "viem";
import { ExchangeRequestInvalidatedError } from "../internal/exchange/request-scheduler";
import { type HyperliquidOwnerSigner, useHyperliquidOwnerSigner } from "./owner-signer-provider";
import { type AgentRequirements, useAgentStatus } from "./use-agent-status";

export interface TradingRequirements {
	isSignerReady: boolean;
	needsAgent: boolean;
	isBuilderFeeReady: boolean;
	needsBuilderFee: boolean;
	isReady: boolean;
	signaturesRequired: number;
}

export interface UseTradingStatusResult extends TradingRequirements {
	signerMode: "owner" | "agent";
	signerAddress: Address | null;
	isLoading: boolean;
	isSignerLoading: boolean;
	isBuilderFeeLoading: boolean;
	refetch: (agentAddressOverride?: Address) => Promise<TradingRequirements>;
	refetchSigner: (agentAddressOverride?: Address) => Promise<TradingRequirements>;
	refetchBuilderFee: () => Promise<TradingRequirements>;
}

export function useTradingStatus(): UseTradingStatusResult {
	const owner = useHyperliquidOwnerSigner();
	const agent = useAgentStatus({ enableAgent: !owner });
	const signerReady = owner ? isOwnerReady(owner) : agent.isAgentReady;
	const requirements = mapRequirements(agent, owner ? signerReady : undefined);
	const isSignerLoading = owner ? !signerReady : agent.isAgentLoading;
	const isLoading = isSignerLoading || agent.isBuilderFeeLoading;

	function assertOwnerReady() {
		if (!owner || !owner.wallet || !owner.ownerAddress) throw new ExchangeRequestInvalidatedError();
		owner.assertCurrent();
	}

	async function refetchSigner(agentAddressOverride?: Address): Promise<TradingRequirements> {
		if (!owner)
			return mapRequirements(
				await (agentAddressOverride === undefined ? agent.refetchAgent() : agent.refetchAgent(agentAddressOverride)),
			);
		assertOwnerReady();
		return mapRequirements(agent, true);
	}

	async function refetchBuilderFee(): Promise<TradingRequirements> {
		if (owner) assertOwnerReady();
		const latest = await agent.refetchBuilderFee();
		if (owner) assertOwnerReady();
		return mapRequirements(latest, owner ? true : undefined);
	}

	async function refetch(agentAddressOverride?: Address): Promise<TradingRequirements> {
		if (owner) return refetchBuilderFee();
		return mapRequirements(
			await (agentAddressOverride === undefined ? agent.refetch() : agent.refetch(agentAddressOverride)),
		);
	}

	return {
		...requirements,
		isReady: !isLoading && requirements.isReady,
		signerMode: owner ? "owner" : "agent",
		signerAddress: owner ? (owner.ownerAddress ?? null) : agent.agentAddress,
		isLoading,
		isSignerLoading,
		isBuilderFeeLoading: agent.isBuilderFeeLoading,
		refetch,
		refetchSigner,
		refetchBuilderFee,
	};
}

function isOwnerReady(owner: HyperliquidOwnerSigner): boolean {
	return !!owner.wallet && !!owner.ownerAddress;
}

function mapRequirements(agent: AgentRequirements, ownerReady?: boolean): TradingRequirements {
	const isSignerReady = ownerReady ?? agent.isAgentReady;
	const needsAgent = ownerReady === undefined && agent.needsAgent;
	return {
		isSignerReady,
		needsAgent,
		isBuilderFeeReady: agent.isBuilderFeeReady,
		needsBuilderFee: agent.needsBuilderFee,
		isReady: isSignerReady && agent.isBuilderFeeReady,
		signaturesRequired: Number(needsAgent) + Number(agent.needsBuilderFee),
	};
}
