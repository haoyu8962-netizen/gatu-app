import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfABCD";
const STORAGE_KEY = `hyperliquid_agent_Mainnet_${OWNER.toLowerCase()}`;
const OTHER_STORAGE_KEY = "hyperliquid_agent_Mainnet_0xother";
const PRIVATE_KEY = `0x${"44".repeat(32)}` as const;
const PUBLIC_KEY = privateKeyToAccount(PRIVATE_KEY).address.toLowerCase();
const STORAGE_VALUE = JSON.stringify({ privateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY });

interface StorageControls {
	accessFails: boolean;
	removeFails: boolean;
	readFails: boolean;
	keepAfterRemove: boolean;
	notificationFails: boolean;
}

function installDom() {
	const store = new Map<string, string>();
	const controls: StorageControls = {
		accessFails: false,
		removeFails: false,
		readFails: false,
		keepAfterRemove: false,
		notificationFails: false,
	};
	const target = new EventTarget();
	const storage = {
		getItem: vi.fn((key: string) => {
			if (controls.readFails) throw new Error("read failed");
			return store.get(key) ?? null;
		}),
		setItem: vi.fn((key: string, value: string) => {
			store.set(key, value);
		}),
		removeItem: vi.fn((key: string) => {
			if (controls.removeFails) throw new Error("remove failed");
			if (!controls.keepAfterRemove) store.delete(key);
		}),
		clear: vi.fn(() => store.clear()),
	};
	const win = {
		get localStorage() {
			if (controls.accessFails) throw new Error("storage unavailable");
			return storage;
		},
		addEventListener: target.addEventListener.bind(target),
		removeEventListener: target.removeEventListener.bind(target),
		dispatchEvent: (event: Event) => {
			if (controls.notificationFails) throw new Error("notification failed");
			return target.dispatchEvent(event);
		},
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

	return { controls, storage, store };
}

describe("verified Agent storage removal", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("removes and reads back the exact normalized storage key", async () => {
		const { storage, store } = installDom();
		store.set(STORAGE_KEY, STORAGE_VALUE);
		store.set(OTHER_STORAGE_KEY, STORAGE_VALUE);
		const storageModule = await import("@gatu/hl-react/signing/agent-storage");
		const callback = vi.fn();
		const unsubscribe = storageModule.subscribeToStorage(callback);

		expect(storageModule.getCachedAgentSnapshot("Mainnet", OWNER)).not.toBeNull();
		expect(storageModule.removeAgentFromStorageAndVerify("Mainnet", OWNER)).toEqual({ status: "removed" });

		expect(store.has(STORAGE_KEY)).toBe(false);
		expect(store.get(OTHER_STORAGE_KEY)).toBe(STORAGE_VALUE);
		expect(storage.getItem).toHaveBeenLastCalledWith(STORAGE_KEY);
		expect(storageModule.getCachedAgentSnapshot("Mainnet", OWNER)).toBeNull();
		expect(callback).toHaveBeenCalledTimes(1);
		unsubscribe();
	});

	it("treats an already absent key as an idempotent success", async () => {
		installDom();
		const { removeAgentFromStorageAndVerify } = await import("@gatu/hl-react/signing/agent-storage");

		expect(removeAgentFromStorageAndVerify("Mainnet", OWNER)).toEqual({ status: "removed" });
	});

	it("reports unavailable storage without throwing and invalidates the cached snapshot", async () => {
		const { controls, store } = installDom();
		store.set(STORAGE_KEY, STORAGE_VALUE);
		const storageModule = await import("@gatu/hl-react/signing/agent-storage");
		expect(storageModule.getCachedAgentSnapshot("Mainnet", OWNER)).not.toBeNull();

		controls.accessFails = true;

		expect(storageModule.removeAgentFromStorageAndVerify("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "storage_unavailable",
		});
		expect(storageModule.snapshotCache.has(`Mainnet:${OWNER.toLowerCase()}`)).toBe(false);
	});

	it("reports remove failures without throwing and invalidates the cached snapshot", async () => {
		const { controls, store } = installDom();
		store.set(STORAGE_KEY, STORAGE_VALUE);
		const storageModule = await import("@gatu/hl-react/signing/agent-storage");
		expect(storageModule.getCachedAgentSnapshot("Mainnet", OWNER)).not.toBeNull();

		controls.removeFails = true;

		expect(storageModule.removeAgentFromStorageAndVerify("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "remove_failed",
		});
		expect(storageModule.snapshotCache.has(`Mainnet:${OWNER.toLowerCase()}`)).toBe(false);
		expect(store.get(STORAGE_KEY)).toBe("null");
		expect(storageModule.getCachedAgentSnapshot("Mainnet", OWNER)).toBeNull();

		controls.removeFails = false;
		expect(storageModule.removeAgentFromStorageAndVerify("Mainnet", OWNER)).toEqual({ status: "removed" });
		expect(store.has(STORAGE_KEY)).toBe(false);
	});

	it("distinguishes a failed readback from a key that remains present", async () => {
		const { controls, store } = installDom();
		store.set(STORAGE_KEY, STORAGE_VALUE);
		const storageModule = await import("@gatu/hl-react/signing/agent-storage");

		controls.readFails = true;
		expect(storageModule.removeAgentFromStorageAndVerify("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "readback_failed",
		});

		controls.readFails = false;
		controls.keepAfterRemove = true;
		store.set(STORAGE_KEY, STORAGE_VALUE);
		expect(storageModule.removeAgentFromStorageAndVerify("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "readback_mismatch",
		});
	});

	it("reports notification failures after invalidating the removed Agent snapshot", async () => {
		const { controls, store } = installDom();
		store.set(STORAGE_KEY, STORAGE_VALUE);
		const storageModule = await import("@gatu/hl-react/signing/agent-storage");
		expect(storageModule.getCachedAgentSnapshot("Mainnet", OWNER)).not.toBeNull();

		controls.notificationFails = true;

		expect(storageModule.removeAgentFromStorageAndVerify("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "notification_failed",
		});
		expect(store.has(STORAGE_KEY)).toBe(false);
		expect(storageModule.snapshotCache.has(`Mainnet:${OWNER.toLowerCase()}`)).toBe(false);
	});

	it("exposes verified removal without changing the legacy clear action", async () => {
		const { store } = installDom();
		const storageModule = await import("@gatu/hl-react/signing/agent-storage");
		const getActions = storageModule.useAgentWalletActions;
		const actions = getActions();

		store.set(STORAGE_KEY, STORAGE_VALUE);
		expect(actions.clearAgentVerified("Mainnet", OWNER)).toEqual({ status: "removed" });

		store.set(STORAGE_KEY, STORAGE_VALUE);
		expect(actions.clearAgent("Mainnet", OWNER)).toBeUndefined();
		expect(store.has(STORAGE_KEY)).toBe(false);
	});
});
