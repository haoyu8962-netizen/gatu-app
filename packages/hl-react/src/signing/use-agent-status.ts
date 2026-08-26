import type { ExtraAgentsResponse, MaxBuilderFeeResponse } from "@nktkas/hyperliquid";
import { useEffect } from "react";
import { type Address, zeroAddress } from "viem";
import { useInfo } from "../hooks/useInfo";
import { useHyperliquid } from "../provider";
import { cleanupAgentRegistrationIfMatches } from "./agent-registration-session";
import { readAgentFromStorage, useAgentWalletStorage, useInvalidAgentStorageRecord } from "./agent-storage";
import { isAgentApproved, isBuilderFeeApproved } from "./agent-utils";
import { isStoredMobileAgent, type MobileAgentStaleReason, verifyMobileAgent } from "./mobile-agent";
import type { AgentWallet, BuilderConfig } from "./types";

export interface AgentRequirements {
	needsBuilderFee: boolean;
	needsAgent: boolean;
	signaturesRequired: number;
	isAgentReady: boolean;
	isBuilderFeeReady: boolean;
	isReady: boolean;
}

export type AgentVerificationStatus = "unknown" | "loading" | "ready" | "missing" | "error";

export type AgentMissingReason =
	| "no_local_key"
	| "remote_named_agent_exists"
	| "approval_unconfirmed"
	| "local_key_not_approved"
	| "remote_key_replaced"
	| "agent_name_mismatch"
	| "invalid_local_record";

export interface DeriveAgentMissingReasonOptions {
	agentVerificationStatus: AgentVerificationStatus;
	extraAgentsData: ExtraAgentsResponse | undefined;
	localAgent: AgentWallet | null | undefined;
	hasInvalidStorageRecord: boolean;
	expectedAgentName?: string;
	nowMs?: number;
}

export type AgentStatusErrorReason = "rate_limited" | "timeout" | "service_unavailable" | "network" | "unknown";

export class AgentStatusError extends Error {
	readonly reason: AgentStatusErrorReason;

	constructor(reason: AgentStatusErrorReason, options: { cause?: unknown } = {}) {
		super("Could not load agent status", options.cause === undefined ? undefined : { cause: options.cause });
		this.name = "AgentStatusError";
		this.reason = reason;
	}
}

export interface UseAgentStatusResult extends AgentRequirements {
	isLoading: boolean;
	isAgentLoading: boolean;
	isBuilderFeeLoading: boolean;
	agentVerificationStatus: AgentVerificationStatus;
	agentMissingReason: AgentMissingReason | null;
	agentError: Error | null;
	agentAddress: Address | null;
	refetch: (agentAddressOverride?: Address) => Promise<AgentRequirements>;
	refetchAgent: (agentAddressOverride?: Address) => Promise<AgentRequirements>;
	refetchBuilderFee: () => Promise<AgentRequirements>;
}

export function classifyAgentStatusError(error: unknown): AgentStatusErrorReason {
	const visited = new Set<unknown>();
	const chain: unknown[] = [];
	let current: unknown = error;

	while (current !== undefined && current !== null && !visited.has(current)) {
		visited.add(current);
		if (current instanceof AgentStatusError) return current.reason;
		chain.push(current);
		current = getErrorCause(current);
	}

	for (const item of chain) {
		const status = getErrorHttpStatus(item);
		if (status === 408) return "timeout";
		if (status === 429) return "rate_limited";
		if (status !== null && status >= 500) return "service_unavailable";
	}

	for (const item of chain) {
		if (item instanceof Error) {
			const message = item.message.toLowerCase();
			if (item.name === "TimeoutError" || message.includes("timed out") || message.includes("timeout")) {
				return "timeout";
			}
		}
	}

	for (const item of chain) {
		if (item instanceof Error) {
			const message = item.message.toLowerCase();
			const status = getErrorHttpStatus(item);
			if (
				item.name === "NetworkError" ||
				item instanceof TypeError ||
				(item.name === "HttpRequestError" && status === null) ||
				message.includes("failed to fetch") ||
				message.includes("fetch failed") ||
				message.includes("network request failed") ||
				message.includes("econnrefused") ||
				message.includes("econnreset") ||
				message.includes("enotfound") ||
				message.includes("eai_again")
			) {
				return "network";
			}
		}
	}

	return "unknown";
}

export function deriveAgentMissingReason({
	agentVerificationStatus,
	extraAgentsData,
	localAgent,
	hasInvalidStorageRecord,
	expectedAgentName,
	nowMs = Date.now(),
}: DeriveAgentMissingReasonOptions): AgentMissingReason | null {
	if (agentVerificationStatus !== "missing") return null;
	if (hasInvalidStorageRecord) return "invalid_local_record";
	const activeAgents = extraAgentsData?.filter((agent) => (agent.validUntil ?? Number.POSITIVE_INFINITY) > nowMs) ?? [];
	if (!localAgent) {
		if (expectedAgentName && activeAgents.some((agent) => agent.name === expectedAgentName)) {
			return "remote_named_agent_exists";
		}
		return "no_local_key";
	}
	if (localAgent.source === "mobile-sync" && !isStoredMobileAgent(localAgent)) {
		return "invalid_local_record";
	}
	if (localAgent.source === "local-registration" && localAgent.approvalPendingAtMs !== undefined) {
		return "approval_unconfirmed";
	}

	const expectedName = localAgent.source === "mobile-sync" ? localAgent.agentNameBase : expectedAgentName;
	if (!extraAgentsData || !expectedName) return "local_key_not_approved";

	const normalizedLocalKey = localAgent.publicKey.toLowerCase();
	if (activeAgents.some((agent) => agent.name === expectedName && agent.address.toLowerCase() !== normalizedLocalKey)) {
		return "remote_key_replaced";
	}
	if (activeAgents.some((agent) => agent.address.toLowerCase() === normalizedLocalKey && agent.name !== expectedName)) {
		return "agent_name_mismatch";
	}
	return "local_key_not_approved";
}

function getErrorHttpStatus(value: unknown): number | null {
	if (!isRecord(value)) return null;
	if (typeof value.status === "number") return value.status;
	return isRecord(value.response) && typeof value.response.status === "number" ? value.response.status : null;
}

function getErrorCause(value: unknown): unknown {
	return isRecord(value) && value.cause !== value ? value.cause : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function createAgentStatusError(cause: unknown): AgentStatusError {
	return new AgentStatusError(
		classifyAgentStatusError(cause),
		cause === undefined || cause === null ? undefined : { cause },
	);
}

/** @internal Exported for contract tests. */
export function deriveAgentVerificationStatus(
	hasOwner: boolean,
	extraAgentsData: ExtraAgentsResponse | undefined,
	error: unknown,
	isFetching: boolean,
	currentRequirements: AgentRequirements,
): AgentVerificationStatus {
	if (!hasOwner) return "unknown";
	if (error) return "error";
	// A matching cached Agent remains usable during a background refresh. In
	// contrast, a cached miss cannot trigger registration until refresh settles.
	if (currentRequirements.isAgentReady) return "ready";
	if (isFetching) return "loading";
	if (extraAgentsData === undefined) return "unknown";
	return "missing";
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
	agentAddressOverride?: Address,
	expectedAgentName?: string,
): AgentRequirements {
	const hasBuilderConfig = !!builderConfig?.b;
	const builderFeeKnown = !hasBuilderConfig || builderFeeData !== undefined;
	const extraAgentsKnown = extraAgentsData !== undefined;
	const mobileAgentApproved =
		!agentAddressOverride && localAgent?.source === "mobile-sync"
			? verifyMobileAgent(localAgent, extraAgentsData, nowMs).status === "approved"
			: null;
	const agentApproved =
		mobileAgentApproved ??
		isAgentApproved(extraAgentsData, agentAddressOverride ?? localAgent?.publicKey, expectedAgentName);

	const needsBuilderFee =
		hasBuilderConfig && builderFeeKnown && !isBuilderFeeApproved(builderFeeData, builderConfig?.f);
	const needsAgent = extraAgentsKnown && !agentApproved;
	const signaturesRequired = (needsBuilderFee ? 1 : 0) + (needsAgent ? 1 : 0);
	const isAgentReady = extraAgentsKnown && !needsAgent;
	const isBuilderFeeReady = builderFeeKnown && !needsBuilderFee;

	return {
		needsBuilderFee,
		needsAgent,
		signaturesRequired,
		isAgentReady,
		isBuilderFeeReady,
		isReady: isAgentReady && isBuilderFeeReady,
	};
}

export function useAgentStatus(): UseAgentStatusResult {
	const { env, builderConfig, clientKey, agentName } = useHyperliquid();
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
		const target = hasInvalidStorageRecord
			? ({ kind: "invalid-record" } as const)
			: localAgent?.source === "mobile-sync"
				? ({ kind: "public-key", publicKey: localAgent.publicKey } as const)
				: null;
		if (!target) return;
		void cleanupAgentRegistrationIfMatches(env, address, target);
	}, [address, env, hasInvalidStorageRecord, localAgent, staleMobileReason]);

	const nowMs = Date.now();
	const currentRequirements = deriveAgentRequirements(
		builderFeeQuery.data,
		extraAgentsQuery.data,
		localAgent,
		builderConfig,
		nowMs,
		undefined,
		agentName,
	);
	const agentVerificationStatus = deriveAgentVerificationStatus(
		!!address,
		extraAgentsQuery.data,
		extraAgentsQuery.error,
		extraAgentsQuery.isFetching,
		currentRequirements,
	);
	const agentMissingReason = deriveAgentMissingReason({
		agentVerificationStatus,
		extraAgentsData: extraAgentsQuery.data,
		localAgent,
		hasInvalidStorageRecord,
		expectedAgentName: agentName,
		nowMs,
	});
	const verifiedAgentData =
		agentVerificationStatus === "ready" || agentVerificationStatus === "missing" ? extraAgentsQuery.data : undefined;
	// Keep the action-level loading state scoped to the initial fetch. Background
	// revalidation remains fail-closed through agentVerificationStatus without
	// repeatedly disabling the trading action.
	const isAgentLoading = extraAgentsQuery.isLoading;
	const isBuilderFeeLoading = hasBuilderConfig && builderFeeQuery.isLoading;
	const isLoading = isAgentLoading || isBuilderFeeLoading;
	const requirements = deriveAgentRequirements(
		builderFeeQuery.data,
		verifiedAgentData,
		localAgent,
		builderConfig,
		nowMs,
		undefined,
		agentName,
	);

	async function refetchAgent(agentAddressOverride?: Address): Promise<AgentRequirements> {
		const agentsResult = await extraAgentsQuery.refetch();
		if (agentsResult.error || agentsResult.data === undefined) {
			throw createAgentStatusError(agentsResult.error);
		}
		const latestLocalAgent = address ? readAgentFromStorage(env, address) : null;
		return deriveAgentRequirements(
			builderFeeQuery.data,
			agentsResult.data,
			latestLocalAgent,
			builderConfig,
			Date.now(),
			agentAddressOverride,
			agentName,
		);
	}

	async function refetchBuilderFee(): Promise<AgentRequirements> {
		const latestLocalAgent = address ? readAgentFromStorage(env, address) : null;
		if (!hasBuilderConfig) {
			return deriveAgentRequirements(
				undefined,
				verifiedAgentData,
				latestLocalAgent,
				builderConfig,
				Date.now(),
				undefined,
				agentName,
			);
		}

		const feeResult = await builderFeeQuery.refetch();
		if (feeResult.error || feeResult.data === undefined) throw new Error("Could not load builder fee status");
		return deriveAgentRequirements(
			feeResult.data,
			verifiedAgentData,
			latestLocalAgent,
			builderConfig,
			Date.now(),
			undefined,
			agentName,
		);
	}

	async function refetch(agentAddressOverride?: Address): Promise<AgentRequirements> {
		const [builderFeeResult, agentsResult] = await Promise.all([
			hasBuilderConfig ? builderFeeQuery.refetch() : Promise.resolve({ data: undefined, error: null }),
			extraAgentsQuery.refetch(),
		]);
		if (builderFeeResult.error || (hasBuilderConfig && builderFeeResult.data === undefined)) {
			throw new Error("Could not load builder fee status");
		}
		if (agentsResult.error || agentsResult.data === undefined) {
			throw createAgentStatusError(agentsResult.error);
		}
		const latestLocalAgent = address ? readAgentFromStorage(env, address) : null;

		return deriveAgentRequirements(
			builderFeeResult.data,
			agentsResult.data,
			latestLocalAgent,
			builderConfig,
			Date.now(),
			agentAddressOverride,
			agentName,
		);
	}

	return {
		...requirements,
		isReady: !isLoading && requirements.isReady,
		isLoading,
		isAgentLoading,
		isBuilderFeeLoading,
		agentVerificationStatus,
		agentMissingReason,
		agentError: extraAgentsQuery.error,
		agentAddress: localAgent?.publicKey ?? null,
		refetch,
		refetchAgent,
		refetchBuilderFee,
	};
}
