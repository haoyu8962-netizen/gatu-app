import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function installDom() {
	const store = new Map<string, string>();
	const target = new EventTarget();
	const storage = {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
		removeItem: (key: string) => {
			store.delete(key);
		},
		clear: () => store.clear(),
	};
	const win = {
		addEventListener: target.addEventListener.bind(target),
		removeEventListener: target.removeEventListener.bind(target),
		dispatchEvent: target.dispatchEvent.bind(target),
	};
	vi.stubGlobal("window", win);
	vi.stubGlobal("localStorage", storage);
	vi.stubGlobal(
		"StorageEvent",
		class StorageEventShim extends Event {
			key: string | null;
			constructor(type: string, init: { key?: string | null } = {}) {
				super(type);
				this.key = init.key ?? null;
			}
		},
	);
	return store;
}

describe("agent snapshot cache", () => {
	const VALID_PRIVATE_KEY = `0x${"ab".repeat(32)}` as const;
	const VALID_PUBLIC_KEY = `0x${"cd".repeat(20)}` as const;
	const STORAGE_VALUE = JSON.stringify({ privateKey: VALID_PRIVATE_KEY, publicKey: VALID_PUBLIC_KEY });

	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("returns same reference for repeated reads without storage change", async () => {
		const store = installDom();
		store.set("hyperliquid_agent_Mainnet_0x1234", STORAGE_VALUE);

		const { readAgentFromStorage } = await import("@hypeterminal/hl-react/signing/agent-storage");

		const first = readAgentFromStorage("Mainnet", "0x1234");
		const second = readAgentFromStorage("Mainnet", "0x1234");

		expect(first).toEqual(second);
		expect(first).not.toBeNull();
	});

	it("returns null when localStorage is empty", async () => {
		installDom();

		const { readAgentFromStorage } = await import("@hypeterminal/hl-react/signing/agent-storage");

		expect(readAgentFromStorage("Mainnet", "0x1234")).toBeNull();
	});

	it("returns null for invalid storage data", async () => {
		const store = installDom();
		store.set("hyperliquid_agent_Mainnet_0x1234", "not-json");

		const { readAgentFromStorage } = await import("@hypeterminal/hl-react/signing/agent-storage");

		expect(readAgentFromStorage("Mainnet", "0x1234")).toBeNull();
	});

	it("LRU cap (4) evicts the oldest (env,address) pair on the 5th unique read", async () => {
		installDom();

		const { getCachedAgentSnapshot, snapshotCache } = await import("@hypeterminal/hl-react/signing/agent-storage");

		getCachedAgentSnapshot("Mainnet", "0xaaaa");
		getCachedAgentSnapshot("Mainnet", "0xbbbb");
		getCachedAgentSnapshot("Mainnet", "0xcccc");
		getCachedAgentSnapshot("Mainnet", "0xdddd");

		expect(snapshotCache.size).toBe(4);
		expect(snapshotCache.has("Mainnet:0xaaaa")).toBe(true);

		// 5th distinct pair should evict the oldest entry (aaaa).
		getCachedAgentSnapshot("Mainnet", "0xeeee");

		expect(snapshotCache.size).toBe(4);
		expect(snapshotCache.has("Mainnet:0xaaaa")).toBe(false);
		expect(snapshotCache.has("Mainnet:0xeeee")).toBe(true);
	});

	it("invalidates the cache entry for a checksum-cased address after writeAgentToStorage", async () => {
		installDom();

		const { getCachedAgentSnapshot, subscribeToStorage, writeAgentToStorage } = await import(
			"@hypeterminal/hl-react/signing/agent-storage"
		);

		// Mirror the runtime flow: useSyncExternalStore registers the listener
		// via subscribeToStorage before any same-session write dispatches an event.
		const unsubscribe = subscribeToStorage(() => {});

		const checksumAddr = "0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfABCD";

		expect(getCachedAgentSnapshot("Mainnet", checksumAddr)).toBeNull();

		writeAgentToStorage("Mainnet", checksumAddr, VALID_PRIVATE_KEY, VALID_PUBLIC_KEY);

		const after = getCachedAgentSnapshot("Mainnet", checksumAddr);
		expect(after).not.toBeNull();
		expect(after?.publicKey).toBe(VALID_PUBLIC_KEY);

		unsubscribe();
	});
});
