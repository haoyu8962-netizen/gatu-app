import { useSyncExternalStore } from "react";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { LRU } from "../lru";
import { createMobileAgentName, MOBILE_AGENT_NAME_BASE } from "./mobile-agent";
import type { AgentWallet, HyperliquidEnv } from "./types";

const privateKeySchema = z
	.string()
	.regex(/^0x[0-9a-fA-F]{64}$/)
	.transform((v) => v.toLowerCase() as Hex);

const publicKeySchema = z
	.string()
	.regex(/^0x[0-9a-fA-F]{40}$/)
	.transform((v) => v.toLowerCase() as Address);

const agentKeySchema = z.object({
	privateKey: privateKeySchema,
	publicKey: publicKeySchema,
});

const nonMobileMetadataSchema = {
	agentNameBase: z.never().optional(),
	agentName: z.never().optional(),
	agentValidUntilMs: z.never().optional(),
	importedAtMs: z.never().optional(),
	syncId: z.never().optional(),
};

const sourcedAgentWalletSchema = z.discriminatedUnion("source", [
	agentKeySchema
		.extend({
			source: z.literal("local-registration"),
			...nonMobileMetadataSchema,
		})
		.strict(),
	agentKeySchema
		.extend({
			source: z.literal("mobile-sync"),
			agentNameBase: z.literal(MOBILE_AGENT_NAME_BASE),
			agentName: z.string().min(1),
			agentValidUntilMs: z.number().int().positive().safe(),
			importedAtMs: z.number().int().positive().safe(),
			syncId: z.string().min(1),
		})
		.strict(),
]);

const legacyLocalAgentWalletSchema = agentKeySchema
	.extend({
		source: z.undefined().optional(),
		...nonMobileMetadataSchema,
	})
	.strict();

const agentWalletSchema = z
	.union([sourcedAgentWalletSchema, legacyLocalAgentWalletSchema])
	.superRefine((agent, ctx) => {
		if (agent.source !== "mobile-sync") return;

		if (
			agent.agentName !== createMobileAgentName(agent.agentValidUntilMs) ||
			agent.importedAtMs >= agent.agentValidUntilMs ||
			agent.syncId.trim() !== agent.syncId
		) {
			ctx.addIssue({ code: "custom", message: "Invalid canonical mobile Agent metadata" });
		}

		try {
			if (privateKeyToAccount(agent.privateKey).address.toLowerCase() !== agent.publicKey.toLowerCase()) {
				ctx.addIssue({ code: "custom", message: "Mobile Agent key pair mismatch" });
			}
		} catch {
			ctx.addIssue({ code: "custom", message: "Invalid mobile Agent private key" });
		}
	});

function parseAgentWallet(value: unknown): AgentWallet | null {
	const canonical = agentWalletSchema.safeParse(value);
	return canonical.success ? canonical.data : null;
}

export type AgentWalletMetadata = Omit<AgentWallet, "privateKey" | "publicKey">;

export type AgentStorageWriteResult =
	| { status: "stored"; agent: AgentWallet }
	| {
			status: "failed";
			reason: "storage_unavailable" | "invalid_agent" | "write_failed" | "readback_mismatch";
	  };

export type AgentStorageRemovalResult =
	| { status: "removed" }
	| {
			status: "failed";
			reason: "storage_unavailable" | "remove_failed" | "readback_failed" | "readback_mismatch" | "notification_failed";
	  };

function getStorageKey(env: HyperliquidEnv, userAddress: string): string {
	return `hyperliquid_agent_${env}_${userAddress.toLowerCase()}`;
}

export function readAgentFromStorage(env: HyperliquidEnv, userAddress: string): AgentWallet | null {
	if (typeof window === "undefined") return null;

	try {
		const key = getStorageKey(env, userAddress);
		const raw = localStorage.getItem(key);
		if (!raw) return null;

		const parsed = JSON.parse(raw);
		return parseAgentWallet(parsed);
	} catch {
		return null;
	}
}

export function hasInvalidAgentStorageRecord(env: HyperliquidEnv, userAddress: string): boolean {
	if (typeof window === "undefined") return false;

	try {
		const raw = localStorage.getItem(getStorageKey(env, userAddress));
		if (!raw) return false;
		return !agentWalletSchema.safeParse(JSON.parse(raw)).success;
	} catch {
		try {
			return localStorage.getItem(getStorageKey(env, userAddress)) !== null;
		} catch {
			return false;
		}
	}
}

export function writeAgentToStorage(
	env: HyperliquidEnv,
	userAddress: string,
	privateKey: string,
	publicKey: string,
	metadata: AgentWalletMetadata = {},
): void {
	if (typeof window === "undefined") return;

	try {
		const key = getStorageKey(env, userAddress);
		const data: AgentWallet = {
			privateKey: privateKeySchema.parse(privateKey),
			publicKey: publicKeySchema.parse(publicKey),
			...metadata,
		};
		localStorage.setItem(key, JSON.stringify(agentWalletSchema.parse(data)));
		invalidateSnapshotKey(key);
		window.dispatchEvent(new StorageEvent("storage", { key }));
	} catch {
		// Silent fail for storage errors
	}
}

/**
 * Persists an Agent and proves that the exact normalized record can be read
 * back before callers activate the corresponding session.
 */
export function writeAgentToStorageAndVerify(
	env: HyperliquidEnv,
	userAddress: string,
	privateKey: string,
	publicKey: string,
	metadata: AgentWalletMetadata = {},
): AgentStorageWriteResult {
	if (typeof window === "undefined") {
		return { status: "failed", reason: "storage_unavailable" };
	}

	let expected: AgentWallet;
	try {
		expected = agentWalletSchema.parse({
			privateKey: privateKeySchema.parse(privateKey),
			publicKey: publicKeySchema.parse(publicKey),
			...metadata,
		});
		if (privateKeyToAccount(expected.privateKey).address.toLowerCase() !== expected.publicKey.toLowerCase()) {
			return { status: "failed", reason: "invalid_agent" };
		}
	} catch {
		return { status: "failed", reason: "invalid_agent" };
	}

	const key = getStorageKey(env, userAddress);
	try {
		localStorage.setItem(key, JSON.stringify(expected));
	} catch {
		return { status: "failed", reason: "write_failed" };
	}

	try {
		const raw = localStorage.getItem(key);
		const actual = raw ? parseAgentWallet(JSON.parse(raw)) : null;
		if (!actual || JSON.stringify(actual) !== JSON.stringify(expected)) {
			localStorage.removeItem(key);
			invalidateSnapshotKey(key);
			window.dispatchEvent(new StorageEvent("storage", { key }));
			return { status: "failed", reason: "readback_mismatch" };
		}
		invalidateSnapshotKey(key);
		window.dispatchEvent(new StorageEvent("storage", { key }));
		return { status: "stored", agent: actual };
	} catch {
		try {
			localStorage.removeItem(key);
		} catch {
			// The original readback failure remains the actionable result.
		}
		invalidateSnapshotKey(key);
		try {
			window.dispatchEvent(new StorageEvent("storage", { key }));
		} catch {
			// Cache invalidation above is sufficient if event construction fails.
		}
		return { status: "failed", reason: "readback_mismatch" };
	}
}

export function removeAgentFromStorage(env: HyperliquidEnv, userAddress: string): void {
	if (typeof window === "undefined") return;

	const key = getStorageKey(env, userAddress);
	try {
		localStorage.removeItem(key);
	} catch {
		try {
			localStorage.setItem(key, "null");
		} catch {
			// Security-sensitive callers use the verified removal API below.
		}
	}
	invalidateSnapshotKey(key);
	try {
		window.dispatchEvent(new StorageEvent("storage", { key }));
	} catch {
		// Direct cache invalidation above keeps same-tab snapshots fresh.
	}
}

export function removeAgentFromStorageAndVerify(env: HyperliquidEnv, userAddress: string): AgentStorageRemovalResult {
	const key = getStorageKey(env, userAddress);
	invalidateSnapshotKey(key);
	if (typeof window === "undefined") {
		return { status: "failed", reason: "storage_unavailable" };
	}

	let storage: Storage;
	try {
		storage = window.localStorage;
		if (!storage) {
			return { status: "failed", reason: "storage_unavailable" };
		}
	} catch {
		return { status: "failed", reason: "storage_unavailable" };
	}

	try {
		storage.removeItem(key);
	} catch {
		try {
			storage.setItem(key, "null");
		} catch {
			// The failed result remains retryable by the caller.
		}
		invalidateSnapshotKey(key);
		try {
			window.dispatchEvent(new StorageEvent("storage", { key }));
		} catch {
			// The failed result still reports that local cleanup is incomplete.
		}
		return { status: "failed", reason: "remove_failed" };
	}

	let remaining: string | null;
	try {
		remaining = storage.getItem(key);
	} catch {
		try {
			storage.setItem(key, "null");
		} catch {
			// The failed result remains retryable by the caller.
		}
		invalidateSnapshotKey(key);
		try {
			window.dispatchEvent(new StorageEvent("storage", { key }));
		} catch {
			// The failed result still reports that local cleanup is incomplete.
		}
		return { status: "failed", reason: "readback_failed" };
	}
	if (remaining !== null) {
		try {
			storage.setItem(key, "null");
		} catch {
			// The failed result remains retryable by the caller.
		}
		invalidateSnapshotKey(key);
		try {
			window.dispatchEvent(new StorageEvent("storage", { key }));
		} catch {
			// The failed result still reports that local cleanup is incomplete.
		}
		return { status: "failed", reason: "readback_mismatch" };
	}

	try {
		window.dispatchEvent(new StorageEvent("storage", { key }));
	} catch {
		invalidateSnapshotKey(key);
		return { status: "failed", reason: "notification_failed" };
	}

	return { status: "removed" };
}

// Bounded cache: entries are (env, address) pairs, keyed so useSyncExternalStore
// returns a stable reference across renders. Cap matches the signer/trading
// caches in clients.ts — a user switching between more wallets simply evicts
// older entries.
//
// Security note: entries contain the agent's private key material in memory.
// That's acceptable for session-length use (the keys also live in localStorage
// for persistence) but callers in high-security contexts should consider a
// shorter-lived store and a forced eviction on address change.
/** @internal — exported only for tests; do not consume from outside this package. */
export const snapshotCache = new LRU<string, { value: AgentWallet | null; version: number }>(4);
let cacheVersion = 0;

const STORAGE_KEY_PREFIX = "hyperliquid_agent_";

// Single canonical derivation for the (env, address) cache key. Addresses from
// wagmi arrive EIP-55 checksum-cased; the storage key is always lowercase, so
// normalizing here keeps the set/read path and the StorageEvent invalidation
// path in lock-step.
function getCacheKey(env: HyperliquidEnv, userAddress: string): string {
	return `${env}:${userAddress.toLowerCase()}`;
}

function invalidateSnapshotCache() {
	cacheVersion++;
}

function invalidateSnapshotKey(storageKey: string | null) {
	// storageKey is null when localStorage.clear() fires the event; fall back
	// to a global bump in that case.
	if (storageKey === null || !storageKey.startsWith(STORAGE_KEY_PREFIX)) {
		invalidateSnapshotCache();
		return;
	}
	const rest = storageKey.slice(STORAGE_KEY_PREFIX.length);
	const underscore = rest.indexOf("_");
	if (underscore === -1) {
		invalidateSnapshotCache();
		return;
	}
	const env = rest.slice(0, underscore);
	const address = rest.slice(underscore + 1);
	snapshotCache.delete(getCacheKey(env as HyperliquidEnv, address));
}

/** @internal — exported only for tests; do not consume from outside this package. */
export function getCachedAgentSnapshot(env: HyperliquidEnv, userAddress: string): AgentWallet | null {
	const key = getCacheKey(env, userAddress);
	const entry = snapshotCache.get(key);
	if (entry && entry.version === cacheVersion) return entry.value;
	const value = readAgentFromStorage(env, userAddress);
	snapshotCache.set(key, { value, version: cacheVersion });
	return value;
}

/** @internal — exported only for tests; do not consume from outside this package. */
export function subscribeToStorage(callback: () => void): () => void {
	if (typeof window === "undefined") return () => {};
	function handleStorage(event: StorageEvent) {
		// Cross-tab StorageEvents carry the affected key; same-tab synthetic
		// events from writeAgentToStorage/removeAgentFromStorage carry it too.
		// Only invalidate the matching cache entry so other (env, address)
		// pairs keep their cached reads.
		invalidateSnapshotKey(event.key);
		callback();
	}
	window.addEventListener("storage", handleStorage);
	return () => window.removeEventListener("storage", handleStorage);
}

export function useAgentWalletStorage(env: HyperliquidEnv, userAddress: string | undefined): AgentWallet | null {
	return useSyncExternalStore(
		subscribeToStorage,
		() => {
			if (!userAddress) return null;
			return getCachedAgentSnapshot(env, userAddress);
		},
		() => null,
	);
}

export function useInvalidAgentStorageRecord(env: HyperliquidEnv, userAddress: string | undefined): boolean {
	return useSyncExternalStore(
		subscribeToStorage,
		() => (userAddress ? hasInvalidAgentStorageRecord(env, userAddress) : false),
		() => false,
	);
}

export function useAgentWalletActions() {
	function setAgent(
		env: HyperliquidEnv,
		userAddress: string,
		privateKey: string,
		publicKey: string,
		metadata?: AgentWalletMetadata,
	) {
		writeAgentToStorage(env, userAddress, privateKey, publicKey, metadata);
	}

	function clearAgent(env: HyperliquidEnv, userAddress: string) {
		removeAgentFromStorage(env, userAddress);
	}

	function clearAgentVerified(env: HyperliquidEnv, userAddress: string) {
		return removeAgentFromStorageAndVerify(env, userAddress);
	}

	return { setAgent, clearAgent, clearAgentVerified };
}
