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
	markAgentApprovalSubmissionStartedAndVerify,
	removeAgentFromStorageAndVerify,
	writeAgentToStorageAndVerify,
} from "./agent-storage";
import type { HyperliquidEnv } from "./types";

const SESSION_STORAGE_PREFIX = "hyperliquid_agent_registration_session";
const SESSION_RECORD_VERSION = 1;
const PRE_EXECUTION_GUARD_TIMEOUT_MS = 10_000;
export const AGENT_REGISTRATION_COORDINATION_WINDOW_MS = 5 * 60_000;
const PRE_EXECUTION_GUARD_ACTIVE_OWNER_MESSAGE =
	"Pre-execution guards cannot run with an active Agent-owner execution lease.";
type AgentStorageRemovalFailureReason = Extract<AgentStorageRemovalResult, { status: "failed" }>["reason"];

interface AgentRegistrationSessionRecord {
	version: typeof SESSION_RECORD_VERSION;
	epoch: string;
	state: "active" | "closed" | "closing";
	/** Public, non-secret coordination for an in-flight local Agent approval. */
	registrationPublicKey?: Address;
	registrationPendingAtMs?: number;
	registrationSubmissionStartedAtMs?: number;
}

export interface AgentRegistrationEpoch {
	env: HyperliquidEnv;
	owner: Address;
	epoch: string;
}

export interface AgentRegistrationCaptureOptions {
	/** Reuses only the exact shared pending candidate for reconciliation. */
	resumePublicKey?: Address;
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

export type AgentRegistrationPreExecutionGuard = (signal: AbortSignal) => Promise<void>;

export class AgentRegistrationPreExecutionGuardTimeoutError extends Error {
	constructor() {
		super("The pre-execution guard timed out before the signing request could start.");
		this.name = "AgentRegistrationPreExecutionGuardTimeoutError";
	}
}

export type AgentRegistrationSessionFailureReason =
	| "lock_unavailable"
	| "storage_unavailable"
	| "invalid_session"
	| "registration_in_progress"
	| "registration_reset_required"
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
	| { status: "preserved"; epoch: AgentRegistrationEpoch }
	| {
			status: "failed";
			reason: AgentRegistrationSessionFailureReason | AgentStorageRemovalFailureReason;
	  };

export interface AgentRegistrationShutdownOptions {
	preserveIfSubmissionStarted?: boolean;
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

export interface AgentRegistrationPersistOptions extends AgentStorageWriteOptions {
	/**
	 * Resolves a coordinated pending candidate. Remote verification may finalize
	 * a submitted candidate; expiry cleanup must atomically prove it unsubmitted.
	 */
	pendingResolution?: "verified" | "expired-unsubmitted";
}

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
		const registrationPublicKey =
			typeof parsed.registrationPublicKey === "string" && /^0x[0-9a-fA-F]{40}$/.test(parsed.registrationPublicKey)
				? (parsed.registrationPublicKey.toLowerCase() as Address)
				: undefined;
		const registrationPendingAtMs =
			typeof parsed.registrationPendingAtMs === "number" &&
			Number.isSafeInteger(parsed.registrationPendingAtMs) &&
			parsed.registrationPendingAtMs > 0
				? parsed.registrationPendingAtMs
				: undefined;
		const registrationSubmissionStartedAtMs =
			typeof parsed.registrationSubmissionStartedAtMs === "number" &&
			Number.isSafeInteger(parsed.registrationSubmissionStartedAtMs) &&
			parsed.registrationSubmissionStartedAtMs > 0
				? parsed.registrationSubmissionStartedAtMs
				: undefined;
		const hasRegistrationMetadata =
			parsed.registrationPublicKey !== undefined ||
			parsed.registrationPendingAtMs !== undefined ||
			parsed.registrationSubmissionStartedAtMs !== undefined;
		if (
			parsed.version !== SESSION_RECORD_VERSION ||
			typeof parsed.epoch !== "string" ||
			parsed.epoch.length < 16 ||
			(parsed.state !== "active" && parsed.state !== "closed" && parsed.state !== "closing") ||
			(hasRegistrationMetadata &&
				(parsed.state === "closed" ||
					registrationPublicKey === undefined ||
					registrationPendingAtMs === undefined ||
					(parsed.registrationSubmissionStartedAtMs !== undefined &&
						(registrationSubmissionStartedAtMs === undefined ||
							registrationSubmissionStartedAtMs < registrationPendingAtMs))))
		) {
			return "invalid";
		}
		return {
			version: SESSION_RECORD_VERSION,
			epoch: parsed.epoch,
			state: parsed.state,
			...(registrationPublicKey === undefined ? {} : { registrationPublicKey }),
			...(registrationPendingAtMs === undefined ? {} : { registrationPendingAtMs }),
			...(registrationSubmissionStartedAtMs === undefined ? {} : { registrationSubmissionStartedAtMs }),
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

function hasMatchingPendingRegistration(
	record: AgentRegistrationSessionRecord,
	inspection: ReturnType<typeof inspectAgentStorageRecord>,
): boolean {
	return (
		record.registrationPublicKey !== undefined &&
		record.registrationPendingAtMs !== undefined &&
		inspection.status === "valid" &&
		inspection.agent.source === "local-registration" &&
		inspection.agent.approvalPendingAtMs === record.registrationPendingAtMs &&
		inspection.agent.approvalSubmissionStartedAtMs === record.registrationSubmissionStartedAtMs &&
		inspection.agent.publicKey.toLowerCase() === record.registrationPublicKey.toLowerCase()
	);
}

function withoutRegistrationCoordination(record: AgentRegistrationSessionRecord): AgentRegistrationSessionRecord {
	return {
		version: record.version,
		epoch: record.epoch,
		state: record.state,
	};
}

function copyRegistrationCoordination(
	target: AgentRegistrationSessionRecord,
	source: AgentRegistrationSessionRecord | null,
): AgentRegistrationSessionRecord {
	if (!source?.registrationPublicKey || source.registrationPendingAtMs === undefined) return target;
	return {
		...target,
		registrationPublicKey: source.registrationPublicKey,
		registrationPendingAtMs: source.registrationPendingAtMs,
		...(source.registrationSubmissionStartedAtMs === undefined
			? {}
			: { registrationSubmissionStartedAtMs: source.registrationSubmissionStartedAtMs }),
	};
}

async function runPreExecutionGuard(guard: AgentRegistrationPreExecutionGuard): Promise<void> {
	const controller = new AbortController();
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			guard(controller.signal),
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => {
					const error = new AgentRegistrationPreExecutionGuardTimeoutError();
					reject(error);
					controller.abort(error);
				}, PRE_EXECUTION_GUARD_TIMEOUT_MS);
			}),
		]);
	} finally {
		if (timeout !== undefined) clearTimeout(timeout);
		controller.abort();
	}
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
	preExecutionGuard?: AgentRegistrationPreExecutionGuard,
): Promise<AgentRegistrationExecutionStartResult<T>> {
	if (preExecutionGuard && lease.activeOwner) throw new Error(PRE_EXECUTION_GUARD_ACTIVE_OWNER_MESSAGE);
	const invalidated = { status: "invalidated" } as const;
	const guardFailure: { error: unknown; failed: boolean } = { error: undefined, failed: false };
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
			if (preExecutionGuard) {
				try {
					await runPreExecutionGuard(preExecutionGuard);
				} catch (error) {
					guardFailure.error = error;
					guardFailure.failed = true;
					return invalidated;
				}
				if (!matchesExecutionLease(lease)) return invalidated;
			}
			if (!lease.activeOwner) return start();
			return (await runWithActiveAgentOwnerExecutionLease(lease.activeOwner, start)) ?? invalidated;
		},
	);
	if (guardFailure.failed) throw guardFailure.error;
	return result ?? invalidated;
}

/**
 * Revalidates the exact pending Agent and durably marks the submission boundary
 * under the registration lock before starting the exchange request.
 */
export async function startAgentRegistrationSubmission<T>(
	lease: AgentRegistrationExecutionLease,
	canStart: () => boolean,
	execute: () => Promise<T>,
): Promise<AgentRegistrationExecutionStartResult<T>> {
	const invalidated = { status: "invalidated" } as const;
	const agentPublicKey = lease.agentPublicKey;
	if (!agentPublicKey || lease.activeOwner) return invalidated;
	let markerFailureMessage: string | null = null;

	const result = await withSessionLock<AgentRegistrationExecutionStartResult<T>>(
		lease.epoch.env,
		lease.epoch.owner,
		() => {
			if (!matchesExecutionLease(lease)) return invalidated;
			try {
				if (!canStart()) return invalidated;
			} catch {
				return invalidated;
			}

			const current = readSessionRecord(lease.epoch.env, lease.epoch.owner);
			if (
				current.status !== "read" ||
				!current.record ||
				current.record.registrationPublicKey?.toLowerCase() !== agentPublicKey.toLowerCase() ||
				current.record.registrationPendingAtMs === undefined ||
				current.record.registrationSubmissionStartedAtMs !== undefined
			) {
				return invalidated;
			}
			const pending = inspectAgentStorageRecord(lease.epoch.env, lease.epoch.owner);
			if (
				pending.status !== "valid" ||
				pending.agent.source !== "local-registration" ||
				pending.agent.publicKey.toLowerCase() !== agentPublicKey.toLowerCase() ||
				pending.agent.approvalPendingAtMs !== current.record.registrationPendingAtMs ||
				pending.agent.approvalSubmissionStartedAtMs !== undefined
			) {
				return invalidated;
			}

			const submissionStartedAtMs = Date.now();
			const coordinationWrite = writeSessionRecord(lease.epoch.env, lease.epoch.owner, {
				...current.record,
				registrationSubmissionStartedAtMs: submissionStartedAtMs,
			});
			if (coordinationWrite.status === "failed") {
				markerFailureMessage = "Agent approval submission state could not be stored safely";
				return invalidated;
			}

			const marker = markAgentApprovalSubmissionStartedAndVerify(
				lease.epoch.env,
				lease.epoch.owner,
				agentPublicKey,
				submissionStartedAtMs,
			);
			if (marker.status === "failed") {
				const rollback = writeSessionRecord(lease.epoch.env, lease.epoch.owner, current.record);
				markerFailureMessage =
					rollback.status === "stored"
						? "Agent approval submission state could not be stored safely"
						: "Agent approval submission coordination could not be rolled back safely";
				return invalidated;
			}

			try {
				return { status: "started", execution: Promise.resolve(execute()) };
			} catch (error) {
				return { status: "started", execution: Promise.reject(error) };
			}
		},
	);
	if (markerFailureMessage) throw new Error(markerFailureMessage);
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
	options: AgentRegistrationCaptureOptions = {},
): Promise<AgentRegistrationSessionResult> {
	const result = await withSessionLock<AgentRegistrationSessionResult>(env, owner, () => {
		const current = readSessionRecord(env, owner);
		if (current.status === "failed") return current;
		if (current.record?.state === "closing") {
			return { status: "failed", reason: "invalid_session" };
		}
		if (current.record?.state === "active" && current.record.registrationPublicKey) {
			const inspection = inspectAgentStorageRecord(env, owner);
			if (inspection.status === "failed") return inspection;
			const hasMatchingCandidate = hasMatchingPendingRegistration(current.record, inspection);
			if (
				options.resumePublicKey?.toLowerCase() === current.record.registrationPublicKey.toLowerCase() &&
				hasMatchingCandidate
			) {
				return {
					status: "ready",
					epoch: { env, owner: owner.toLowerCase() as Address, epoch: current.record.epoch },
				};
			}
			const pendingAtMs = current.record.registrationPendingAtMs;
			if (current.record.registrationSubmissionStartedAtMs !== undefined && !hasMatchingCandidate) {
				return { status: "failed", reason: "registration_reset_required" };
			}
			if (
				current.record.registrationSubmissionStartedAtMs !== undefined ||
				(pendingAtMs !== undefined && Date.now() - pendingAtMs < AGENT_REGISTRATION_COORDINATION_WINDOW_MS)
			) {
				return { status: "failed", reason: "registration_in_progress" };
			}
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
		const current = readSessionRecord(env, owner);
		if (current.status === "failed") return false;
		const created = createSessionRecord("closing");
		const next = created ? copyRegistrationCoordination(created, current.record) : null;
		return !!next && writeSessionRecord(env, owner, next).status === "stored";
	});
	return result ?? false;
}

export async function persistAgentForRegistration(
	epoch: AgentRegistrationEpoch,
	privateKey: string,
	publicKey: Address,
	metadata: AgentWalletMetadata = { source: "local-registration" },
	options: AgentRegistrationPersistOptions = {},
): Promise<AgentRegistrationPersistResult> {
	const result = await withSessionLock<AgentRegistrationPersistResult>(epoch.env, epoch.owner, () => {
		const before = readSessionRecord(epoch.env, epoch.owner);
		if (before.status === "failed") return before;
		if (!matchesEpoch(before.record, epoch)) {
			return { status: "failed", reason: "registration_cancelled" };
		}
		if (!before.record) return { status: "failed", reason: "invalid_session" };

		const isPendingLocalRegistration =
			metadata.source === "local-registration" && metadata.approvalPendingAtMs !== undefined;
		if (options.pendingResolution === "expired-unsubmitted" && before.record.registrationPublicKey === undefined) {
			return { status: "failed", reason: "registration_cancelled" };
		}
		if (before.record.registrationPublicKey !== undefined && !isPendingLocalRegistration) {
			const existing = inspectAgentStorageRecord(epoch.env, epoch.owner);
			if (
				metadata.source !== "local-registration" ||
				before.record.registrationPublicKey.toLowerCase() !== publicKey.toLowerCase() ||
				existing.status !== "valid" ||
				existing.agent.source !== "local-registration" ||
				existing.agent.publicKey.toLowerCase() !== publicKey.toLowerCase() ||
				existing.agent.privateKey.toLowerCase() !== privateKey.toLowerCase() ||
				existing.agent.approvalPendingAtMs !== before.record.registrationPendingAtMs
			) {
				return { status: "failed", reason: "registration_in_progress" };
			}
			if (options.pendingResolution === undefined) {
				return { status: "failed", reason: "registration_in_progress" };
			}
			if (
				options.pendingResolution === "expired-unsubmitted" &&
				(before.record.registrationSubmissionStartedAtMs !== undefined ||
					existing.agent.approvalSubmissionStartedAtMs !== undefined)
			) {
				return { status: "failed", reason: "registration_cancelled" };
			}
		}
		if (
			isPendingLocalRegistration &&
			before.record.registrationPublicKey !== undefined &&
			before.record.registrationPublicKey.toLowerCase() !== publicKey.toLowerCase()
		) {
			return { status: "failed", reason: "registration_cancelled" };
		}

		let effectiveMetadata = metadata;
		let coordinatedRecord = before.record;
		if (isPendingLocalRegistration) {
			const existing = inspectAgentStorageRecord(epoch.env, epoch.owner);
			if (existing.status === "failed") return existing;
			const existingPendingAgent =
				existing.status === "valid" &&
				existing.agent.source === "local-registration" &&
				existing.agent.publicKey.toLowerCase() === publicKey.toLowerCase() &&
				existing.agent.approvalPendingAtMs === metadata.approvalPendingAtMs
					? existing.agent
					: undefined;
			if (
				existing.status === "valid" &&
				existing.agent.publicKey.toLowerCase() === publicKey.toLowerCase() &&
				existingPendingAgent === undefined
			) {
				return { status: "failed", reason: "registration_cancelled" };
			}
			if (
				before.record.registrationPublicKey?.toLowerCase() === publicKey.toLowerCase() &&
				before.record.registrationPendingAtMs !== metadata.approvalPendingAtMs
			) {
				return { status: "failed", reason: "registration_cancelled" };
			}
			const storedSubmissionStartedAtMs = existingPendingAgent?.approvalSubmissionStartedAtMs;
			const coordinatedSubmissionStartedAtMs =
				before.record.registrationPublicKey?.toLowerCase() === publicKey.toLowerCase()
					? before.record.registrationSubmissionStartedAtMs
					: undefined;
			const requestedSubmissionStartedAtMs = metadata.approvalSubmissionStartedAtMs;
			const submissionMarkers = [
				storedSubmissionStartedAtMs,
				coordinatedSubmissionStartedAtMs,
				requestedSubmissionStartedAtMs,
			].filter((value): value is number => value !== undefined);
			if (new Set(submissionMarkers).size > 1) {
				return { status: "failed", reason: "registration_cancelled" };
			}
			const approvalSubmissionStartedAtMs = submissionMarkers[0];
			effectiveMetadata = {
				...metadata,
				...(approvalSubmissionStartedAtMs === undefined ? {} : { approvalSubmissionStartedAtMs }),
			};
			coordinatedRecord = {
				version: before.record.version,
				epoch: before.record.epoch,
				state: before.record.state,
				registrationPublicKey: publicKey.toLowerCase() as Address,
				registrationPendingAtMs: metadata.approvalPendingAtMs,
				...(approvalSubmissionStartedAtMs === undefined
					? {}
					: { registrationSubmissionStartedAtMs: approvalSubmissionStartedAtMs }),
			};
			const coordinationWrite = writeSessionRecord(epoch.env, epoch.owner, coordinatedRecord);
			if (coordinationWrite.status === "failed") return coordinationWrite;
		}

		const write = writeAgentToStorageAndVerify(epoch.env, epoch.owner, privateKey, publicKey, effectiveMetadata, {
			scope: options.scope,
		});
		if (write.status === "failed") {
			if (isPendingLocalRegistration && effectiveMetadata.approvalSubmissionStartedAtMs === undefined) {
				writeSessionRecord(epoch.env, epoch.owner, before.record);
			}
			return {
				status: "failed",
				reason: write.reason === "invalid_agent" ? "invalid_agent" : "agent_write_failed",
			};
		}

		if (!isPendingLocalRegistration) {
			const coordinationClear = writeSessionRecord(
				epoch.env,
				epoch.owner,
				withoutRegistrationCoordination(coordinatedRecord),
			);
			if (coordinationClear.status === "failed") return coordinationClear;
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
	options: { preserveIfSubmissionStarted?: boolean } = {},
): Promise<AgentRegistrationVerificationResult> {
	const result = await withSessionLock<AgentRegistrationVerificationResult>(epoch.env, epoch.owner, async () => {
		const current = readSessionRecord(epoch.env, epoch.owner);
		if (current.status === "failed") return current;

		// A stale generation has no authority over storage that may belong to a
		// newer registration. Return before reading the Agent slot.
		if (!matchesEpoch(current.record, epoch)) return { status: "cancelled" };

		if (expectedPublicKey && options.preserveIfSubmissionStarted) {
			if (
				current.record?.registrationPublicKey?.toLowerCase() === expectedPublicKey.toLowerCase() &&
				current.record.registrationSubmissionStartedAtMs !== undefined
			) {
				return { status: "current" };
			}
			const pending = inspectAgentStorageRecord(epoch.env, epoch.owner);
			if (
				pending.status === "valid" &&
				pending.agent.publicKey.toLowerCase() === expectedPublicKey.toLowerCase() &&
				pending.agent.approvalSubmissionStartedAtMs !== undefined
			) {
				return { status: "current" };
			}
		}
		const matchesExpectedCoordinationTarget =
			expectedPublicKey === undefined ||
			current.record?.registrationPublicKey?.toLowerCase() === expectedPublicKey.toLowerCase();

		const closing = createSessionRecord("closing");
		if (!closing) return { status: "failed", reason: "storage_unavailable" };
		const write = writeSessionRecord(epoch.env, epoch.owner, closing);
		if (write.status === "failed") return write;

		const inspection = inspectAgentStorageRecord(epoch.env, epoch.owner);
		if (inspection.status === "failed") return inspection;

		// The exact current epoch is still authoritative here, and the preservation
		// checks above proved that neither coordination record crossed the
		// submission boundary. A verified marker readback failure removes the Agent
		// slot before returning. An absent slot is therefore safe to finish closing
		// only for a pre-persistence cancellation or when the surviving coordination
		// record still binds the caller's exact expected key.
		if (inspection.status === "absent" && matchesExpectedCoordinationTarget) {
			const ownerCleaned = await clearMatchingActiveOwner(epoch.env, epoch.owner);
			const closed = writeSessionRecord(epoch.env, epoch.owner, {
				version: SESSION_RECORD_VERSION,
				epoch: closing.epoch,
				state: "closed",
			});
			if (closed.status === "failed") return closed;
			return ownerCleaned ? { status: "cancelled" } : { status: "failed", reason: "owner_cleanup_failed" };
		}
		if (!expectedPublicKey) return { status: "failed", reason: "unsafe_cleanup_target" };

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
		const current = readSessionRecord(env, owner);
		if (current.status === "failed") return current;
		if (options.preserveIfSubmissionStarted) {
			const inspection = inspectAgentStorageRecord(env, owner);
			if (inspection.status === "failed") return inspection;
			if (
				current.record?.registrationSubmissionStartedAtMs !== undefined ||
				(inspection.status === "valid" && inspection.agent.approvalSubmissionStartedAtMs !== undefined)
			) {
				const epoch = current.record?.epoch;
				if (!epoch || current.record?.state !== "active") {
					return { status: "failed", reason: "invalid_session" };
				}
				return {
					status: "preserved",
					epoch: { env, owner: owner.toLowerCase() as Address, epoch },
				};
			}
		}
		const created = createSessionRecord("closing");
		const next = created ? copyRegistrationCoordination(created, current.record) : null;
		if (!next) return { status: "failed", reason: "storage_unavailable" };

		const write = writeSessionRecord(env, owner, next);
		if (write.status === "failed") return write;

		const removal = removeAgentFromStorageAndVerify(env, owner);
		if (removal.status === "failed") {
			if (options.restoreOnFailure !== false) {
				const createdActive = createSessionRecord("active");
				const active = createdActive ? copyRegistrationCoordination(createdActive, current.record) : null;
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
		// An invalid or stale local record cannot prove that an approval request
		// never reached Hyperliquid. Preserve a recorded submission boundary so
		// automatic status cleanup cannot make a second approval possible.
		if (current.record?.registrationSubmissionStartedAtMs !== undefined) {
			return { status: "skipped" };
		}

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

		const created = createSessionRecord("active");
		const next = created ? copyRegistrationCoordination(created, current.record) : null;
		return !!next && writeSessionRecord(epoch.env, epoch.owner, next).status === "stored";
	});
	return result ?? false;
}
