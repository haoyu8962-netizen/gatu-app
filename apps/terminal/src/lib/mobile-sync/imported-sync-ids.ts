import { type HyperliquidEnvName, MOBILE_SYNC_CLOCK_SKEW_MS } from "./sync-core";

export const MOBILE_SYNC_IMPORTED_STORAGE_KEY = "gatu.mobile-sync.imported.v1";
const MAX_IMPORTED_ENTRIES = 32;

interface ImportedSyncIdEntry {
	env: HyperliquidEnvName;
	userAddress: string;
	syncId: string;
	expiresAtMs: number;
}

export interface ImportedSyncIdInput {
	env: HyperliquidEnvName;
	userAddress: string;
	syncId: string;
}

interface ImportedSyncIdOptions {
	nowMs?: number;
	storage?: Storage | null;
}

export function hasImportedMobileSyncId(input: ImportedSyncIdInput, options: ImportedSyncIdOptions = {}): boolean {
	const storage = getImportedStorage(options.storage);
	if (!storage) return false;
	const nowMs = options.nowMs ?? Date.now();
	return readEntries(storage, nowMs).some((entry) => isSameImport(entry, input));
}

export function recordImportedMobileSyncId(
	input: ImportedSyncIdInput & { expiresAtMs: number },
	options: ImportedSyncIdOptions = {},
): boolean {
	const storage = getImportedStorage(options.storage);
	if (!storage) return false;
	const nowMs = options.nowMs ?? Date.now();
	const entries = readEntries(storage, nowMs).filter((entry) => !isSameImport(entry, input));
	entries.push({
		env: input.env,
		userAddress: input.userAddress.toLowerCase(),
		syncId: input.syncId,
		expiresAtMs: input.expiresAtMs,
	});

	try {
		const serialized = JSON.stringify(entries.slice(-MAX_IMPORTED_ENTRIES));
		storage.setItem(MOBILE_SYNC_IMPORTED_STORAGE_KEY, serialized);
		return storage.getItem(MOBILE_SYNC_IMPORTED_STORAGE_KEY) === serialized;
	} catch {
		return false;
	}
}

function readEntries(storage: Storage, nowMs: number): ImportedSyncIdEntry[] {
	let parsed: unknown;
	try {
		const storedValue = storage.getItem(MOBILE_SYNC_IMPORTED_STORAGE_KEY);
		if (!storedValue) return [];
		parsed = JSON.parse(storedValue);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	return parsed.filter(
		(entry): entry is ImportedSyncIdEntry =>
			isImportedEntry(entry) && nowMs <= entry.expiresAtMs + MOBILE_SYNC_CLOCK_SKEW_MS,
	);
}

function isImportedEntry(value: unknown): value is ImportedSyncIdEntry {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const entry = value as Record<string, unknown>;
	return (
		(entry.env === "Mainnet" || entry.env === "Testnet") &&
		typeof entry.userAddress === "string" &&
		typeof entry.syncId === "string" &&
		entry.syncId.length > 0 &&
		typeof entry.expiresAtMs === "number" &&
		Number.isSafeInteger(entry.expiresAtMs)
	);
}

function isSameImport(entry: ImportedSyncIdEntry, input: ImportedSyncIdInput): boolean {
	return (
		entry.env === input.env && entry.userAddress === input.userAddress.toLowerCase() && entry.syncId === input.syncId
	);
}

function getImportedStorage(storage: Storage | null | undefined): Storage | null {
	if (storage !== undefined) return storage;
	try {
		return typeof window === "undefined" ? null : window.localStorage;
	} catch {
		return null;
	}
}
