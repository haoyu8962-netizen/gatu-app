import { STORAGE_KEYS } from "@/config/app";
import { LAST_MARK_TTL_MS } from "@/config/time";

/**
 * Mainnet and testnet share this origin but not their markets (`@N` is a different pair on each),
 * so every entry is keyed by network and coin. The unkeyed v1 store cannot tell its network and is
 * removed rather than migrated; its entries expire within an hour anyway.
 */
type LastMarkNetwork = "Mainnet" | "Testnet";

export interface LastMarkEntry {
	markPx: string;
	oraclePx?: string;
	savedAt: number;
}

type Store = Record<string, LastMarkEntry>;

interface StoreSnapshot {
	storage: Storage;
	store: Store;
}

let cachedStorage: Storage | null = null;
let cachedStore: Store | null = null;
let listeningWindow: Window | null = null;

function handleStorageChange(event: StorageEvent) {
	if (event.key !== null && event.key !== STORAGE_KEYS.LAST_MARK) return;
	cachedStore = null;
}

function isLastMarkEntry(value: unknown): value is LastMarkEntry {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const entry = value as Partial<LastMarkEntry>;
	return (
		typeof entry.markPx === "string" &&
		(entry.oraclePx === undefined || typeof entry.oraclePx === "string") &&
		typeof entry.savedAt === "number" &&
		Number.isFinite(entry.savedAt)
	);
}

function isStore(value: unknown): value is Store {
	return (
		!!value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.values(value as Record<string, unknown>).every(isLastMarkEntry)
	);
}

function getStorage(): Storage | null {
	if (typeof window === "undefined") return null;

	try {
		const storage = window.localStorage;

		if (listeningWindow !== window) {
			listeningWindow?.removeEventListener("storage", handleStorageChange);
			window.addEventListener("storage", handleStorageChange);
			listeningWindow = window;
		}

		return storage;
	} catch {
		return null;
	}
}

function loadStore(): StoreSnapshot | null {
	const storage = getStorage();
	if (!storage) return null;

	if (cachedStorage !== storage) {
		cachedStorage = storage;
		cachedStore = null;
	}

	if (cachedStore) return { storage, store: cachedStore };

	try {
		storage.removeItem(STORAGE_KEYS.LEGACY_LAST_MARK);
	} catch {}

	try {
		const parsed = JSON.parse(storage.getItem(STORAGE_KEYS.LAST_MARK) ?? "{}") as unknown;
		if (!isStore(parsed)) return null;
		cachedStore = parsed;
		return { storage, store: cachedStore };
	} catch {
		return null;
	}
}

function getEntryKey(network: LastMarkNetwork, coin: string): string {
	return `${network}:${coin}`;
}

export function loadLastMark(network: LastMarkNetwork, coin: string): LastMarkEntry | null {
	const entry = loadStore()?.store[getEntryKey(network, coin)];
	if (!entry) return null;
	if (Date.now() - entry.savedAt > LAST_MARK_TTL_MS) return null;
	return entry;
}

export function saveLastMark(network: LastMarkNetwork, coin: string, markPx: string, oraclePx?: string) {
	const snapshot = loadStore();
	if (!snapshot) return;

	try {
		const key = getEntryKey(network, coin);
		const current = snapshot.store[key];
		const now = Date.now();
		if (current?.markPx === markPx && current.oraclePx === oraclePx && now - current.savedAt <= LAST_MARK_TTL_MS) {
			return;
		}

		const nextStore = {
			...snapshot.store,
			[key]: { markPx, oraclePx, savedAt: now },
		};
		snapshot.storage.setItem(STORAGE_KEYS.LAST_MARK, JSON.stringify(nextStore));
		cachedStore = nextStore;
	} catch {}
}
