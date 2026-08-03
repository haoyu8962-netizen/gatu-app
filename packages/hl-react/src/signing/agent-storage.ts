import { useSyncExternalStore } from "react";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { evictAllAgentTradingClients, evictTradingClient } from "../clients";
import {
	invalidateAllExchangeRequestIdentities,
	invalidateExchangeRequestIdentity,
} from "../internal/exchange/request-scheduler";
import { LRU } from "../lru";
import { evictAgentSigner, evictAllAgentSigners } from "./agent-signer-cache";
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
		try {
			if (privateKeyToAccount(agent.privateKey).address.toLowerCase() !== agent.publicKey.toLowerCase()) {
				ctx.addIssue({ code: "custom", message: "Agent key pair mismatch" });
			}
		} catch {
			ctx.addIssue({ code: "custom", message: "Invalid Agent private key" });
		}

		if (
			agent.source === "mobile-sync" &&
			(agent.agentName !== createMobileAgentName(agent.agentValidUntilMs) ||
				agent.importedAtMs >= agent.agentValidUntilMs ||
				agent.syncId.trim() !== agent.syncId)
		) {
			ctx.addIssue({ code: "custom", message: "Invalid canonical mobile Agent metadata" });
		}
	});

function parseAgentWallet(value: unknown): AgentWallet | null {
	const canonical = agentWalletSchema.safeParse(value);
	return canonical.success ? canonical.data : null;
}

export type AgentWalletMetadata = Omit<AgentWallet, "privateKey" | "publicKey">;

export type AgentStorageScope = "local" | "session";

export interface AgentStorageWriteOptions {
	scope?: AgentStorageScope;
}

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

function getLocalAgentStorage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage ?? (typeof localStorage === "undefined" ? null : localStorage);
	} catch {
		return null;
	}
}

function getSessionAgentStorage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.sessionStorage ?? null;
	} catch {
		return null;
	}
}

function getAgentStorage(scope: AgentStorageScope): Storage | null {
	if (typeof window === "undefined") return null;
	return scope === "session" ? getSessionAgentStorage() : getLocalAgentStorage();
}

function getAvailableAgentStorages(): Storage[] {
	const local = getLocalAgentStorage();
	const session = getSessionAgentStorage();
	if (!local) return session ? [session] : [];
	return session && session !== local ? [session, local] : [local];
}

interface StoredAgentRecords {
	localRaw: string | null;
	sessionRaw: string | null;
}

function readStoredAgentRecords(env: HyperliquidEnv, userAddress: string): StoredAgentRecords | null {
	if (typeof window === "undefined") return null;
	const key = getStorageKey(env, userAddress);
	try {
		const local = getLocalAgentStorage();
		if (!local) return null;
		return {
			localRaw: local.getItem(key),
			sessionRaw: getSessionAgentStorage()?.getItem(key) ?? null,
		};
	} catch {
		return null;
	}
}

function getPreferredStoredAgentRaw(records: StoredAgentRecords): string | null {
	return records.sessionRaw ?? records.localRaw;
}

const REGISTRATION_SESSION_STORAGE_PREFIX = "hyperliquid_agent_registration_session";

function getRegistrationSessionStorageKey(env: HyperliquidEnv, userAddress: string): string {
	return `${REGISTRATION_SESSION_STORAGE_PREFIX}_${env}_${userAddress.toLowerCase()}`;
}

function isAgentRegistrationSessionUsable(raw: string | null): boolean {
	// Existing installations without a session record remain compatible. Once
	// a record exists, malformed and closing/closed records fail closed.
	if (raw === null) return true;
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return (
			parsed.version === 1 && parsed.state === "active" && typeof parsed.epoch === "string" && parsed.epoch.length >= 16
		);
	} catch {
		return false;
	}
}

function readStoredAgentRecord(env: HyperliquidEnv, userAddress: string): AgentWallet | null {
	try {
		const records = readStoredAgentRecords(env, userAddress);
		const raw = records ? getPreferredStoredAgentRaw(records) : null;
		return raw ? parseAgentWallet(JSON.parse(raw)) : null;
	} catch {
		return null;
	}
}

/** @internal — used by the registration lock to revalidate cleanup targets. */
export type AgentStorageRecordInspection =
	| { status: "absent" }
	| { status: "valid"; agent: AgentWallet }
	| { status: "invalid" }
	| { status: "failed"; reason: "storage_unavailable" };

/** @internal — bypasses the session gate but never exposes an unvalidated record. */
export function inspectAgentStorageRecord(env: HyperliquidEnv, userAddress: string): AgentStorageRecordInspection {
	if (typeof window === "undefined") return { status: "failed", reason: "storage_unavailable" };

	const records = readStoredAgentRecords(env, userAddress);
	if (!records) return { status: "failed", reason: "storage_unavailable" };
	const raw = getPreferredStoredAgentRaw(records);
	if (raw === null) return { status: "absent" };

	try {
		const agent = parseAgentWallet(JSON.parse(raw));
		return agent ? { status: "valid", agent } : { status: "invalid" };
	} catch {
		return { status: "invalid" };
	}
}

// A verified cleanup attempt quarantines the exact slot immediately. If
// browser storage refuses both removal and tombstoning, this process must not
// recreate a signer from the stale value. Only a later verified write can
// reopen the slot.
const blockedAgentStorageKeys = new Set<string>();

function evictAgentWallet(env: HyperliquidEnv, agent: AgentWallet | null): void {
	if (!agent) return;
	evictAgentSigner(agent.privateKey);
	evictTradingClient(agent.publicKey, env === "Testnet");
}

export function readAgentFromStorage(env: HyperliquidEnv, userAddress: string): AgentWallet | null {
	if (typeof window === "undefined") return null;

	try {
		const key = getStorageKey(env, userAddress);
		if (blockedAgentStorageKeys.has(key)) return null;
		const sessionRaw = localStorage.getItem(getRegistrationSessionStorageKey(env, userAddress));
		if (!isAgentRegistrationSessionUsable(sessionRaw)) return null;
		return readStoredAgentRecord(env, userAddress);
	} catch {
		return null;
	}
}

export function hasInvalidAgentStorageRecord(env: HyperliquidEnv, userAddress: string): boolean {
	if (typeof window === "undefined") return false;

	try {
		const key = getStorageKey(env, userAddress);
		if (blockedAgentStorageKeys.has(key)) return false;
		const sessionRaw = localStorage.getItem(getRegistrationSessionStorageKey(env, userAddress));
		if (!isAgentRegistrationSessionUsable(sessionRaw)) return false;
		const records = readStoredAgentRecords(env, userAddress);
		const raw = records ? getPreferredStoredAgentRaw(records) : null;
		if (!raw) return false;
		return !agentWalletSchema.safeParse(JSON.parse(raw)).success;
	} catch {
		const records = readStoredAgentRecords(env, userAddress);
		return records ? getPreferredStoredAgentRaw(records) !== null : false;
	}
}

export function writeAgentToStorage(
	env: HyperliquidEnv,
	userAddress: string,
	privateKey: string,
	publicKey: string,
	metadata: AgentWalletMetadata = {},
	options: AgentStorageWriteOptions = {},
): void {
	if (typeof window === "undefined") return;

	const previous = readStoredAgentRecord(env, userAddress);
	try {
		const key = getStorageKey(env, userAddress);
		const scope = options.scope ?? "local";
		const storage = getAgentStorage(scope);
		if (!storage) return;
		const data: AgentWallet = {
			privateKey: privateKeySchema.parse(privateKey),
			publicKey: publicKeySchema.parse(publicKey),
			...metadata,
		};
		storage.setItem(key, JSON.stringify(agentWalletSchema.parse(data)));
		getAgentStorage(scope === "local" ? "session" : "local")?.removeItem(key);
		if (previous?.privateKey !== data.privateKey) {
			invalidateExchangeRequestIdentity(env, userAddress);
			evictAgentWallet(env, previous);
		}
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
	options: AgentStorageWriteOptions = {},
): AgentStorageWriteResult {
	if (typeof window === "undefined") {
		return { status: "failed", reason: "storage_unavailable" };
	}

	const previous = readStoredAgentRecord(env, userAddress);
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
	const scope = options.scope ?? "local";
	const storage = getAgentStorage(scope);
	if (!storage) return { status: "failed", reason: "storage_unavailable" };
	const alternateStorage = getAgentStorage(scope === "local" ? "session" : "local");
	try {
		storage.setItem(key, JSON.stringify(expected));
	} catch {
		return { status: "failed", reason: "write_failed" };
	}

	try {
		const raw = storage.getItem(key);
		const actual = raw ? parseAgentWallet(JSON.parse(raw)) : null;
		if (!actual || JSON.stringify(actual) !== JSON.stringify(expected)) {
			storage.removeItem(key);
			invalidateExchangeRequestIdentity(env, userAddress);
			invalidateSnapshotKey(key);
			window.dispatchEvent(new StorageEvent("storage", { key }));
			return { status: "failed", reason: "readback_mismatch" };
		}
		if (alternateStorage) {
			alternateStorage.removeItem(key);
			if (alternateStorage.getItem(key) !== null) {
				storage.removeItem(key);
				invalidateExchangeRequestIdentity(env, userAddress);
				invalidateSnapshotKey(key);
				window.dispatchEvent(new StorageEvent("storage", { key }));
				return { status: "failed", reason: "readback_mismatch" };
			}
		}
		invalidateSnapshotKey(key);
		if (previous?.privateKey !== actual.privateKey) {
			invalidateExchangeRequestIdentity(env, userAddress);
			evictAgentWallet(env, previous);
		}
		blockedAgentStorageKeys.delete(key);
		window.dispatchEvent(new StorageEvent("storage", { key }));
		return { status: "stored", agent: actual };
	} catch {
		try {
			storage.removeItem(key);
		} catch {
			// The original readback failure remains the actionable result.
		}
		invalidateExchangeRequestIdentity(env, userAddress);
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
	invalidateExchangeRequestIdentity(env, userAddress);
	if (typeof window === "undefined") return;

	const previous = readStoredAgentRecord(env, userAddress);
	const key = getStorageKey(env, userAddress);
	blockedAgentStorageKeys.add(key);
	for (const storage of getAvailableAgentStorages()) {
		try {
			storage.removeItem(key);
		} catch {
			try {
				storage.setItem(key, "null");
			} catch {
				// Security-sensitive callers use the verified removal API below.
			}
		}
	}
	invalidateSnapshotKey(key);
	evictAgentWallet(env, previous);
	try {
		window.dispatchEvent(new StorageEvent("storage", { key }));
	} catch {
		// Direct cache invalidation above keeps same-tab snapshots fresh.
	}
}

export function removeAgentFromStorageAndVerify(env: HyperliquidEnv, userAddress: string): AgentStorageRemovalResult {
	invalidateExchangeRequestIdentity(env, userAddress);
	// Registration teardown writes a closing session tombstone before removing
	// the key. Read the stored record directly so that tombstone cannot hide the
	// signer and trading-client identities that must be evicted.
	const previous = readStoredAgentRecord(env, userAddress);
	evictAgentWallet(env, previous);
	const key = getStorageKey(env, userAddress);
	blockedAgentStorageKeys.add(key);
	invalidateSnapshotKey(key);
	if (typeof window === "undefined") {
		return { status: "failed", reason: "storage_unavailable" };
	}

	const storages = getAvailableAgentStorages();
	if (storages.length === 0) {
		return { status: "failed", reason: "storage_unavailable" };
	}

	for (const storage of storages) {
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
	}

	for (const storage of storages) {
		try {
			if (storage.getItem(key) === null) continue;
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
// The backing key may be session-scoped or persistent; both variants are
// evicted on lifecycle shutdown and bounded here to the same small cache.
/** @internal — exported only for tests; do not consume from outside this package. */
export const snapshotCache = new LRU<
	string,
	{
		raw: string | null;
		localRaw: string | null;
		agentSessionRaw: string | null;
		registrationRaw: string | null;
		value: AgentWallet | null;
		version: number;
	}
>(4);
let cacheVersion = 0;

const STORAGE_KEY_PREFIX = "hyperliquid_agent_";
const storageSubscribers = new Set<() => void>();
let storageListenerTarget: Window | null = null;

// Single canonical derivation for the (env, address) cache key. Addresses from
// wagmi arrive EIP-55 checksum-cased; the storage key is always lowercase, so
// normalizing here keeps the set/read path and the StorageEvent invalidation
// path in lock-step.
function getCacheKey(env: HyperliquidEnv, userAddress: string): string {
	return `${env}:${userAddress.toLowerCase()}`;
}

function getStorageScope(storageKey: string): { env: HyperliquidEnv; address: string } | null {
	if (!storageKey.startsWith(STORAGE_KEY_PREFIX)) return null;
	const rest = storageKey.slice(STORAGE_KEY_PREFIX.length);
	const separator = rest.indexOf("_");
	if (separator === -1) return null;
	const env = rest.slice(0, separator);
	if (env !== "Mainnet" && env !== "Testnet") return null;
	const address = rest.slice(separator + 1);
	if (!address) return null;
	return { env, address };
}

function getRegistrationSessionScope(storageKey: string): { env: HyperliquidEnv; address: string } | null {
	const prefix = `${REGISTRATION_SESSION_STORAGE_PREFIX}_`;
	if (!storageKey.startsWith(prefix)) return null;
	const rest = storageKey.slice(prefix.length);
	const separator = rest.indexOf("_");
	if (separator === -1) return null;
	const env = rest.slice(0, separator);
	if (env !== "Mainnet" && env !== "Testnet") return null;
	const address = rest.slice(separator + 1);
	if (!address) return null;
	return { env, address };
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
	const scope = getStorageScope(storageKey);
	if (!scope) {
		invalidateSnapshotCache();
		return;
	}
	snapshotCache.delete(getCacheKey(scope.env, scope.address));
}

function evictAllCachedAgentWallets(): void {
	for (const key of Array.from(snapshotCache.keys())) {
		const entry = snapshotCache.get(key);
		if (entry?.value) {
			const separator = key.indexOf(":");
			const env = key.slice(0, separator);
			if (env === "Mainnet" || env === "Testnet") evictAgentWallet(env, entry.value);
		}
		snapshotCache.delete(key);
	}
	evictAllAgentSigners();
	evictAllAgentTradingClients();
}

function handleStorageEvent(event: StorageEvent): void {
	if (event.key === null) {
		invalidateAllExchangeRequestIdentities();
		evictAllCachedAgentWallets();
		invalidateSnapshotCache();
	} else {
		const scope = getStorageScope(event.key);
		if (scope) {
			invalidateExchangeRequestIdentity(scope.env, scope.address);
			let previous = event.oldValue;
			if (!previous) {
				previous = snapshotCache.get(getCacheKey(scope.env, scope.address))?.raw ?? null;
			}
			if (previous) {
				try {
					evictAgentWallet(scope.env, parseAgentWallet(JSON.parse(previous)));
				} catch {
					// Malformed prior data cannot identify a signer to evict.
				}
			}
		}
		const registrationScope = getRegistrationSessionScope(event.key);
		if (registrationScope) {
			let sessionRaw = typeof event.newValue === "string" ? event.newValue : null;
			if (sessionRaw === null) {
				try {
					sessionRaw = window.localStorage.getItem(event.key);
				} catch {
					sessionRaw = "invalid";
				}
			}
			if (!isAgentRegistrationSessionUsable(sessionRaw)) {
				invalidateExchangeRequestIdentity(registrationScope.env, registrationScope.address);
			}
		}
		invalidateSnapshotKey(event.key);
	}
	for (const callback of storageSubscribers) callback();
}

function ensureStorageListener(): void {
	if (typeof window === "undefined" || storageListenerTarget === window) return;
	if (storageListenerTarget) storageListenerTarget.removeEventListener("storage", handleStorageEvent);
	window.addEventListener("storage", handleStorageEvent);
	storageListenerTarget = window;
}

/** @internal — exported only for tests; do not consume from outside this package. */
export function getCachedAgentSnapshot(env: HyperliquidEnv, userAddress: string): AgentWallet | null {
	ensureStorageListener();
	const key = getCacheKey(env, userAddress);
	const entry = snapshotCache.get(key);
	const storageKey = getStorageKey(env, userAddress);
	const registrationStorageKey = getRegistrationSessionStorageKey(env, userAddress);
	if (blockedAgentStorageKeys.has(storageKey)) {
		if (entry?.value) evictAgentWallet(env, entry.value);
		snapshotCache.delete(key);
		return null;
	}
	let records: StoredAgentRecords | null;
	let registrationRaw: string | null;
	try {
		records = readStoredAgentRecords(env, userAddress);
		const local = getLocalAgentStorage();
		if (!records || !local) throw new Error("Agent storage unavailable");
		registrationRaw = local.getItem(registrationStorageKey);
	} catch {
		if (entry?.value) evictAgentWallet(env, entry.value);
		snapshotCache.delete(key);
		return null;
	}
	const raw = getPreferredStoredAgentRaw(records);
	if (!isAgentRegistrationSessionUsable(registrationRaw)) {
		const storedAgent = raw
			? (() => {
					try {
						return parseAgentWallet(JSON.parse(raw));
					} catch {
						return null;
					}
				})()
			: null;
		evictAgentWallet(env, entry?.value ?? storedAgent);
		snapshotCache.set(key, {
			raw,
			localRaw: records.localRaw,
			agentSessionRaw: records.sessionRaw,
			registrationRaw,
			value: null,
			version: cacheVersion,
		});
		return null;
	}
	if (
		entry?.localRaw === records.localRaw &&
		entry.agentSessionRaw === records.sessionRaw &&
		entry.registrationRaw === registrationRaw
	) {
		if (entry.version !== cacheVersion) snapshotCache.set(key, { ...entry, version: cacheVersion });
		return entry.value;
	}
	if (entry?.value) evictAgentWallet(env, entry.value);
	let value: AgentWallet | null = null;
	if (raw) {
		try {
			value = parseAgentWallet(JSON.parse(raw));
		} catch {
			value = null;
		}
	}
	snapshotCache.set(key, {
		raw,
		localRaw: records.localRaw,
		agentSessionRaw: records.sessionRaw,
		registrationRaw,
		value,
		version: cacheVersion,
	});
	return value;
}

/** @internal — exported only for tests; do not consume from outside this package. */
export function subscribeToStorage(callback: () => void): () => void {
	if (typeof window === "undefined") return () => {};
	ensureStorageListener();
	storageSubscribers.add(callback);
	return () => storageSubscribers.delete(callback);
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
