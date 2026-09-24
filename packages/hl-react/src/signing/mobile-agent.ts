import type { ExtraAgentsResponse } from "@nktkas/hyperliquid";
import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { AgentWallet } from "./types";

export const MOBILE_AGENT_NAME_BASE = "Mobile";
export const MOBILE_AGENT_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;

const VALID_UNTIL_SUFFIX_RE = / valid_until \d+$/u;

function isFiniteSafeExpiry(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && Number.isSafeInteger(value) && value > 0;
}

export interface MobileAgentApproval {
	privateKey: Hex;
	publicKey: Address;
	agentNameBase: typeof MOBILE_AGENT_NAME_BASE;
	agentName: string;
	agentValidUntilMs: number;
}

export interface MobileAgentStorageMetadata {
	source: "mobile-sync";
	agentNameBase: typeof MOBILE_AGENT_NAME_BASE;
	agentName: string;
	agentValidUntilMs: number;
	importedAtMs: number;
}

export interface ExpectedMobileAgent {
	agentAddress: string;
	agentNameBase: string;
	agentValidUntilMs: number;
}

export type ExpectedMobileAgentVerification =
	| { status: "remote_unknown" }
	| { status: "missing" }
	| { status: "ambiguous" }
	| { status: "address_mismatch" }
	| { status: "name_mismatch" }
	| { status: "expiry_mismatch" }
	| { status: "expired" }
	| { status: "approved"; remoteAgent: ExtraAgentsResponse[number] };

export type MobileAgentStaleReason =
	| "invalid_local"
	| "expired_local"
	| "missing_remote"
	| "ambiguous_remote"
	| "expired_remote"
	| "wrong_remote_name"
	| "remote_expiry_mismatch";

export type MobileAgentVerification =
	| { status: "missing_local" }
	| { status: "not_mobile_agent"; localAgent: AgentWallet }
	| { status: "remote_unknown"; localAgent: AgentWallet }
	| { status: "approved"; localAgent: AgentWallet; remoteAgent: ExtraAgentsResponse[number] }
	| { status: "stale"; reason: MobileAgentStaleReason; localAgent: AgentWallet };

export function createMobileAgentName(validUntilMs: number): string {
	if (!Number.isSafeInteger(validUntilMs) || validUntilMs <= 0) {
		throw new Error("Invalid mobile agent expiry");
	}
	return `${MOBILE_AGENT_NAME_BASE} valid_until ${validUntilMs}`;
}

export function getMobileAgentNameBase(agentName: string | null | undefined): string {
	return (agentName ?? "").replace(VALID_UNTIL_SUFFIX_RE, "");
}

export function isMobileAgentName(agentName: string | null | undefined): boolean {
	return getMobileAgentNameBase(agentName) === MOBILE_AGENT_NAME_BASE;
}

export function createMobileAgentApproval(
	nowMs = Date.now(),
	privateKey: Hex = generatePrivateKey(),
): MobileAgentApproval {
	const account = privateKeyToAccount(privateKey);
	const validUntilMs = nowMs + MOBILE_AGENT_VALIDITY_MS;
	return {
		privateKey: privateKey.toLowerCase() as Hex,
		publicKey: account.address.toLowerCase() as Address,
		agentNameBase: MOBILE_AGENT_NAME_BASE,
		agentName: createMobileAgentName(validUntilMs),
		agentValidUntilMs: validUntilMs,
	};
}

export function createMobileAgentStorageMetadata(input: {
	agentName: string;
	agentValidUntilMs: number;
	importedAtMs: number;
}): MobileAgentStorageMetadata {
	if (!isMobileAgentName(input.agentName) || input.agentName !== createMobileAgentName(input.agentValidUntilMs)) {
		throw new Error("Invalid mobile agent name");
	}
	if (!Number.isSafeInteger(input.importedAtMs) || input.importedAtMs <= 0) {
		throw new Error("Invalid mobile agent import time");
	}
	if (input.importedAtMs >= input.agentValidUntilMs) {
		throw new Error("Mobile agent must expire after import");
	}
	return {
		source: "mobile-sync",
		agentNameBase: MOBILE_AGENT_NAME_BASE,
		agentName: input.agentName,
		agentValidUntilMs: input.agentValidUntilMs,
		importedAtMs: input.importedAtMs,
	};
}

export function createMobileAgentWalletRecord(input: {
	privateKey: Hex;
	publicKey: Address;
	agentName: string;
	agentValidUntilMs: number;
	importedAtMs: number;
}): AgentWallet {
	const derivedPublicKey = privateKeyToAccount(input.privateKey).address.toLowerCase();
	if (derivedPublicKey !== input.publicKey.toLowerCase()) {
		throw new Error("Mobile agent private key does not match public key");
	}

	return {
		privateKey: input.privateKey.toLowerCase() as Hex,
		publicKey: input.publicKey.toLowerCase() as Address,
		...createMobileAgentStorageMetadata({
			agentName: input.agentName,
			agentValidUntilMs: input.agentValidUntilMs,
			importedAtMs: input.importedAtMs,
		}),
	};
}

export function isStoredMobileAgent(
	agent: AgentWallet | null | undefined,
): agent is AgentWallet & MobileAgentStorageMetadata {
	if (
		agent?.source !== "mobile-sync" ||
		agent.agentNameBase !== MOBILE_AGENT_NAME_BASE ||
		typeof agent.agentName !== "string" ||
		!isFiniteSafeExpiry(agent.agentValidUntilMs) ||
		!isFiniteSafeExpiry(agent.importedAtMs) ||
		agent.importedAtMs >= agent.agentValidUntilMs
	) {
		return false;
	}

	try {
		return (
			agent.agentName === createMobileAgentName(agent.agentValidUntilMs) &&
			privateKeyToAccount(agent.privateKey).address.toLowerCase() === agent.publicKey.toLowerCase()
		);
	} catch {
		return false;
	}
}

/**
 * Fail-closed verification for a specific Mobile named-Agent approval.
 *
 * Hyperliquid returns `{ address, name, validUntil }` from `extraAgents`. The
 * `approveAgent` accepts a `valid_until` suffix, but `extraAgents` returns the
 * parsed base name and expiry as separate fields. Both must match exactly.
 */
export function verifyExpectedMobileAgent(
	extraAgents: ExtraAgentsResponse | undefined,
	expected: ExpectedMobileAgent,
	nowMs = Date.now(),
): ExpectedMobileAgentVerification {
	if (!extraAgents) return { status: "remote_unknown" };

	if (expected.agentNameBase !== MOBILE_AGENT_NAME_BASE) {
		return { status: "name_mismatch" };
	}
	if (!isFiniteSafeExpiry(expected.agentValidUntilMs)) {
		return { status: "expiry_mismatch" };
	}

	const expectedAddress = expected.agentAddress.toLowerCase();
	const sameNameAgents = extraAgents.filter((agent) => agent.name === expected.agentNameBase);

	if (sameNameAgents.length === 0) {
		const sameAddressAgent = extraAgents.find((agent) => agent.address.toLowerCase() === expectedAddress);
		return { status: sameAddressAgent ? "name_mismatch" : "missing" };
	}
	if (sameNameAgents.length > 1) {
		return { status: "ambiguous" };
	}

	const [remoteAgent] = sameNameAgents;
	if (!remoteAgent || remoteAgent.address.toLowerCase() !== expectedAddress) {
		return { status: "address_mismatch" };
	}
	if (!isFiniteSafeExpiry(remoteAgent.validUntil) || remoteAgent.validUntil !== expected.agentValidUntilMs) {
		return { status: "expiry_mismatch" };
	}
	if (remoteAgent.validUntil <= nowMs) {
		return { status: "expired" };
	}

	return { status: "approved", remoteAgent };
}

export function verifyMobileAgent(
	localAgent: AgentWallet | null | undefined,
	extraAgents: ExtraAgentsResponse | undefined,
	nowMs = Date.now(),
): MobileAgentVerification {
	if (!localAgent) return { status: "missing_local" };
	if (!isStoredMobileAgent(localAgent)) {
		return localAgent.source === "mobile-sync"
			? { status: "stale", reason: "invalid_local", localAgent }
			: { status: "not_mobile_agent", localAgent };
	}
	if (localAgent.agentValidUntilMs <= nowMs) {
		return { status: "stale", reason: "expired_local", localAgent };
	}
	if (!extraAgents) {
		return { status: "remote_unknown", localAgent };
	}

	const remoteVerification = verifyExpectedMobileAgent(
		extraAgents,
		{
			agentAddress: localAgent.publicKey,
			agentNameBase: localAgent.agentNameBase,
			agentValidUntilMs: localAgent.agentValidUntilMs,
		},
		nowMs,
	);
	if (remoteVerification.status === "approved") {
		return { status: "approved", localAgent, remoteAgent: remoteVerification.remoteAgent };
	}
	if (remoteVerification.status === "expired") {
		return { status: "stale", reason: "expired_remote", localAgent };
	}
	if (remoteVerification.status === "name_mismatch") {
		return { status: "stale", reason: "wrong_remote_name", localAgent };
	}
	if (remoteVerification.status === "ambiguous") {
		return { status: "stale", reason: "ambiguous_remote", localAgent };
	}
	if (remoteVerification.status === "expiry_mismatch") {
		const remoteAgent = extraAgents.find((agent) => agent.address.toLowerCase() === localAgent.publicKey.toLowerCase());
		if (isFiniteSafeExpiry(remoteAgent?.validUntil) && remoteAgent.validUntil <= nowMs) {
			return { status: "stale", reason: "expired_remote", localAgent };
		}
		return { status: "stale", reason: "remote_expiry_mismatch", localAgent };
	}
	if (remoteVerification.status === "remote_unknown") {
		return { status: "remote_unknown", localAgent };
	}
	return { status: "stale", reason: "missing_remote", localAgent };
}

export function shouldClearMobileAgent(verification: MobileAgentVerification): boolean {
	return verification.status === "stale";
}
