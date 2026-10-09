import type { ExtraAgentsResponse, MaxBuilderFeeResponse, UserRoleResponse } from "@nktkas/hyperliquid";
import { hashKey, type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { type Address, zeroAddress } from "viem";
import { useInfo } from "../hooks/useInfo";
import { useHyperliquid } from "../provider";
import { infoQueryOptions } from "../query/info";
import { cleanupAgentRegistrationIfMatches } from "./agent-registration-session";
import { readAgentFromStorage, useAgentWalletStorage, useInvalidAgentStorageRecord } from "./agent-storage";
import { isBuilderFeeApproved } from "./agent-utils";
import { isStoredMobileAgent, type MobileAgentStaleReason, verifyMobileAgent } from "./mobile-agent";
import { useHyperliquidOwnerSigner } from "./owner-signer-provider";
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
	| "approval_unconfirmed"
	| "local_key_not_approved"
	| "remote_key_replaced"
	| "agent_name_mismatch"
	| "invalid_local_record";

/**
 * Hyperliquid's `userRole` answer for one exact Agent key, kept together with
 * the key it answers for. The unnamed default Agent that ordinary trading
 * connections approve never appears in `extraAgents`, so its approval is
 * verified by asking the exchange what role the key itself has.
 */
export interface AgentKeyRole {
	agentAddress: Address;
	role: UserRoleResponse;
}

/**
 * Server evidence about the locally stored Agent or about an explicitly named
 * candidate key: `keyRole` verifies a default (unnamed) Agent key, while
 * `extraAgents` verifies the named Mobile Agent imported from a desktop.
 */
export interface AgentApprovalEvidence {
	owner: Address | undefined;
	localAgent: AgentWallet | null | undefined;
	keyRole: AgentKeyRole | undefined;
	extraAgents: ExtraAgentsResponse | undefined;
}

export interface DeriveAgentMissingReasonOptions {
	agentVerificationStatus: AgentVerificationStatus;
	extraAgentsData: ExtraAgentsResponse | undefined;
	localAgent: AgentWallet | null | undefined;
	hasInvalidStorageRecord: boolean;
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

const AGENT_KEY_ROLE_STALE_MS = 30_000;

interface DefinitiveCheck {
	sequence: number;
	promise: Promise<UserRoleResponse>;
}

// The definitive checks started per QueryClient and cache key. The check that started last holds the
// newest view of the exchange: it alone writes its answer back to the hook's cache, and a check that
// was overtaken hands its caller the newest answer instead of its own, so no caller can act on an
// answer that a later check has already contradicted.
const definitiveChecks = new WeakMap<QueryClient, Map<string, DefinitiveCheck>>();

function getDefinitiveChecks(queryClient: QueryClient): Map<string, DefinitiveCheck> {
	let checks = definitiveChecks.get(queryClient);
	if (!checks) {
		checks = new Map();
		definitiveChecks.set(queryClient, checks);
	}
	return checks;
}

async function awaitLatestDefinitiveCheck(
	checks: Map<string, DefinitiveCheck>,
	cacheKey: string,
): Promise<UserRoleResponse> {
	for (;;) {
		const latest = checks.get(cacheKey);
		if (!latest) throw new Error("Agent key check was discarded");
		const role = await latest.promise;
		if (checks.get(cacheKey) === latest) return role;
	}
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

function sameAddress(left: string | undefined, right: string | undefined): boolean {
	return left !== undefined && right !== undefined && left.toLowerCase() === right.toLowerCase();
}

/** True only when the exchange reports the exact key as an Agent of the exact owner. */
export function isAgentKeyApprovedForOwner(
	keyRole: AgentKeyRole | undefined,
	agentAddress: Address | undefined,
	owner: Address | undefined,
): boolean {
	if (!keyRole || !agentAddress || !owner) return false;
	if (!sameAddress(keyRole.agentAddress, agentAddress)) return false;
	return keyRole.role.role === "agent" && sameAddress(keyRole.role.data.user, owner);
}

interface AgentEvidenceVerification {
	known: boolean;
	approved: boolean;
}

/**
 * A Mobile Agent is verified by name base, address and expiry in `extraAgents`;
 * every other key is verified by `userRole`. Without a candidate key there is
 * nothing to ask the exchange about: a connected owner without a local key
 * definitively needs a new connection, while no owner means nothing is known.
 */
function verifyAgentEvidence(
	evidence: AgentApprovalEvidence,
	nowMs: number,
	agentAddressOverride?: Address,
): AgentEvidenceVerification {
	const { localAgent } = evidence;
	if (!agentAddressOverride && localAgent?.source === "mobile-sync") {
		return {
			known: evidence.extraAgents !== undefined,
			approved: verifyMobileAgent(localAgent, evidence.extraAgents, nowMs).status === "approved",
		};
	}
	const candidate = agentAddressOverride ?? localAgent?.publicKey;
	if (!candidate) return { known: evidence.owner !== undefined, approved: false };
	const known = evidence.keyRole !== undefined && sameAddress(evidence.keyRole.agentAddress, candidate);
	return { known, approved: known && isAgentKeyApprovedForOwner(evidence.keyRole, candidate, evidence.owner) };
}

export function deriveAgentMissingReason({
	agentVerificationStatus,
	extraAgentsData,
	localAgent,
	hasInvalidStorageRecord,
	nowMs = Date.now(),
}: DeriveAgentMissingReasonOptions): AgentMissingReason | null {
	if (agentVerificationStatus !== "missing") return null;
	if (hasInvalidStorageRecord) return "invalid_local_record";
	if (!localAgent) return "no_local_key";
	if (localAgent.source === "mobile-sync") {
		if (!isStoredMobileAgent(localAgent)) return "invalid_local_record";
		if (!extraAgentsData) return "local_key_not_approved";
		const activeAgents = extraAgentsData.filter((agent) => (agent.validUntil ?? Number.POSITIVE_INFINITY) > nowMs);
		const expectedName = localAgent.agentNameBase;
		if (
			activeAgents.some((agent) => agent.name === expectedName && !sameAddress(agent.address, localAgent.publicKey))
		) {
			return "remote_key_replaced";
		}
		if (activeAgents.some((agent) => sameAddress(agent.address, localAgent.publicKey) && agent.name !== expectedName)) {
			return "agent_name_mismatch";
		}
		return "local_key_not_approved";
	}
	if (localAgent.approvalPendingAtMs !== undefined) return "approval_unconfirmed";
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

function agentKeyRoleParams(agentAddress: Address): { user: Address } {
	return { user: agentAddress.toLowerCase() as Address };
}

/** @internal Exported for contract tests. */
export function deriveAgentVerificationStatus(
	hasOwner: boolean,
	evidence: AgentApprovalEvidence,
	error: unknown,
	isFetching: boolean,
	currentRequirements: AgentRequirements,
	nowMs = Date.now(),
): AgentVerificationStatus {
	if (!hasOwner) return "unknown";
	if (error) return "error";
	// A matching cached Agent remains usable during a background refresh. In
	// contrast, a cached miss cannot trigger registration until refresh settles.
	if (currentRequirements.isAgentReady) return "ready";
	if (isFetching) return "loading";
	if (!verifyAgentEvidence(evidence, nowMs).known) return "unknown";
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
	evidence: AgentApprovalEvidence,
	builderConfig: BuilderConfig | undefined,
	nowMs = Date.now(),
	agentAddressOverride?: Address,
): AgentRequirements {
	const hasBuilderConfig = !!builderConfig?.b;
	const builderFeeKnown = !hasBuilderConfig || builderFeeData !== undefined;
	const agentVerification = verifyAgentEvidence(evidence, nowMs, agentAddressOverride);

	const needsBuilderFee =
		hasBuilderConfig && builderFeeKnown && !isBuilderFeeApproved(builderFeeData, builderConfig?.f);
	const needsAgent = agentVerification.known && !agentVerification.approved;
	const signaturesRequired = (needsBuilderFee ? 1 : 0) + (needsAgent ? 1 : 0);
	const isAgentReady = agentVerification.known && agentVerification.approved;
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

export function useAgentStatus(options: { enableAgent?: boolean } = {}): UseAgentStatusResult {
	const ownerSigner = useHyperliquidOwnerSigner();
	const enableAgent = options.enableAgent ?? !ownerSigner;
	const { env, builderConfig, clientKey, info } = useHyperliquid();
	const queryClient = useQueryClient();
	const address = clientKey === "disconnected" ? undefined : (clientKey as Address);

	const localAgent = useAgentWalletStorage(env, address);
	const hasInvalidStorageRecord = useInvalidAgentStorageRecord(env, address);
	const hasBuilderConfig = !!builderConfig?.b;
	const userAddress = address ?? zeroAddress;
	const isMobileAgent = localAgent?.source === "mobile-sync";
	const defaultAgentKey = localAgent && !isMobileAgent ? localAgent.publicKey : undefined;

	const builderFeeQuery = useInfo(
		"maxBuilderFee",
		{ user: userAddress, builder: builderConfig?.b ?? zeroAddress },
		{ enabled: !!address && hasBuilderConfig },
	);

	const extraAgentsQuery = useInfo(
		"extraAgents",
		{ user: userAddress },
		{ enabled: !!address && enableAgent && isMobileAgent },
	);
	const keyRoleQuery = useInfo("userRole", agentKeyRoleParams(defaultAgentKey ?? zeroAddress), {
		enabled: !!address && enableAgent && defaultAgentKey !== undefined,
		staleTime: AGENT_KEY_ROLE_STALE_MS,
	});
	const agentQuery = isMobileAgent ? extraAgentsQuery : keyRoleQuery;
	const keyRole: AgentKeyRole | undefined =
		defaultAgentKey !== undefined && keyRoleQuery.data !== undefined
			? { agentAddress: defaultAgentKey, role: keyRoleQuery.data }
			: undefined;
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
		if (
			!enableAgent ||
			!address ||
			(!hasInvalidStorageRecord && localAgent?.source !== "mobile-sync") ||
			!staleMobileReason
		) {
			return;
		}
		const target = hasInvalidStorageRecord
			? ({ kind: "invalid-record" } as const)
			: localAgent?.source === "mobile-sync"
				? ({ kind: "public-key", publicKey: localAgent.publicKey } as const)
				: null;
		if (!target) return;
		void cleanupAgentRegistrationIfMatches(env, address, target);
	}, [address, enableAgent, env, hasInvalidStorageRecord, localAgent, staleMobileReason]);

	const nowMs = Date.now();
	const evidence: AgentApprovalEvidence = {
		owner: address,
		localAgent,
		keyRole,
		extraAgents: extraAgentsQuery.data,
	};
	const currentRequirements = deriveAgentRequirements(builderFeeQuery.data, evidence, builderConfig, nowMs);
	const agentVerificationStatus = deriveAgentVerificationStatus(
		!!address && enableAgent,
		evidence,
		agentQuery.error,
		agentQuery.isFetching,
		currentRequirements,
		nowMs,
	);
	const agentMissingReason = deriveAgentMissingReason({
		agentVerificationStatus,
		extraAgentsData: extraAgentsQuery.data,
		localAgent,
		hasInvalidStorageRecord,
		nowMs,
	});
	const verifiedEvidence: AgentApprovalEvidence =
		agentVerificationStatus === "ready" || agentVerificationStatus === "missing"
			? evidence
			: { ...evidence, keyRole: undefined, extraAgents: undefined };
	// Keep the action-level loading state scoped to the initial fetch. Background
	// revalidation remains fail-closed through agentVerificationStatus without
	// repeatedly disabling the trading action.
	const isAgentLoading = enableAgent && agentQuery.isLoading;
	const isBuilderFeeLoading = hasBuilderConfig && builderFeeQuery.isLoading;
	const isLoading = isAgentLoading || isBuilderFeeLoading;
	const requirements = deriveAgentRequirements(builderFeeQuery.data, verifiedEvidence, builderConfig, nowMs);

	function readLatestLocalAgent(): AgentWallet | null {
		return address ? readAgentFromStorage(env, address) : null;
	}

	// A definitive check sends its own request under a private query key: TanStack would otherwise
	// hand it a request that was already in flight (possibly from before the approval), and cancelling
	// that shared request would resolve another caller with the reverted cache instead of an answer.
	// The private query still inherits the host QueryClient's retry policy. The newest check writes its
	// answer to the hook's cache key, after cancelling (and reverting) an observer fetch still in
	// flight, so a slower pre-approval answer cannot overwrite it. When the newest check fails, the
	// shared query is reset so the hook stops treating its cached approval as current and fetches
	// again; a check that was overtaken returns the newest check's answer or failure.
	async function fetchAgentKeyRole(agentAddress: Address): Promise<AgentKeyRole> {
		const options = infoQueryOptions(info, "userRole", agentKeyRoleParams(agentAddress), env);
		const cacheKey = hashKey(options.queryKey);
		const checks = getDefinitiveChecks(queryClient);
		const sequence = (checks.get(cacheKey)?.sequence ?? 0) + 1;
		const check: DefinitiveCheck = {
			sequence,
			promise: queryClient.fetchQuery({
				queryKey: [...options.queryKey, { definitiveCheck: sequence }],
				queryFn: options.queryFn,
				staleTime: 0,
				gcTime: 0,
			}),
		};
		checks.set(cacheKey, check);
		const isNewest = () => checks.get(cacheKey) === check;

		let ownRole: UserRoleResponse | undefined;
		let ownError: unknown;
		try {
			ownRole = await check.promise;
		} catch (error) {
			ownError = error;
		}
		if (isNewest()) {
			if (ownRole === undefined) {
				void queryClient.resetQueries({ queryKey: options.queryKey, exact: true });
				throw createAgentStatusError(ownError);
			}
			await queryClient.cancelQueries({ queryKey: options.queryKey, exact: true });
			if (isNewest()) queryClient.setQueryData(options.queryKey, ownRole);
			return { agentAddress, role: ownRole };
		}
		try {
			return { agentAddress, role: await awaitLatestDefinitiveCheck(checks, cacheKey) };
		} catch (error) {
			throw createAgentStatusError(error);
		}
	}

	// The stored record is read again after each request: a record another tab replaced or removed
	// while the request was running must not be reported ready on the strength of the old answer.
	async function loadAgentEvidence(agentAddressOverride?: Address): Promise<AgentApprovalEvidence> {
		const startingLocalAgent = readLatestLocalAgent();
		if (!agentAddressOverride && startingLocalAgent?.source === "mobile-sync") {
			const agentsResult = await extraAgentsQuery.refetch();
			if (agentsResult.error || agentsResult.data === undefined) {
				throw createAgentStatusError(agentsResult.error);
			}
			return { owner: address, localAgent: readLatestLocalAgent(), keyRole: undefined, extraAgents: agentsResult.data };
		}
		const candidate = agentAddressOverride ?? startingLocalAgent?.publicKey;
		const keyRole = candidate ? await fetchAgentKeyRole(candidate) : undefined;
		return { owner: address, localAgent: readLatestLocalAgent(), keyRole, extraAgents: undefined };
	}

	async function refetchAgent(agentAddressOverride?: Address): Promise<AgentRequirements> {
		if (!enableAgent) throw new Error("Agent verification is disabled for owner-wallet trading");
		const freshEvidence = await loadAgentEvidence(agentAddressOverride);
		return deriveAgentRequirements(
			builderFeeQuery.data,
			freshEvidence,
			builderConfig,
			Date.now(),
			agentAddressOverride,
		);
	}

	async function refetchBuilderFee(): Promise<AgentRequirements> {
		if (!hasBuilderConfig) {
			return deriveAgentRequirements(
				undefined,
				{ ...verifiedEvidence, localAgent: readLatestLocalAgent() },
				builderConfig,
				Date.now(),
			);
		}

		const feeResult = await builderFeeQuery.refetch();
		if (feeResult.error || feeResult.data === undefined) throw new Error("Could not load builder fee status");
		return deriveAgentRequirements(
			feeResult.data,
			{ ...verifiedEvidence, localAgent: readLatestLocalAgent() },
			builderConfig,
			Date.now(),
		);
	}

	async function refetch(agentAddressOverride?: Address): Promise<AgentRequirements> {
		if (!enableAgent) throw new Error("Agent verification is disabled for owner-wallet trading");
		const [builderFeeResult, freshEvidence] = await Promise.all([
			hasBuilderConfig ? builderFeeQuery.refetch() : Promise.resolve({ data: undefined, error: null }),
			loadAgentEvidence(agentAddressOverride),
		]);
		if (builderFeeResult.error || (hasBuilderConfig && builderFeeResult.data === undefined)) {
			throw new Error("Could not load builder fee status");
		}

		return deriveAgentRequirements(
			builderFeeResult.data,
			{ ...freshEvidence, localAgent: readLatestLocalAgent() },
			builderConfig,
			Date.now(),
			agentAddressOverride,
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
		agentError: agentQuery.error,
		agentAddress: localAgent?.publicKey ?? null,
		refetch,
		refetchAgent,
		refetchBuilderFee,
	};
}
