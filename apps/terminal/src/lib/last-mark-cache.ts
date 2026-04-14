const KEY = "hl-last-mark-v1";
const TTL = 60 * 60 * 1000;

export interface LastMarkEntry {
	markPx: string;
	oraclePx?: string;
	savedAt: number;
}

type Store = Record<string, LastMarkEntry>;

function loadStore(): Store {
	if (typeof window === "undefined") return {};
	try {
		return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
	} catch {
		return {};
	}
}

export function loadLastMark(coin: string): LastMarkEntry | null {
	const entry = loadStore()[coin];
	if (!entry) return null;
	if (Date.now() - entry.savedAt > TTL) return null;
	return entry;
}

export function saveLastMark(coin: string, markPx: string, oraclePx?: string) {
	if (typeof window === "undefined") return;
	try {
		const store = loadStore();
		store[coin] = { markPx, oraclePx, savedAt: Date.now() };
		localStorage.setItem(KEY, JSON.stringify(store));
	} catch {}
}
