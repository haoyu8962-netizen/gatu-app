import { privateKeyToAccount } from "viem/accounts";
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
	const MISMATCHED_PUBLIC_KEY = `0x${"cd".repeat(20)}` as const;
	const VALID_PUBLIC_KEY = privateKeyToAccount(VALID_PRIVATE_KEY).address.toLowerCase();
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

		const { readAgentFromStorage } = await import("@gatu/hl-react/signing/agent-storage");

		const first = readAgentFromStorage("Mainnet", "0x1234");
		const second = readAgentFromStorage("Mainnet", "0x1234");

		expect(first).toEqual(second);
		expect(first).not.toBeNull();
	});

	it("returns null when localStorage is empty", async () => {
		installDom();

		const { hasInvalidAgentStorageRecord, readAgentFromStorage } = await import("@gatu/hl-react/signing/agent-storage");

		expect(readAgentFromStorage("Mainnet", "0x1234")).toBeNull();
		expect(hasInvalidAgentStorageRecord("Mainnet", "0x1234")).toBe(false);
	});

	it("returns null for invalid storage data", async () => {
		const store = installDom();
		store.set("hyperliquid_agent_Mainnet_0x1234", "not-json");

		const { hasInvalidAgentStorageRecord, readAgentFromStorage } = await import("@gatu/hl-react/signing/agent-storage");

		expect(readAgentFromStorage("Mainnet", "0x1234")).toBeNull();
		expect(hasInvalidAgentStorageRecord("Mainnet", "0x1234")).toBe(true);
	});

	it("detects an invalid Agent record during active pending registration coordination", async () => {
		const store = installDom();
		store.set("hyperliquid_agent_Mainnet_0x1234", "not-json");
		store.set(
			"hyperliquid_agent_registration_session_Mainnet_0x1234",
			JSON.stringify({
				epoch: "11111111-1111-4111-8111-111111111111",
				registrationPendingAtMs: 1,
				registrationPublicKey: VALID_PUBLIC_KEY,
				state: "active",
				version: 1,
			}),
		);

		const { hasInvalidAgentStorageRecord, readAgentFromStorage } = await import("@gatu/hl-react/signing/agent-storage");

		expect(readAgentFromStorage("Mainnet", "0x1234")).toBeNull();
		expect(hasInvalidAgentStorageRecord("Mainnet", "0x1234")).toBe(true);
	});

	it("does not classify a valid Agent with mismatched coordination as corrupt storage", async () => {
		const store = installDom();
		store.set(
			"hyperliquid_agent_Mainnet_0x1234",
			JSON.stringify({
				approvalPendingAtMs: 1,
				privateKey: VALID_PRIVATE_KEY,
				publicKey: VALID_PUBLIC_KEY,
				source: "local-registration",
			}),
		);
		store.set(
			"hyperliquid_agent_registration_session_Mainnet_0x1234",
			JSON.stringify({
				epoch: "11111111-1111-4111-8111-111111111111",
				registrationPendingAtMs: 1,
				registrationPublicKey: MISMATCHED_PUBLIC_KEY,
				state: "active",
				version: 1,
			}),
		);

		const { hasInvalidAgentStorageRecord, readAgentFromStorage } = await import("@gatu/hl-react/signing/agent-storage");

		expect(readAgentFromStorage("Mainnet", "0x1234")).toBeNull();
		expect(hasInvalidAgentStorageRecord("Mainnet", "0x1234")).toBe(false);
	});

	it("marks partial mobile Agent records without treating them as generic registrations", async () => {
		const store = installDom();
		store.set(
			"hyperliquid_agent_Mainnet_0x1234",
			JSON.stringify({
				privateKey: VALID_PRIVATE_KEY,
				publicKey: VALID_PUBLIC_KEY,
				source: "mobile-sync",
				agentValidUntilMs: 1,
			}),
		);

		const { hasInvalidAgentStorageRecord, readAgentFromStorage } = await import("@gatu/hl-react/signing/agent-storage");

		expect(readAgentFromStorage("Mainnet", "0x1234")).toBeNull();
		expect(hasInvalidAgentStorageRecord("Mainnet", "0x1234")).toBe(true);
	});

	it("preserves the invalid-mobile classification when its key fields cannot be parsed", async () => {
		const store = installDom();
		store.set(
			"hyperliquid_agent_Mainnet_0x1234",
			JSON.stringify({
				privateKey: "not-a-private-key",
				publicKey: VALID_PUBLIC_KEY,
				source: "mobile-sync",
			}),
		);

		const { hasInvalidAgentStorageRecord, readAgentFromStorage } = await import("@gatu/hl-react/signing/agent-storage");

		expect(readAgentFromStorage("Mainnet", "0x1234")).toBeNull();
		expect(hasInvalidAgentStorageRecord("Mainnet", "0x1234")).toBe(true);
	});

	it("rejects non-canonical names, key mismatches, and null expiry in mobile storage", async () => {
		const store = installDom();
		const storageKey = "hyperliquid_agent_Mainnet_0x1234";
		const validUntilMs = 2_000_000_000_000;
		const canonical = {
			privateKey: VALID_PRIVATE_KEY,
			publicKey: VALID_PUBLIC_KEY,
			source: "mobile-sync",
			agentNameBase: "Mobile",
			agentName: `Mobile valid_until ${validUntilMs}`,
			agentValidUntilMs: validUntilMs,
			importedAtMs: validUntilMs - 1_000,
		};
		const invalidRecords = [
			{ ...canonical, agentName: `Mobile valid_until ${validUntilMs + 1}` },
			{ ...canonical, publicKey: MISMATCHED_PUBLIC_KEY },
			{ ...canonical, agentValidUntilMs: null },
		];
		const { hasInvalidAgentStorageRecord, readAgentFromStorage } = await import("@gatu/hl-react/signing/agent-storage");

		for (const record of invalidRecords) {
			store.set(storageKey, JSON.stringify(record));
			expect(readAgentFromStorage("Mainnet", "0x1234")).toBeNull();
			expect(hasInvalidAgentStorageRecord("Mainnet", "0x1234")).toBe(true);
		}
	});

	it("retains a complete expired mobile record for immediate lifecycle cleanup after reload", async () => {
		const store = installDom();
		store.set(
			"hyperliquid_agent_Mainnet_0x1234",
			JSON.stringify({
				privateKey: VALID_PRIVATE_KEY,
				publicKey: VALID_PUBLIC_KEY,
				source: "mobile-sync",
				agentNameBase: "Mobile",
				agentName: "Mobile valid_until 2",
				agentValidUntilMs: 2,
				importedAtMs: 1,
			}),
		);

		const { hasInvalidAgentStorageRecord, readAgentFromStorage } = await import("@gatu/hl-react/signing/agent-storage");

		expect(readAgentFromStorage("Mainnet", "0x1234")).toMatchObject({
			source: "mobile-sync",
			agentValidUntilMs: 2,
		});
		expect(hasInvalidAgentStorageRecord("Mainnet", "0x1234")).toBe(false);
	});

	it.each(["local-registration", undefined])("rejects a mismatched key pair for %s Agent storage", async (source) => {
		const store = installDom();
		const storageKey = "hyperliquid_agent_Mainnet_0x1234";
		store.set(
			storageKey,
			JSON.stringify({
				privateKey: VALID_PRIVATE_KEY,
				publicKey: MISMATCHED_PUBLIC_KEY,
				...(source ? { source } : {}),
			}),
		);

		const { getCachedAgentSnapshot, hasInvalidAgentStorageRecord, readAgentFromStorage } = await import(
			"@gatu/hl-react/signing/agent-storage"
		);

		expect(readAgentFromStorage("Mainnet", "0x1234")).toBeNull();
		expect(getCachedAgentSnapshot("Mainnet", "0x1234")).toBeNull();
		expect(hasInvalidAgentStorageRecord("Mainnet", "0x1234")).toBe(true);
	});

	it("LRU cap (4) evicts the oldest (env,address) pair on the 5th unique read", async () => {
		installDom();

		const { getCachedAgentSnapshot, snapshotCache } = await import("@gatu/hl-react/signing/agent-storage");

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
			"@gatu/hl-react/signing/agent-storage"
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

	it("invalidates a prior snapshot after a strict write without a subscriber", async () => {
		installDom();
		const privateKey = `0x${"44".repeat(32)}` as const;
		const publicKey = privateKeyToAccount(privateKey).address;
		const owner = "0x9999999999999999999999999999999999999999";
		const { getCachedAgentSnapshot, writeAgentToStorageAndVerify } = await import(
			"@gatu/hl-react/signing/agent-storage"
		);

		expect(getCachedAgentSnapshot("Mainnet", owner)).toBeNull();
		expect(writeAgentToStorageAndVerify("Mainnet", owner, privateKey, publicKey).status).toBe("stored");
		expect(getCachedAgentSnapshot("Mainnet", owner)?.publicKey).toBe(publicKey.toLowerCase());
	});
});
