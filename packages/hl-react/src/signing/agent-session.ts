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
	const value = readPersisted();
	cache = { value, version };
	return value;
}

function writeOwner(owner: AgentOwner | null): void {
	if (typeof window === "undefined") return;
	try {
		if (owner) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(owner));
		else window.localStorage.removeItem(STORAGE_KEY);
		version += 1;
		cache = null;
		// Same-tab listeners never receive the native storage event, so dispatch one explicitly
		// (matches the agent-storage pattern); other tabs receive the native event.
		window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
	} catch {
		// Storage may be unavailable (private mode, quota); nothing else to do.
	}
}

export function setActiveAgentOwner(env: HyperliquidEnv, address: Address): void {
	const next = normalizeOwner({ env, address });
	if (!next) return;
	const current = getActiveAgentOwner();
	if (current && current.env === next.env && current.address === next.address) return;
	writeOwner(next);
}

export function clearActiveAgentOwner(): void {
	if (!getActiveAgentOwner()) return;
	writeOwner(null);
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
