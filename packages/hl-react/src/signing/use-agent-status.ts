import type { ExtraAgentsResponse, MaxBuilderFeeResponse } from "@nktkas/hyperliquid";
import { useEffect } from "react";
import { type Address, zeroAddress } from "viem";
import { useInfo } from "../hooks/useInfo";
import { useHyperliquid } from "../provider";
import { clearActiveAgentOwnerIfMatches } from "./agent-session";
import { removeAgentFromStorageAndVerify, useAgentWalletStorage, useInvalidAgentStorageRecord } from "./agent-storage";
import { isAgentApproved, isBuilderFeeApproved } from "./agent-utils";
import { isStoredMobileAgent, type MobileAgentStaleReason, verifyMobileAgent } from "./mobile-agent";
import type { AgentWallet, BuilderConfig } from "./types";

export interface AgentRequirements {
	needsBuilderFee: boolean;
	needsAgent: boolean;
	signaturesRequired: number;
	isReady: boolean;
}

export interface UseAgentStatusResult extends AgentRequirements {
	isLoading: boolean;
	agentAddress: Address | null;
	refetch: () => Promise<AgentRequirements>;
}

export function getDefinitiveMobileAgentStaleReason(
	localAgent: AgentWallet | null | undefined,
	extraAgentsData: ExtraAgentsResponse | undefined,
	options: {
		requestSucceeded: boolean;
		isFetching: boolean;
		dataUpdatedAt: number;
		nowMs?: number;
	},
): MobileAgentStaleReason | null {
	if (localAgent?.source !== "mobile-sync") return null;

	const localVerification = verifyMobileAgent(localAgent, undefined, options.nowMs);
	if (localVerification.status === "stale") {
		return localVerification.reason;
	}

	if (
		!isStoredMobileAgent(localAgent) ||
		!options.requestSucceeded ||
		options.isFetching ||
		extraAgentsData === undefined ||
		options.dataUpdatedAt <= localAgent.importedAtMs
	) {
		return null;
	}
	const verification = verifyMobileAgent(localAgent, extraAgentsData, options.nowMs);
	return verification.status === "stale" ? verification.reason : null;
}

/** @internal Exported for contract tests. */
export function deriveAgentRequirements(
	builderFeeData: MaxBuilderFeeResponse | undefined,
	extraAgentsData: ExtraAgentsResponse | undefined,
	localAgent: AgentWallet | null | undefined,
	builderConfig: BuilderConfig | undefined,
	nowMs = Date.now(),
): AgentRequirements {
	const hasBuilderConfig = !!builderConfig?.b;
	const builderFeeKnown = !hasBuilderConfig || builderFeeData !== undefined;
	const extraAgentsKnown = extraAgentsData !== undefined;
	const mobileAgentApproved =
		localAgent?.source === "mobile-sync"
			? verifyMobileAgent(localAgent, extraAgentsData, nowMs).status === "approved"
			: null;
	const agentApproved = mobileAgentApproved ?? isAgentApproved(extraAgentsData, localAgent?.publicKey);

	const needsBuilderFee =
		hasBuilderConfig && builderFeeKnown && !isBuilderFeeApproved(builderFeeData, builderConfig?.f);
	const needsAgent = extraAgentsKnown && !agentApproved;
	const signaturesRequired = (needsBuilderFee ? 1 : 0) + (needsAgent ? 1 : 0);

	return {
		needsBuilderFee,
		needsAgent,
		signaturesRequired,
		isReady: builderFeeKnown && extraAgentsKnown && signaturesRequired === 0,
	};
}

export function useAgentStatus(): UseAgentStatusResult {
	const { env, builderConfig, clientKey } = useHyperliquid();
	const address = clientKey === "disconnected" ? undefined : (clientKey as Address);

	const localAgent = useAgentWalletStorage(env, address);
	const hasInvalidStorageRecord = useInvalidAgentStorageRecord(env, address);
	const hasBuilderConfig = !!builderConfig?.b;
	const userAddress = address ?? zeroAddress;

	const builderFeeQuery = useInfo(
		"maxBuilderFee",
		{ user: userAddress, builder: builderConfig?.b ?? zeroAddress },
		{ enabled: !!address && hasBuilderConfig },
	);

	const extraAgentsQuery = useInfo("extraAgents", { user: userAddress }, { enabled: !!address });
	const staleMobileReason = hasInvalidStorageRecord
		? "invalid_local"
		: address
			? getDefinitiveMobileAgentStaleReason(localAgent, extraAgentsQuery.data, {
					requestSucceeded: extraAgentsQuery.error === null,
					isFetching: extraAgentsQuery.isFetching,
					dataUpdatedAt: extraAgentsQuery.dataUpdatedAt,
				})
			: null;

	useEffect(() => {
		if (!address || (!hasInvalidStorageRecord && localAgent?.source !== "mobile-sync") || !staleMobileReason) {
			return;
		}
		clearActiveAgentOwnerIfMatches(env, address);
		removeAgentFromStorageAndVerify(env, address);
	}, [address, env, hasInvalidStorageRecord, localAgent, staleMobileReason]);

	const isLoading = builderFeeQuery.isLoading || extraAgentsQuery.isLoading;
	const requirements = deriveAgentRequirements(builderFeeQuery.data, extraAgentsQuery.data, localAgent, builderConfig);

	async function refetch(): Promise<AgentRequirements> {
		const [feeResult, agentsResult] = await Promise.all([builderFeeQuery.refetch(), extraAgentsQuery.refetch()]);

		if (hasBuilderConfig && feeResult.data === undefined) {
			throw new Error("Could not load builder fee status");
		}
		if (agentsResult.data === undefined) {
			throw new Error("Could not load agent status");
		}

		return deriveAgentRequirements(feeResult.data, agentsResult.data, localAgent, builderConfig);
	}

	return {
		...requirements,
		isReady: !isLoading && requirements.isReady,
		isLoading,
		agentAddress: localAgent?.publicKey ?? null,
		refetch,
	};
}
