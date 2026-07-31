import { useSyncExternalStore } from "react";
import { type Address, isAddress, zeroAddress } from "viem";
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

export interface ResolvedSession {
	clientKey: string;
	sessionMode: SessionMode;
}

const STORAGE_KEY = "hyperliquid_active_agent_owner";

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

function normalizeOwner(value: unknown): AgentOwner | null {
	if (!value || typeof value !== "object") return null;
	const { env, address } = value as Record<string, unknown>;
	if (env !== "Mainnet" && env !== "Testnet") return null;
	if (typeof address !== "string" || !isAddress(address)) return null;
	const normalized = address.toLowerCase() as Address;
	if (normalized === zeroAddress) return null;
	return { env, address: normalized };
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

function readPersisted(): AgentOwner | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		return raw ? normalizeOwner(JSON.parse(raw)) : null;
	} catch {
		return null;
	}
}

export function getActiveAgentOwner(): AgentOwner | null {
	if (cache && cache.version === version) return cache.value;
	const persisted = readPersisted();
	const value = isOwnerBlocked(persisted) ? null : persisted;
	cache = { value, version };
	return value;
}

function writeOwner(owner: AgentOwner | null): boolean {
	if (typeof window === "undefined") return false;
	try {
		if (owner) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(owner));
		else {
			try {
				window.localStorage.removeItem(STORAGE_KEY);
			} catch {
				window.localStorage.setItem(STORAGE_KEY, "null");
			}
		}

		let raw = window.localStorage.getItem(STORAGE_KEY);
		let persisted = raw ? normalizeOwner(JSON.parse(raw)) : null;
		let matches = owner
			? !!persisted && persisted.env === owner.env && persisted.address === owner.address
			: persisted === null;
		if (!matches && !owner) {
			window.localStorage.setItem(STORAGE_KEY, "null");
			raw = window.localStorage.getItem(STORAGE_KEY);
			persisted = raw ? normalizeOwner(JSON.parse(raw)) : null;
			matches = persisted === null;
		}
		if (matches && owner) {
			blockedOwners.delete(getOwnerKey(owner));
		}
		version += 1;
		cache = { value: isOwnerBlocked(persisted) ? null : persisted, version };
		// Same-tab listeners never receive the native storage event, so dispatch one explicitly
		// (matches the agent-storage pattern); other tabs receive the native event.
		try {
			window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
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

export function setActiveAgentOwner(env: HyperliquidEnv, address: Address): void {
	const next = normalizeOwner({ env, address });
	if (!next) return;
	const current = getActiveAgentOwner();
	if (current && current.env === next.env && current.address === next.address) return;
	writeOwner(next);
}

export function setActiveAgentOwnerAndVerify(env: HyperliquidEnv, address: Address): boolean {
	const expected = normalizeOwner({ env, address });
	if (!expected) return false;
	return writeOwner(expected);
}

export function clearActiveAgentOwner(): void {
	const current = readPersisted();
	if (!current) return;
	blockOwner(current);
	writeOwner(null);
}

export function clearActiveAgentOwnerIfMatches(env: HyperliquidEnv, address: Address): boolean {
	const expected = normalizeOwner({ env, address });
	const current = readPersisted();
	if (!expected || !current || current.env !== expected.env || current.address !== expected.address) {
		return false;
	}
	blockOwner(current);
	return writeOwner(null);
}

function subscribe(callback: () => void): () => void {
	if (typeof window === "undefined") return () => {};
	function handleStorage(event: StorageEvent) {
		if (event.key === STORAGE_KEY || event.key === null) {
			version += 1;
			cache = null;
			callback();
		}
	}
	window.addEventListener("storage", handleStorage);
	return () => window.removeEventListener("storage", handleStorage);
}

export function useActiveAgentOwner(): AgentOwner | null {
	return useSyncExternalStore(subscribe, getActiveAgentOwner, () => null);
}
