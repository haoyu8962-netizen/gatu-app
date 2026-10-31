import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/config/app";
import { LAST_MARK_TTL_MS } from "@/config/time";

interface StorageHarness {
	values: Map<string, string>;
	storage: Storage;
	window: Window;
}

function installStorage(initialValue?: string): StorageHarness {
	const values = new Map<string, string>();
	if (initialValue !== undefined) values.set(STORAGE_KEYS.LAST_MARK, initialValue);

	const events = new EventTarget();
	const storage = {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => values.set(key, value)),
		removeItem: vi.fn((key: string) => values.delete(key)),
		clear: vi.fn(() => values.clear()),
		key: vi.fn((index: number) => [...values.keys()][index] ?? null),
		get length() {
			return values.size;
		},
	} as Storage;
	const testWindow = {
		addEventListener: events.addEventListener.bind(events),
		removeEventListener: events.removeEventListener.bind(events),
		dispatchEvent: events.dispatchEvent.bind(events),
	} as unknown as Window;
	Object.defineProperty(testWindow, "localStorage", { configurable: true, value: storage });

	vi.stubGlobal("window", testWindow);
	vi.stubGlobal("localStorage", storage);
	return { values, storage, window: testWindow };
}

function storageEvent(key: string | null) {
	const event = new Event("storage");
	Object.defineProperty(event, "key", { value: key });
	return event;
}

describe("last mark cache", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("reads storage once and serves subsequent reads from memory", async () => {
		const now = 1_000_000;
		vi.spyOn(Date, "now").mockReturnValue(now);
		const harness = installStorage(JSON.stringify({ "Mainnet:BTC": { markPx: "100", oraclePx: "99", savedAt: now } }));
		const { loadLastMark } = await import("@/lib/last-mark-cache");

		expect(loadLastMark("Mainnet", "BTC")).toEqual({ markPx: "100", oraclePx: "99", savedAt: now });
		expect(loadLastMark("Mainnet", "BTC")).toEqual({ markPx: "100", oraclePx: "99", savedAt: now });
		expect(harness.storage.getItem).toHaveBeenCalledTimes(1);
	});

	it("does not read, stringify, or write again for an unchanged live mark", async () => {
		vi.spyOn(Date, "now").mockReturnValue(2_000_000);
		const harness = installStorage();
		const { saveLastMark } = await import("@/lib/last-mark-cache");
		const parseSpy = vi.spyOn(JSON, "parse");
		const stringifySpy = vi.spyOn(JSON, "stringify");

		saveLastMark("Mainnet", "BTC", "100", "99");
		saveLastMark("Mainnet", "BTC", "100", "99");
		saveLastMark("Mainnet", "BTC", "100", "99");

		expect(harness.storage.getItem).toHaveBeenCalledTimes(1);
		expect(harness.storage.setItem).toHaveBeenCalledTimes(1);
		expect(parseSpy).toHaveBeenCalledTimes(1);
		expect(stringifySpy).toHaveBeenCalledTimes(1);
		expect(JSON.parse(harness.values.get(STORAGE_KEYS.LAST_MARK) ?? "{}")).toEqual({
			"Mainnet:BTC": { markPx: "100", oraclePx: "99", savedAt: 2_000_000 },
		});
	});

	it("persists actual mark and oracle changes", async () => {
		vi.spyOn(Date, "now").mockReturnValue(3_000_000);
		const harness = installStorage();
		const { saveLastMark } = await import("@/lib/last-mark-cache");

		saveLastMark("Mainnet", "BTC", "100", "99");
		saveLastMark("Mainnet", "BTC", "101", "99");
		saveLastMark("Mainnet", "BTC", "101", "100");

		expect(harness.storage.getItem).toHaveBeenCalledTimes(1);
		expect(harness.storage.setItem).toHaveBeenCalledTimes(3);
	});

	it("refreshes an unchanged entry only after its TTL expires", async () => {
		let now = 4_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const harness = installStorage();
		const { loadLastMark, saveLastMark } = await import("@/lib/last-mark-cache");

		saveLastMark("Mainnet", "BTC", "100");
		now += LAST_MARK_TTL_MS;
		saveLastMark("Mainnet", "BTC", "100");
		expect(harness.storage.setItem).toHaveBeenCalledTimes(1);

		now += 1;
		expect(loadLastMark("Mainnet", "BTC")).toBeNull();
		saveLastMark("Mainnet", "BTC", "100");
		expect(harness.storage.setItem).toHaveBeenCalledTimes(2);
		expect(loadLastMark("Mainnet", "BTC")?.savedAt).toBe(now);
	});

	it("invalidates the memory snapshot after a cross-document storage event", async () => {
		const now = 5_000_000;
		vi.spyOn(Date, "now").mockReturnValue(now);
		const harness = installStorage(JSON.stringify({ "Mainnet:BTC": { markPx: "100", savedAt: now } }));
		const { loadLastMark } = await import("@/lib/last-mark-cache");

		expect(loadLastMark("Mainnet", "BTC")?.markPx).toBe("100");
		harness.values.set(STORAGE_KEYS.LAST_MARK, JSON.stringify({ "Mainnet:BTC": { markPx: "101", savedAt: now } }));
		harness.window.dispatchEvent(storageEvent(STORAGE_KEYS.LAST_MARK));

		expect(loadLastMark("Mainnet", "BTC")?.markPx).toBe("101");
		expect(harness.storage.getItem).toHaveBeenCalledTimes(2);
	});

	it("keeps mainnet and testnet marks apart, since one origin serves both networks", async () => {
		vi.spyOn(Date, "now").mockReturnValue(7_000_000);
		installStorage();
		const { loadLastMark, saveLastMark } = await import("@/lib/last-mark-cache");

		saveLastMark("Mainnet", "@107", "30");
		expect(loadLastMark("Testnet", "@107")).toBeNull();
		saveLastMark("Testnet", "@107", "0.5");
		expect(loadLastMark("Mainnet", "@107")?.markPx).toBe("30");
		expect(loadLastMark("Testnet", "@107")?.markPx).toBe("0.5");
	});

	it("removes the unkeyed v1 store instead of reading it", async () => {
		const now = 8_000_000;
		vi.spyOn(Date, "now").mockReturnValue(now);
		const harness = installStorage();
		harness.values.set(STORAGE_KEYS.LEGACY_LAST_MARK, JSON.stringify({ BTC: { markPx: "100", savedAt: now } }));
		const { loadLastMark } = await import("@/lib/last-mark-cache");

		expect(loadLastMark("Mainnet", "BTC")).toBeNull();
		expect(loadLastMark("Testnet", "BTC")).toBeNull();
		expect(harness.values.has(STORAGE_KEYS.LEGACY_LAST_MARK)).toBe(false);
	});

	it("does not retain the SSR fallback across hydration", async () => {
		vi.stubGlobal("window", undefined);
		vi.stubGlobal("localStorage", undefined);
		const { loadLastMark } = await import("@/lib/last-mark-cache");

		expect(loadLastMark("Mainnet", "BTC")).toBeNull();

		const now = 6_000_000;
		vi.spyOn(Date, "now").mockReturnValue(now);
		installStorage(JSON.stringify({ "Mainnet:BTC": { markPx: "100", savedAt: now } }));
		expect(loadLastMark("Mainnet", "BTC")?.markPx).toBe("100");
	});

	it("fails closed when storage cannot be read", async () => {
		const harness = installStorage();
		vi.mocked(harness.storage.getItem).mockImplementation(() => {
			throw new Error("storage unavailable");
		});
		const { loadLastMark, saveLastMark } = await import("@/lib/last-mark-cache");

		expect(loadLastMark("Mainnet", "BTC")).toBeNull();
		expect(() => saveLastMark("Mainnet", "BTC", "100")).not.toThrow();
		expect(harness.storage.setItem).not.toHaveBeenCalled();
	});

	it("fails closed when a persisted entry has an invalid shape", async () => {
		const harness = installStorage(JSON.stringify({ "Mainnet:BTC": { markPx: 100, savedAt: "now" } }));
		const { loadLastMark, saveLastMark } = await import("@/lib/last-mark-cache");

		expect(loadLastMark("Mainnet", "BTC")).toBeNull();
		expect(() => saveLastMark("Mainnet", "BTC", "100")).not.toThrow();
		expect(harness.storage.setItem).not.toHaveBeenCalled();
	});

	it("fails closed when the browser blocks localStorage access", async () => {
		const events = new EventTarget();
		const testWindow = {
			addEventListener: events.addEventListener.bind(events),
			removeEventListener: events.removeEventListener.bind(events),
		} as unknown as Window;
		Object.defineProperty(testWindow, "localStorage", {
			get: () => {
				throw new DOMException("storage unavailable", "SecurityError");
			},
		});
		vi.stubGlobal("window", testWindow);
		const { loadLastMark, saveLastMark } = await import("@/lib/last-mark-cache");

		expect(loadLastMark("Mainnet", "BTC")).toBeNull();
		expect(() => saveLastMark("Mainnet", "BTC", "100")).not.toThrow();
	});
});
