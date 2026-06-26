import { useSyncExternalStore } from "react";
import type { Address } from "viem";
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
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

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
	if (typeof address !== "string" || !ADDRESS_RE.test(address)) return null;
	return { env, address: address.toLowerCase() as Address };
}

// Memory is the source of truth; localStorage is a persistence mirror so the session survives a
// reload. Reading from storage is guarded for SSR/node (returns null), so the module is safe to
// evaluate on the server.
let activeOwner: AgentOwner | null = readPersisted();
const listeners = new Set<() => void>();

function readPersisted(): AgentOwner | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		return raw ? normalizeOwner(JSON.parse(raw)) : null;
	} catch {
		return null;
	}
}

function persist(owner: AgentOwner | null): void {
	if (typeof window === "undefined") return;
	try {
		if (owner) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(owner));
		else window.localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Storage may be unavailable (private mode, quota); in-memory state still works.
	}
}

function emit(): void {
	for (const listener of listeners) listener();
}

export function getActiveAgentOwner(): AgentOwner | null {
	return activeOwner;
}

export function setActiveAgentOwner(env: HyperliquidEnv, address: Address): void {
	const next = normalizeOwner({ env, address });
	if (!next) return;
	if (activeOwner && activeOwner.env === next.env && activeOwner.address === next.address) return;
	activeOwner = next;
	persist(next);
	emit();
}

export function clearActiveAgentOwner(): void {
	if (!activeOwner) return;
	activeOwner = null;
	persist(null);
	emit();
}

function subscribe(callback: () => void): () => void {
	listeners.add(callback);
	return () => {
		listeners.delete(callback);
	};
}

export function useActiveAgentOwner(): AgentOwner | null {
	return useSyncExternalStore(subscribe, getActiveAgentOwner, () => null);
}
