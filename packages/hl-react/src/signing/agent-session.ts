import { useSyncExternalStore } from "react";
import { type Address, isAddress, zeroAddress } from "viem";
import {
	invalidateAllExchangeRequestIdentities,
	invalidateExchangeRequestIdentity,
} from "../internal/exchange/request-scheduler";
import type { HyperliquidEnv } from "./types";

/**
 * Identity mode for the active Hyperliquid session.
 * - `wallet`: a master wallet is connected (Privy/wagmi); full access incl. user-signed actions.
 * - `agent-only`: no master wallet connected, but a local agent owns a session for some owner
 *   address (e.g. imported by scanning a mobile link). Can trade/query, but NOT withdraw/transfer.
 * - `disconnected`: no identity.
 */
export type SessionMode = "wallet" | "agent-only" | "disconnected";

export interface AgentOwner {
	env: HyperliquidEnv;
	address: Address;
}

interface PersistedAgentOwner extends AgentOwner {
	version: 1;
	activationEpoch: string | null;
}

export interface ActiveAgentOwnerExecutionLease extends AgentOwner {
	activationEpoch: string;
}

export interface ResolvedSession {
	clientKey: string;
	sessionMode: SessionMode;
}

const STORAGE_KEY = "hyperliquid_active_agent_owner";
const ACTIVE_OWNER_LOCK_NAME = `${STORAGE_KEY}:lock`;

/**
 * Resolve the effective session identity. A connected master wallet (`userAddress`) always wins,
 * keeping the connected-wallet path byte-for-byte identical to before. Only when no wallet is
 * connected does an env-matching agent-only owner take over.
 */
export function resolveSession(
	userAddress: Address | undefined,
	activeAgentOwner: AgentOwner | null,
	env: HyperliquidEnv,
): ResolvedSession {
	if (userAddress) return { clientKey: userAddress, sessionMode: "wallet" };
	if (activeAgentOwner && activeAgentOwner.env === env) {
		return { clientKey: activeAgentOwner.address, sessionMode: "agent-only" };
	}
	return { clientKey: "disconnected", sessionMode: "disconnected" };
}

function normalizePersistedOwner(value: unknown): PersistedAgentOwner | null {
	if (!value || typeof value !== "object") return null;
	const { env, address, activationEpoch } = value as Record<string, unknown>;
	if (env !== "Mainnet" && env !== "Testnet") return null;
	if (typeof address !== "string" || !isAddress(address)) return null;
	const normalized = address.toLowerCase() as Address;
	if (normalized === zeroAddress) return null;
	if (activationEpoch !== undefined && (typeof activationEpoch !== "string" || activationEpoch.length < 16)) {
		return null;
	}
	return {
		version: 1,
		env,
		address: normalized,
		activationEpoch: typeof activationEpoch === "string" ? activationEpoch : null,
	};
}

// localStorage is the source of truth, so the active agent-only session survives reloads and stays
// consistent across tabs. A cache + version counter hands useSyncExternalStore a stable snapshot
// reference between writes. All storage access is guarded for SSR/node (no window → null read,
// no-op write), so the module is safe to evaluate and call on the server.
let cache: { value: AgentOwner | null; version: number } | null = null;
let version = 0;
const blockedOwners = new Set<string>();

function getOwnerKey(owner: AgentOwner): string {
	return `${owner.env}:${owner.address}`;
}

function isOwnerBlocked(owner: AgentOwner | null): boolean {
	return !!owner && blockedOwners.has(getOwnerKey(owner));
}

function blockOwner(owner: AgentOwner) {
	blockedOwners.add(getOwnerKey(owner));
	version += 1;
	cache = { value: null, version };
}

function readPersistedRecord(): PersistedAgentOwner | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		return raw ? normalizePersistedOwner(JSON.parse(raw)) : null;
	} catch {
		return null;
	}
}

function readPersisted(): AgentOwner | null {
	const record = readPersistedRecord();
	return record ? { env: record.env, address: record.address } : null;
}

export function getActiveAgentOwner(): AgentOwner | null {
	if (cache && cache.version === version) return cache.value;
	const persisted = readPersisted();
	const value = isOwnerBlocked(persisted) ? null : persisted;
	cache = { value, version };
	return value;
}

function writeOwner(owner: PersistedAgentOwner | null): boolean {
	if (typeof window === "undefined") return false;
	try {
		const oldValue = window.localStorage.getItem(STORAGE_KEY);
		if (owner) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(owner));
		else {
			try {
				window.localStorage.removeItem(STORAGE_KEY);
			} catch {
				window.localStorage.setItem(STORAGE_KEY, "null");
			}
		}

		let raw = window.localStorage.getItem(STORAGE_KEY);
		let persisted = raw ? normalizePersistedOwner(JSON.parse(raw)) : null;
		let matches = owner
			? !!persisted &&
				persisted.env === owner.env &&
				persisted.address === owner.address &&
				persisted.activationEpoch === owner.activationEpoch
			: persisted === null;
		if (!matches && !owner) {
			window.localStorage.setItem(STORAGE_KEY, "null");
			raw = window.localStorage.getItem(STORAGE_KEY);
			persisted = raw ? normalizePersistedOwner(JSON.parse(raw)) : null;
			matches = persisted === null;
		}
		if (matches && owner) {
			blockedOwners.delete(getOwnerKey(owner));
		}
		version += 1;
		const publicOwner = persisted ? { env: persisted.env, address: persisted.address } : null;
		cache = { value: isOwnerBlocked(publicOwner) ? null : publicOwner, version };
		// Same-tab listeners never receive the native storage event, so dispatch one explicitly
		// (matches the agent-storage pattern); other tabs receive the native event.
		try {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: STORAGE_KEY,
					newValue: raw,
					oldValue,
				}),
			);
		} catch {
			// The exact storage readback above remains authoritative. Event
			// construction can fail in restricted webviews, but must not turn a
			// successful write into a false failure and leave an orphan owner.
		}
		return matches;
	} catch {
		version += 1;
		cache = null;
		try {
			window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
		} catch {
			// The in-memory block still prevents this tab from resolving the
			// stale owner when both persistent cleanup paths are unavailable.
		}
		return false;
	}
}

function createPersistedOwner(env: HyperliquidEnv, address: Address): PersistedAgentOwner | null {
	const normalized = normalizePersistedOwner({ env, address });
	if (!normalized || typeof window === "undefined" || typeof window.crypto?.randomUUID !== "function") return null;
	return {
		...normalized,
		activationEpoch: window.crypto.randomUUID(),
	};
}

export function setActiveAgentOwner(env: HyperliquidEnv, address: Address): void {
	const next = createPersistedOwner(env, address);
	if (!next) return;
	const current = readPersistedRecord();
	if (current && current.env === next.env && current.address === next.address && current.activationEpoch !== null) {
		return;
	}
	if (current) invalidateExchangeRequestIdentity(current.env, current.address, "agent-only");
	writeOwner(next);
}

export function setActiveAgentOwnerAndVerify(env: HyperliquidEnv, address: Address): boolean {
	const expected = createPersistedOwner(env, address);
	if (!expected) return false;
	const current = readPersistedRecord();
	if (current && (current.env !== expected.env || current.address !== expected.address)) {
		invalidateExchangeRequestIdentity(current.env, current.address, "agent-only");
	}
	return writeOwner(expected);
}

export function clearActiveAgentOwner(): void {
	const current = readPersistedRecord();
	if (!current) return;
	invalidateExchangeRequestIdentity(current.env, current.address, "agent-only");
	blockOwner(current);
	writeOwner(null);
}

export function clearActiveAgentOwnerIfMatches(env: HyperliquidEnv, address: Address): boolean {
	const expected = normalizePersistedOwner({ env, address });
	const current = readPersistedRecord();
	if (!expected || !current || current.env !== expected.env || current.address !== expected.address) {
		return false;
	}
	invalidateExchangeRequestIdentity(current.env, current.address, "agent-only");
	blockOwner(current);
	return writeOwner(null);
}

async function withActiveOwnerLock<T>(action: () => T): Promise<T | null> {
	if (typeof navigator === "undefined" || !navigator.locks || typeof navigator.locks.request !== "function") {
		return null;
	}
	try {
		return await navigator.locks.request(ACTIVE_OWNER_LOCK_NAME, { mode: "exclusive" }, action);
	} catch {
		return null;
	}
}

/**
 * Registration-only owner commit. Callers already hold their scoped
 * registration lock, establishing the global lock order: session → owner.
 */
export async function setActiveAgentOwnerForRegistration(env: HyperliquidEnv, address: Address): Promise<boolean> {
	const result = await withActiveOwnerLock(() => setActiveAgentOwnerAndVerify(env, address));
	return result ?? false;
}

/** Upgrades a legacy matching owner record without ever overwriting a different owner. */
export async function ensureActiveAgentOwnerRevision(env: HyperliquidEnv, address: Address): Promise<boolean> {
	const result = await withActiveOwnerLock(() => {
		const expected = normalizePersistedOwner({ env, address });
		const current = readPersistedRecord();
		if (!expected || !current || current.env !== expected.env || current.address !== expected.address) return false;
		if (current.activationEpoch) return true;
		const upgraded = createPersistedOwner(env, address);
		return !!upgraded && writeOwner(upgraded);
	});
	return result ?? false;
}

/**
 * Registration-only compare-and-clear. A missing or different owner already
 * satisfies cleanup; a matching owner is removed under the global lock.
 */
export async function clearActiveAgentOwnerForRegistration(env: HyperliquidEnv, address: Address): Promise<boolean> {
	const result = await withActiveOwnerLock(() => {
		const expected = normalizePersistedOwner({ env, address });
		const current = readPersistedRecord();
		if (!expected) return false;
		if (!current || current.env !== expected.env || current.address !== expected.address) return true;
		return clearActiveAgentOwnerIfMatches(env, address);
	});
	return result ?? false;
}

export function captureActiveAgentOwnerExecutionLease(
	env: HyperliquidEnv,
	address: Address,
): ActiveAgentOwnerExecutionLease | null {
	const expected = normalizePersistedOwner({ env, address });
	const current = readPersistedRecord();
	if (!expected || !current?.activationEpoch || current.env !== expected.env || current.address !== expected.address) {
		return null;
	}
	return {
		env: current.env,
		address: current.address,
		activationEpoch: current.activationEpoch,
	};
}

/**
 * Revalidates the exact active-owner activation while holding the same global
 * lock used by owner writes. The callback must return a non-thenable wrapper
 * when it starts asynchronous work so the lock is released immediately.
 */
export async function runWithActiveAgentOwnerExecutionLease<T>(
	lease: ActiveAgentOwnerExecutionLease,
	action: () => T,
): Promise<T | null> {
	const result = await withActiveOwnerLock(() => {
		const current = readPersistedRecord();
		if (
			!current?.activationEpoch ||
			current.env !== lease.env ||
			current.address !== lease.address ||
			current.activationEpoch !== lease.activationEpoch
		) {
			return null;
		}
		return action();
	});
	return result ?? null;
}

function subscribe(callback: () => void): () => void {
	if (typeof window === "undefined") return () => {};
	function handleStorage(event: StorageEvent) {
		if (event.key !== STORAGE_KEY && event.key !== null) return;

		if (event.key === null) {
			invalidateAllExchangeRequestIdentities();
		} else {
			const previous = parseStorageEventOwner(event.oldValue);
			const next = parseStorageEventOwner(event.newValue);
			if (!previous.valid || !next.valid) {
				invalidateAllExchangeRequestIdentities();
			} else if (
				previous.owner &&
				(!next.owner || previous.owner.env !== next.owner.env || previous.owner.address !== next.owner.address)
			) {
				invalidateExchangeRequestIdentity(previous.owner.env, previous.owner.address, "agent-only");
			}
		}

		version += 1;
		cache = null;
		callback();
	}
	window.addEventListener("storage", handleStorage);
	return () => window.removeEventListener("storage", handleStorage);
}

function parseStorageEventOwner(value: string | null): { valid: boolean; owner: AgentOwner | null } {
	if (value === null || value === "null") return { valid: true, owner: null };
	try {
		const record = normalizePersistedOwner(JSON.parse(value));
		const owner = record ? { env: record.env, address: record.address } : null;
		return owner ? { valid: true, owner } : { valid: false, owner: null };
	} catch {
		return { valid: false, owner: null };
	}
}

export function useActiveAgentOwner(): AgentOwner | null {
	return useSyncExternalStore(subscribe, getActiveAgentOwner, () => null);
}
