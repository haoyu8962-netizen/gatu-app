import type { Address } from "viem";
import { invalidateExchangeRequestIdentity } from "../internal/exchange/request-scheduler";
import {
	type ActiveAgentOwnerExecutionLease,
	captureActiveAgentOwnerExecutionLease,
	clearActiveAgentOwnerForRegistration,
	runWithActiveAgentOwnerExecutionLease,
	setActiveAgentOwnerForRegistration,
} from "./agent-session";
import {
	type AgentStorageRemovalResult,
	type AgentStorageWriteOptions,
	type AgentWalletMetadata,
	inspectAgentStorageRecord,
	removeAgentFromStorageAndVerify,
	writeAgentToStorageAndVerify,
} from "./agent-storage";
import type { HyperliquidEnv } from "./types";

const SESSION_STORAGE_PREFIX = "hyperliquid_agent_registration_session";
const SESSION_RECORD_VERSION = 1;
type AgentStorageRemovalFailureReason = Extract<AgentStorageRemovalResult, { status: "failed" }>["reason"];

interface AgentRegistrationSessionRecord {
	version: typeof SESSION_RECORD_VERSION;
	epoch: string;
	state: "active" | "closed" | "closing";
}

export interface AgentRegistrationEpoch {
	env: HyperliquidEnv;
	owner: Address;
	epoch: string;
}

export interface AgentRegistrationExecutionLease {
	epoch: AgentRegistrationEpoch;
	agentPublicKey?: Address;
	activeOwner?: ActiveAgentOwnerExecutionLease;
}

export interface AgentRegistrationExecutionLeaseOptions {
	agentPublicKey?: Address;
	requireActiveOwner?: boolean;
}

export type AgentRegistrationExecutionStartResult<T> =
	| { status: "started"; execution: Promise<T> }
	| { status: "invalidated" };

export type AgentRegistrationSessionFailureReason =
	| "lock_unavailable"
	| "storage_unavailable"
	| "invalid_session"
	| "owner_activation_failed"
	| "owner_cleanup_failed"
	| "unsafe_cleanup_target"
	| "write_failed"
	| "readback_mismatch";

export type AgentRegistrationSessionResult =
	| { status: "ready"; epoch: AgentRegistrationEpoch }
	| { status: "failed"; reason: AgentRegistrationSessionFailureReason };

export type AgentRegistrationShutdownResult =
	| { status: "closed"; epoch: AgentRegistrationEpoch }
	| {
			status: "failed";
			reason: AgentRegistrationSessionFailureReason | AgentStorageRemovalFailureReason;
	  };

export interface AgentRegistrationShutdownOptions {
	restoreOnFailure?: boolean;
}

export type AgentRegistrationCleanupTarget =
	| { kind: "public-key"; publicKey: Address }
	| { kind: "invalid-record" }
	| { kind: "absent-record" };

export type AgentRegistrationCleanupResult =
	| { status: "cleaned"; activeOwnerCleanupIncomplete: boolean }
	| { status: "skipped" }
	| {
			status: "failed";
			reason: AgentRegistrationSessionFailureReason | AgentStorageRemovalFailureReason;
	  };

export type AgentRegistrationPersistResult =
	| { status: "stored" }
	| {
			status: "failed";
			reason: AgentRegistrationSessionFailureReason | "registration_cancelled" | "invalid_agent" | "agent_write_failed";
	  };

export type AgentRegistrationVerificationResult =
	| { status: "current" }
	| { status: "cancelled" }
	| {
			status: "failed";
			reason: AgentRegistrationSessionFailureReason | AgentStorageRemovalFailureReason;
	  };

function getScopeKey(env: HyperliquidEnv, owner: string): string {
	return `${env}:${owner.toLowerCase()}`;
}

function getSessionStorageKey(env: HyperliquidEnv, owner: string): string {
	return `${SESSION_STORAGE_PREFIX}_${env}_${owner.toLowerCase()}`;
}

function getLockName(env: HyperliquidEnv, owner: string): string {
	return `${SESSION_STORAGE_PREFIX}:${getScopeKey(env, owner)}`;
}

function parseSessionRecord(value: string | null): AgentRegistrationSessionRecord | null | "invalid" {
	if (value === null) return null;

	try {
		const parsed = JSON.parse(value) as Record<string, unknown>;
		if (
			parsed.version !== SESSION_RECORD_VERSION ||
			typeof parsed.epoch !== "string" ||
			parsed.epoch.length < 16 ||
			(parsed.state !== "active" && parsed.state !== "closed" && parsed.state !== "closing")
		) {
			return "invalid";
		}
		return {
			version: SESSION_RECORD_VERSION,
			epoch: parsed.epoch,
			state: parsed.state,
		};
	} catch {
		return "invalid";
	}
}

function createEpoch(): string | null {
	if (typeof window === "undefined" || typeof window.crypto?.randomUUID !== "function") return null;
	return window.crypto.randomUUID();
}

function readSessionRecord(
	env: HyperliquidEnv,
	owner: string,
):
	| { status: "read"; record: AgentRegistrationSessionRecord | null }
	| { status: "failed"; reason: "storage_unavailable" | "invalid_session" } {
	if (typeof window === "undefined") return { status: "failed", reason: "storage_unavailable" };

	try {
		const parsed = parseSessionRecord(window.localStorage.getItem(getSessionStorageKey(env, owner)));
		if (parsed === "invalid") return { status: "failed", reason: "invalid_session" };
		return { status: "read", record: parsed };
	} catch {
		return { status: "failed", reason: "storage_unavailable" };
	}
}

function writeSessionRecord(
	env: HyperliquidEnv,
	owner: string,
	record: AgentRegistrationSessionRecord,
): { status: "stored" } | { status: "failed"; reason: "storage_unavailable" | "write_failed" | "readback_mismatch" } {
	if (typeof window === "undefined") return { status: "failed", reason: "storage_unavailable" };

	const key = getSessionStorageKey(env, owner);
	const serialized = JSON.stringify(record);
	try {
		window.localStorage.setItem(key, serialized);
	} catch {
		return { status: "failed", reason: "write_failed" };
	}
	if (record.state !== "active") invalidateExchangeRequestIdentity(env, owner);

	try {
		if (window.localStorage.getItem(key) !== serialized) {
			return { status: "failed", reason: "readback_mismatch" };
		}
		try {
			window.dispatchEvent(new StorageEvent("storage", { key }));
		} catch {
			// The verified record remains authoritative in restricted webviews.
		}
		return { status: "stored" };
	} catch {
		return { status: "failed", reason: "readback_mismatch" };
	}
}

async function withSessionLock<T>(env: HyperliquidEnv, owner: string, action: () => Promise<T> | T): Promise<T | null> {
	if (typeof navigator === "undefined" || !navigator.locks || typeof navigator.locks.request !== "function") {
		return null;
	}

	try {
		return await navigator.locks.request(getLockName(env, owner), { mode: "exclusive" }, action);
	} catch {
		return null;
	}
}

function createSessionRecord(state: AgentRegistrationSessionRecord["state"]): AgentRegistrationSessionRecord | null {
	const epoch = createEpoch();
	if (!epoch) return null;
	return { version: SESSION_RECORD_VERSION, epoch, state };
}

function matchesEpoch(record: AgentRegistrationSessionRecord | null, epoch: AgentRegistrationEpoch): boolean {
	return record?.state === "active" && record.epoch === epoch.epoch;
}

function matchesCleanupTarget(
	inspection: ReturnType<typeof inspectAgentStorageRecord>,
	target: AgentRegistrationCleanupTarget,
): boolean {
	if (target.kind === "invalid-record") return inspection.status === "invalid";
	if (target.kind === "absent-record") return inspection.status === "absent";
	return inspection.status === "valid" && inspection.agent.publicKey.toLowerCase() === target.publicKey.toLowerCase();
}

function matchesExecutionLease(lease: AgentRegistrationExecutionLease): boolean {
	const current = readSessionRecord(lease.epoch.env, lease.epoch.owner);
	if (current.status !== "read" || !matchesEpoch(current.record, lease.epoch)) return false;
	if (!lease.agentPublicKey) return true;

	const inspection = inspectAgentStorageRecord(lease.epoch.env, lease.epoch.owner);
	return (
		inspection.status === "valid" && inspection.agent.publicKey.toLowerCase() === lease.agentPublicKey.toLowerCase()
	);
}

async function clearMatchingActiveOwner(env: HyperliquidEnv, owner: Address): Promise<boolean> {
	return clearActiveAgentOwnerForRegistration(env, owner);
}

export function captureAgentRegistrationExecutionLease(
	env: HyperliquidEnv,
	owner: Address,
	options: AgentRegistrationExecutionLeaseOptions = {},
): AgentRegistrationExecutionLease | null {
	const current = readSessionRecord(env, owner);
	if (current.status !== "read" || current.record?.state !== "active") return null;

	const normalizedOwner = owner.toLowerCase() as Address;
	const lease: AgentRegistrationExecutionLease = {
		epoch: {
			env,
			owner: normalizedOwner,
			epoch: current.record.epoch,
		},
	};

	if (options.agentPublicKey) {
		const inspection = inspectAgentStorageRecord(env, normalizedOwner);
		if (
			inspection.status !== "valid" ||
			inspection.agent.publicKey.toLowerCase() !== options.agentPublicKey.toLowerCase()
		) {
			return null;
		}
		lease.agentPublicKey = options.agentPublicKey.toLowerCase() as Address;
	}

	if (options.requireActiveOwner) {
		if (!lease.agentPublicKey) return null;
		const activeOwner = captureActiveAgentOwnerExecutionLease(env, normalizedOwner);
		if (!activeOwner) return null;
		lease.activeOwner = activeOwner;
	}

	return lease;
}

export async function isAgentRegistrationExecutionLeaseCurrent(
	lease: AgentRegistrationExecutionLease,
): Promise<boolean> {
	const result = await withSessionLock(lease.epoch.env, lease.epoch.owner, async () => {
		if (!matchesExecutionLease(lease)) return false;
		if (!lease.activeOwner) return true;
		return (await runWithActiveAgentOwnerExecutionLease(lease.activeOwner, () => true)) === true;
	});
	return result ?? false;
}

/**
 * Validates the exact session/key/owner generations under the same locks used
 * by lifecycle writers, then invokes the SDK synchronously and releases the
 * locks without awaiting its network promise.
 */
export async function startAgentRegistrationExecution<T>(
	lease: AgentRegistrationExecutionLease,
	canStart: () => boolean,
	execute: () => Promise<T>,
): Promise<AgentRegistrationExecutionStartResult<T>> {
	const invalidated = { status: "invalidated" } as const;
	const start = (): AgentRegistrationExecutionStartResult<T> => {
		let allowed = false;
		try {
			allowed = canStart();
		} catch {
			return invalidated;
		}
		if (!allowed) return invalidated;

		let execution: Promise<T>;
		try {
			execution = Promise.resolve(execute());
		} catch (error) {
			execution = Promise.reject(error);
		}
		return { status: "started", execution };
	};

	const result = await withSessionLock<AgentRegistrationExecutionStartResult<T>>(
		lease.epoch.env,
		lease.epoch.owner,
		async () => {
			if (!matchesExecutionLease(lease)) return invalidated;
			if (!lease.activeOwner) return start();
			return (await runWithActiveAgentOwnerExecutionLease(lease.activeOwner, start)) ?? invalidated;
		},
	);
	return result ?? invalidated;
}

export async function activateAgentRegistrationSession(env: HyperliquidEnv, owner: Address): Promise<boolean> {
	const result = await withSessionLock(env, owner, () => {
		const current = readSessionRecord(env, owner);
		if (current.status === "failed") return false;
		if (current.record?.state === "active") return true;
		if (current.record?.state === "closing") return false;

		// A verified `closed` record contains no Agent key and may be reopened
		// by a newly authenticated owner. An in-progress/failed `closing`
		// tombstone above must never be overwritten by this generic activation.
		const next = createSessionRecord("active");
		if (!next) return false;
		return writeSessionRecord(env, owner, next).status === "stored";
	});
	return result ?? false;
}

export async function captureAgentRegistrationEpoch(
	env: HyperliquidEnv,
	owner: Address,
): Promise<AgentRegistrationSessionResult> {
	const result = await withSessionLock<AgentRegistrationSessionResult>(env, owner, () => {
		const current = readSessionRecord(env, owner);
		if (current.status === "failed") return current;
		if (current.record?.state === "closing") {
			return { status: "failed", reason: "invalid_session" };
		}

		const record = createSessionRecord("active");
		if (!record) return { status: "failed", reason: "storage_unavailable" };
		const write = writeSessionRecord(env, owner, record);
		if (write.status === "failed") return write;

		return {
			status: "ready",
			epoch: { env, owner: owner.toLowerCase() as Address, epoch: record.epoch },
		};
	});
	return result ?? { status: "failed", reason: "lock_unavailable" };
}

export async function isAgentRegistrationEpochCurrent(epoch: AgentRegistrationEpoch): Promise<boolean> {
	const result = await withSessionLock(epoch.env, epoch.owner, () => {
		const current = readSessionRecord(epoch.env, epoch.owner);
		return current.status === "read" && matchesEpoch(current.record, epoch);
	});
	return result ?? false;
}

export async function closeAgentRegistrationSession(env: HyperliquidEnv, owner: Address): Promise<boolean> {
	const result = await withSessionLock(env, owner, () => {
		const next = createSessionRecord("closing");
		return !!next && writeSessionRecord(env, owner, next).status === "stored";
	});
	return result ?? false;
}

export async function persistAgentForRegistration(
	epoch: AgentRegistrationEpoch,
	privateKey: string,
	publicKey: Address,
	metadata: AgentWalletMetadata = { source: "local-registration" },
	options: AgentStorageWriteOptions = {},
): Promise<AgentRegistrationPersistResult> {
	const result = await withSessionLock<AgentRegistrationPersistResult>(epoch.env, epoch.owner, () => {
		const before = readSessionRecord(epoch.env, epoch.owner);
		if (before.status === "failed") return before;
		if (!matchesEpoch(before.record, epoch)) {
			return { status: "failed", reason: "registration_cancelled" };
		}

		const write = writeAgentToStorageAndVerify(epoch.env, epoch.owner, privateKey, publicKey, metadata, options);
		if (write.status === "failed") {
			return {
				status: "failed",
				reason: write.reason === "invalid_agent" ? "invalid_agent" : "agent_write_failed",
			};
		}

		const after = readSessionRecord(epoch.env, epoch.owner);
		if (after.status === "read" && matchesEpoch(after.record, epoch)) {
			return { status: "stored" };
		}

		// Never inspect or remove an Agent after this generation stops being
		// current. A newer flow may already own the same (env, owner) slot.
		return after.status === "failed" ? after : { status: "failed", reason: "registration_cancelled" };
	});
	return result ?? { status: "failed", reason: "lock_unavailable" };
}

export async function cancelAgentRegistrationEpochAndRemove(
	epoch: AgentRegistrationEpoch,
	expectedPublicKey?: Address,
): Promise<AgentRegistrationVerificationResult> {
	const result = await withSessionLock<AgentRegistrationVerificationResult>(epoch.env, epoch.owner, async () => {
		const current = readSessionRecord(epoch.env, epoch.owner);
		if (current.status === "failed") return current;

		// A stale generation has no authority over storage that may belong to a
		// newer registration. Return before reading the Agent slot.
		if (!matchesEpoch(current.record, epoch)) return { status: "cancelled" };

		const closing = createSessionRecord("closing");
		if (!closing) return { status: "failed", reason: "storage_unavailable" };
		const write = writeSessionRecord(epoch.env, epoch.owner, closing);
		if (write.status === "failed") return write;

		const inspection = inspectAgentStorageRecord(epoch.env, epoch.owner);
		if (inspection.status === "failed") return inspection;

		if (!expectedPublicKey) {
			if (inspection.status !== "absent") {
				return { status: "failed", reason: "unsafe_cleanup_target" };
			}
			const ownerCleaned = await clearMatchingActiveOwner(epoch.env, epoch.owner);
			const closed = writeSessionRecord(epoch.env, epoch.owner, {
				version: SESSION_RECORD_VERSION,
				epoch: closing.epoch,
				state: "closed",
			});
			if (closed.status === "failed") return closed;
			return ownerCleaned ? { status: "cancelled" } : { status: "failed", reason: "owner_cleanup_failed" };
		}

		if (inspection.status !== "valid" || inspection.agent.publicKey.toLowerCase() !== expectedPublicKey.toLowerCase()) {
			return { status: "failed", reason: "unsafe_cleanup_target" };
		}
		const removal = removeAgentFromStorageAndVerify(epoch.env, epoch.owner);
		if (removal.status === "failed") return removal;

		const ownerCleaned = await clearMatchingActiveOwner(epoch.env, epoch.owner);
		const closed = writeSessionRecord(epoch.env, epoch.owner, {
			version: SESSION_RECORD_VERSION,
			epoch: closing.epoch,
			state: "closed",
		});
		if (closed.status === "failed") return closed;
		return ownerCleaned ? { status: "cancelled" } : { status: "failed", reason: "owner_cleanup_failed" };
	});
	return result ?? { status: "failed", reason: "lock_unavailable" };
}

export async function verifyAgentRegistrationOrRemove(
	epoch: AgentRegistrationEpoch,
	expectedPublicKey: Address,
): Promise<AgentRegistrationVerificationResult> {
	const result = await withSessionLock<AgentRegistrationVerificationResult>(epoch.env, epoch.owner, () => {
		const current = readSessionRecord(epoch.env, epoch.owner);
		if (current.status === "failed") return current;

		// expectedPublicKey remains part of the API contract so callers bind the
		// verification to the key they just persisted. Once the epoch is stale,
		// however, even an identical public key may belong to a newer flow.
		void expectedPublicKey;
		return matchesEpoch(current.record, epoch) ? { status: "current" } : { status: "cancelled" };
	});
	return result ?? { status: "failed", reason: "lock_unavailable" };
}

/**
 * Commits the agent-only owner only while this exact registration generation
 * and key still own the slot. Lifecycle shutdown uses the same lock, so it
 * either wins before activation or clears the owner after activation.
 */
export async function activateAgentOwnerForRegistration(
	epoch: AgentRegistrationEpoch,
	expectedPublicKey: Address,
): Promise<AgentRegistrationVerificationResult> {
	const result = await withSessionLock<AgentRegistrationVerificationResult>(epoch.env, epoch.owner, async () => {
		const current = readSessionRecord(epoch.env, epoch.owner);
		if (current.status === "failed") return current;
		if (!matchesEpoch(current.record, epoch)) return { status: "cancelled" };

		const inspection = inspectAgentStorageRecord(epoch.env, epoch.owner);
		if (inspection.status === "failed") return inspection;
		if (inspection.status !== "valid" || inspection.agent.publicKey.toLowerCase() !== expectedPublicKey.toLowerCase()) {
			return { status: "failed", reason: "unsafe_cleanup_target" };
		}

		return (await setActiveAgentOwnerForRegistration(epoch.env, epoch.owner))
			? { status: "current" }
			: { status: "failed", reason: "owner_activation_failed" };
	});
	return result ?? { status: "failed", reason: "lock_unavailable" };
}

export async function closeAgentRegistrationSessionAndRemove(
	env: HyperliquidEnv,
	owner: Address,
	options: AgentRegistrationShutdownOptions = {},
): Promise<AgentRegistrationShutdownResult> {
	const result = await withSessionLock<AgentRegistrationShutdownResult>(env, owner, async () => {
		const next = createSessionRecord("closing");
		if (!next) return { status: "failed", reason: "storage_unavailable" };

		const write = writeSessionRecord(env, owner, next);
		if (write.status === "failed") return write;

		const removal = removeAgentFromStorageAndVerify(env, owner);
		if (removal.status === "failed") {
			if (options.restoreOnFailure !== false) {
				const active = createSessionRecord("active");
				if (active) writeSessionRecord(env, owner, active);
			}
			return removal;
		}

		const ownerCleaned = await clearMatchingActiveOwner(env, owner);
		const closed = writeSessionRecord(env, owner, {
			version: SESSION_RECORD_VERSION,
			epoch: next.epoch,
			state: "closed",
		});
		if (closed.status === "failed") return closed;
		if (!ownerCleaned) return { status: "failed", reason: "owner_cleanup_failed" };

		return {
			status: "closed",
			epoch: { env, owner: owner.toLowerCase() as Address, epoch: next.epoch },
		};
	});
	return result ?? { status: "failed", reason: "lock_unavailable" };
}

/**
 * Removes a stale Agent only if the storage slot still matches the state that
 * the caller observed. The condition, tombstone, key removal, and active-owner
 * cleanup all run under the same cross-tab lock, so an older cleanup cannot
 * delete or disconnect a newer registration generation.
 */
export async function cleanupAgentRegistrationIfMatches(
	env: HyperliquidEnv,
	owner: Address,
	target: AgentRegistrationCleanupTarget,
): Promise<AgentRegistrationCleanupResult> {
	const result = await withSessionLock<AgentRegistrationCleanupResult>(env, owner, async () => {
		const current = readSessionRecord(env, owner);
		if (current.status === "failed") return current;

		const inspection = inspectAgentStorageRecord(env, owner);
		if (inspection.status === "failed") return inspection;
		if (!matchesCleanupTarget(inspection, target)) return { status: "skipped" };

		const closing = createSessionRecord("closing");
		if (!closing) return { status: "failed", reason: "storage_unavailable" };
		const write = writeSessionRecord(env, owner, closing);
		if (write.status === "failed") return write;

		const removal = removeAgentFromStorageAndVerify(env, owner);
		if (removal.status === "failed") return removal;

		const activeOwnerCleanupIncomplete = !(await clearMatchingActiveOwner(env, owner));

		const closed = writeSessionRecord(env, owner, {
			version: SESSION_RECORD_VERSION,
			epoch: closing.epoch,
			state: "closed",
		});
		if (closed.status === "failed") return closed;

		return { status: "cleaned", activeOwnerCleanupIncomplete };
	});
	return result ?? { status: "failed", reason: "lock_unavailable" };
}

export async function restoreAgentRegistrationSession(epoch: AgentRegistrationEpoch): Promise<boolean> {
	const result = await withSessionLock(epoch.env, epoch.owner, () => {
		const current = readSessionRecord(epoch.env, epoch.owner);
		if (current.status === "failed" || current.record?.state !== "closing" || current.record.epoch !== epoch.epoch) {
			return false;
		}

		const next = createSessionRecord("active");
		return !!next && writeSessionRecord(epoch.env, epoch.owner, next).status === "stored";
	});
	return result ?? false;
}
