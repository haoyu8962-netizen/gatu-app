import { STORAGE_KEYS } from "@/config/app";
import { LAST_MARK_TTL_MS } from "@/config/time";

export interface LastMarkEntry {
	markPx: string;
	oraclePx?: string;
	savedAt: number;
}

type Store = Record<string, LastMarkEntry>;

function loadStore(): Store {
	if (typeof window === "undefined") return {};
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEYS.LAST_MARK) ?? "{}") as Store;
	} catch {
		return {};
	}
}

export function loadLastMark(coin: string): LastMarkEntry | null {
	const entry = loadStore()[coin];
	if (!entry) return null;
	if (Date.now() - entry.savedAt > LAST_MARK_TTL_MS) return null;
	return entry;
}

export function saveLastMark(coin: string, markPx: string, oraclePx?: string) {
	if (typeof window === "undefined") return;
	try {
		const store = loadStore();
		store[coin] = { markPx, oraclePx, savedAt: Date.now() };
		localStorage.setItem(STORAGE_KEYS.LAST_MARK, JSON.stringify(store));
	} catch {}
}
