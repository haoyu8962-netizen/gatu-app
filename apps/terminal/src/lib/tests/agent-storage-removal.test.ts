import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfABCD";
const STORAGE_KEY = `hyperliquid_agent_Mainnet_${OWNER.toLowerCase()}`;
const SESSION_STORAGE_KEY = `hyperliquid_agent_registration_session_Mainnet_${OWNER.toLowerCase()}`;
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
		const storageModule = await import("@sairn/hl-react/signing/agent-storage");
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
		const { removeAgentFromStorageAndVerify } = await import("@sairn/hl-react/signing/agent-storage");

		expect(removeAgentFromStorageAndVerify("Mainnet", OWNER)).toEqual({ status: "removed" });
	});

	it("invalidates selected exchange work before Agent removal reaches browser storage", async () => {
		installDom();
		const storageModule = await import("@sairn/hl-react/signing/agent-storage");
		const schedulerModule = await import("@sairn/hl-react/internal/exchange/request-scheduler");
		const scheduler = new schedulerModule.ExchangeRequestScheduler();
		const generation = schedulerModule.captureExchangeRequestGeneration("Mainnet", OWNER, "wallet", {
			signer: "agent",
			agentPublicKey: "0xaaaa",
		});
		const ownerGeneration = schedulerModule.captureExchangeRequestGeneration("Mainnet", OWNER, "wallet", {
			signer: "user",
		});
		const run = vi.fn(async () => "unexpected");
		const pending = scheduler.schedule("normal", run, generation);
		const rejection = expect(pending).rejects.toBeInstanceOf(schedulerModule.ExchangeRequestInvalidatedError);

		expect(storageModule.removeAgentFromStorageAndVerify("Mainnet", OWNER)).toEqual({ status: "removed" });

		await rejection;
		expect(run).not.toHaveBeenCalled();
		await expect(scheduler.schedule("normal", async () => "withdraw", ownerGeneration)).resolves.toBe("withdraw");
	});

	it("invalidates selected exchange work when another tab changes the Agent key", async () => {
		installDom();
		const storageModule = await import("@sairn/hl-react/signing/agent-storage");
		const schedulerModule = await import("@sairn/hl-react/internal/exchange/request-scheduler");
		const unsubscribe = storageModule.subscribeToStorage(vi.fn());
		const scheduler = new schedulerModule.ExchangeRequestScheduler();
		const generation = schedulerModule.captureExchangeRequestGeneration("Mainnet", OWNER, "agent-only", {
			signer: "agent",
			agentPublicKey: "0xaaaa",
		});
		const run = vi.fn(async () => "unexpected");
		const pending = scheduler.schedule("normal", run, generation);
		const rejection = expect(pending).rejects.toBeInstanceOf(schedulerModule.ExchangeRequestInvalidatedError);

		window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));

		await rejection;
		expect(run).not.toHaveBeenCalled();
		unsubscribe();
	});

	it("invalidates selected exchange work when another tab closes the registration session", async () => {
		const { store } = installDom();
		store.set(
			SESSION_STORAGE_KEY,
			JSON.stringify({ version: 1, epoch: "closing-registration-epoch", state: "closing" }),
		);
		const storageModule = await import("@sairn/hl-react/signing/agent-storage");
		const schedulerModule = await import("@sairn/hl-react/internal/exchange/request-scheduler");
		const unsubscribe = storageModule.subscribeToStorage(vi.fn());
		const scheduler = new schedulerModule.ExchangeRequestScheduler();
		const generation = schedulerModule.captureExchangeRequestGeneration("Mainnet", OWNER, "wallet");
		const run = vi.fn(async () => "unexpected");
		const pending = scheduler.schedule("normal", run, generation);
		const rejection = expect(pending).rejects.toBeInstanceOf(schedulerModule.ExchangeRequestInvalidatedError);

		window.dispatchEvent(new StorageEvent("storage", { key: SESSION_STORAGE_KEY }));

		await rejection;
		expect(run).not.toHaveBeenCalled();
		unsubscribe();
	});

	it("reports unavailable storage without throwing and invalidates the cached snapshot", async () => {
		const { controls, store } = installDom();
		store.set(STORAGE_KEY, STORAGE_VALUE);
		const storageModule = await import("@sairn/hl-react/signing/agent-storage");
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
		const storageModule = await import("@sairn/hl-react/signing/agent-storage");
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

	it("quarantines an undeletable key until a later verified write replaces it", async () => {
		const { controls, storage, store } = installDom();
		store.set(STORAGE_KEY, STORAGE_VALUE);
		const storageModule = await import("@sairn/hl-react/signing/agent-storage");
		expect(storageModule.getCachedAgentSnapshot("Mainnet", OWNER)).not.toBeNull();

		controls.removeFails = true;
		storage.setItem.mockImplementation(() => {
			throw new Error("write failed");
		});

		expect(storageModule.removeAgentFromStorageAndVerify("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "remove_failed",
		});
		expect(store.get(STORAGE_KEY)).toBe(STORAGE_VALUE);
		expect(storageModule.readAgentFromStorage("Mainnet", OWNER)).toBeNull();
		expect(storageModule.getCachedAgentSnapshot("Mainnet", OWNER)).toBeNull();

		controls.removeFails = false;
		storage.setItem.mockImplementation((key: string, value: string) => {
			store.set(key, value);
		});
		const replacementPrivateKey = `0x${"55".repeat(32)}` as const;
		const replacementPublicKey = privateKeyToAccount(replacementPrivateKey).address;
		expect(
			storageModule.writeAgentToStorageAndVerify("Mainnet", OWNER, replacementPrivateKey, replacementPublicKey, {
				source: "local-registration",
			}).status,
		).toBe("stored");
		expect(storageModule.getCachedAgentSnapshot("Mainnet", OWNER)?.publicKey).toBe(replacementPublicKey.toLowerCase());
	});

	it("does not revive a persisted key while its registration session has a closing tombstone", async () => {
		const { store } = installDom();
		store.set(STORAGE_KEY, STORAGE_VALUE);
		store.set(
			SESSION_STORAGE_KEY,
			JSON.stringify({ version: 1, epoch: "closing-registration-epoch", state: "closing" }),
		);
		const storageModule = await import("@sairn/hl-react/signing/agent-storage");

		expect(storageModule.readAgentFromStorage("Mainnet", OWNER)).toBeNull();
		expect(storageModule.getCachedAgentSnapshot("Mainnet", OWNER)).toBeNull();

		store.set(
			SESSION_STORAGE_KEY,
			JSON.stringify({ version: 1, epoch: "new-active-registration-epoch", state: "active" }),
		);
		window.dispatchEvent(new StorageEvent("storage", { key: SESSION_STORAGE_KEY }));

		expect(storageModule.getCachedAgentSnapshot("Mainnet", OWNER)?.publicKey).toBe(PUBLIC_KEY);
	});

	it("distinguishes a failed readback from a key that remains present", async () => {
		const { controls, store } = installDom();
		store.set(STORAGE_KEY, STORAGE_VALUE);
		const storageModule = await import("@sairn/hl-react/signing/agent-storage");

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
		const storageModule = await import("@sairn/hl-react/signing/agent-storage");
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
		const storageModule = await import("@sairn/hl-react/signing/agent-storage");
		const getActions = storageModule.useAgentWalletActions;
		const actions = getActions();

		store.set(STORAGE_KEY, STORAGE_VALUE);
		expect(actions.clearAgentVerified("Mainnet", OWNER)).toEqual({ status: "removed" });

		store.set(STORAGE_KEY, STORAGE_VALUE);
		expect(actions.clearAgent("Mainnet", OWNER)).toBeUndefined();
		expect(store.has(STORAGE_KEY)).toBe(false);
	});

	it("evicts the exact in-memory signer and trading client after verified removal", async () => {
		const { store } = installDom();
		store.set(STORAGE_KEY, STORAGE_VALUE);
		const storageModule = await import("@sairn/hl-react/signing/agent-storage");
		const signerModule = await import("@sairn/hl-react/signing/agent-signer-cache");
		const clientsModule = await import("@sairn/hl-react/clients");

		const signer = signerModule.getCachedAgentSigner(PRIVATE_KEY);
		expect(signer).not.toBeNull();
		if (!signer) throw new Error("Expected Agent signer");
		const tradingClient = clientsModule.getTradingClient(signer, false);
		expect(signerModule.signerCache.has(PRIVATE_KEY)).toBe(true);

		expect(storageModule.removeAgentFromStorageAndVerify("Mainnet", OWNER)).toEqual({ status: "removed" });
		expect(signerModule.signerCache.has(PRIVATE_KEY)).toBe(false);

		const replacementSigner = signerModule.getCachedAgentSigner(PRIVATE_KEY);
		expect(replacementSigner).not.toBeNull();
		if (!replacementSigner) throw new Error("Expected replacement Agent signer");
		expect(clientsModule.getTradingClient(replacementSigner, false)).not.toBe(tradingClient);
	});

	it("evicts caches behind a closing tombstone without relying on a storage notification", async () => {
		const { controls, store } = installDom();
		store.set(STORAGE_KEY, STORAGE_VALUE);
		store.set(
			SESSION_STORAGE_KEY,
			JSON.stringify({ version: 1, epoch: "closing-registration-epoch", state: "closing" }),
		);
		const storageModule = await import("@sairn/hl-react/signing/agent-storage");
		const signerModule = await import("@sairn/hl-react/signing/agent-signer-cache");
		const clientsModule = await import("@sairn/hl-react/clients");

		const signer = signerModule.getCachedAgentSigner(PRIVATE_KEY);
		expect(signer).not.toBeNull();
		if (!signer) throw new Error("Expected Agent signer");
		const tradingClient = clientsModule.getTradingClient(signer, false);
		controls.notificationFails = true;

		expect(storageModule.removeAgentFromStorageAndVerify("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "notification_failed",
		});
		expect(signerModule.signerCache.has(PRIVATE_KEY)).toBe(false);

		const replacementSigner = signerModule.getCachedAgentSigner(PRIVATE_KEY);
		expect(replacementSigner).not.toBeNull();
		if (!replacementSigner) throw new Error("Expected replacement Agent signer");
		expect(clientsModule.getTradingClient(replacementSigner, false)).not.toBe(tradingClient);
	});

	it("revalidates storage after every unobserved interval instead of reviving a stale cached key", async () => {
		const { store } = installDom();
		store.set(STORAGE_KEY, STORAGE_VALUE);
		const storageModule = await import("@sairn/hl-react/signing/agent-storage");
		const signerModule = await import("@sairn/hl-react/signing/agent-signer-cache");
		const clientsModule = await import("@sairn/hl-react/clients");

		const unsubscribe = storageModule.subscribeToStorage(vi.fn());
		expect(storageModule.getCachedAgentSnapshot("Mainnet", OWNER)).not.toBeNull();
		const signer = signerModule.getCachedAgentSigner(PRIVATE_KEY);
		expect(signer).not.toBeNull();
		if (!signer) throw new Error("Expected Agent signer");
		const tradingClient = clientsModule.getTradingClient(signer, false);
		unsubscribe();

		// A native cross-tab event can be missed while no React consumer is
		// mounted. The next snapshot read must still compare localStorage.
		store.delete(STORAGE_KEY);

		expect(storageModule.getCachedAgentSnapshot("Mainnet", OWNER)).toBeNull();
		expect(signerModule.signerCache.has(PRIVATE_KEY)).toBe(false);
		const replacementSigner = signerModule.getCachedAgentSigner(PRIVATE_KEY);
		expect(replacementSigner).not.toBeNull();
		if (!replacementSigner) throw new Error("Expected replacement Agent signer");
		expect(clientsModule.getTradingClient(replacementSigner, false)).not.toBe(tradingClient);
	});

	it("evicts every sensitive Agent cache when another tab clears localStorage", async () => {
		const { store } = installDom();
		store.set(STORAGE_KEY, STORAGE_VALUE);
		const storageModule = await import("@sairn/hl-react/signing/agent-storage");
		const signerModule = await import("@sairn/hl-react/signing/agent-signer-cache");
		const clientsModule = await import("@sairn/hl-react/clients");

		expect(storageModule.getCachedAgentSnapshot("Mainnet", OWNER)).not.toBeNull();
		const signer = signerModule.getCachedAgentSigner(PRIVATE_KEY);
		expect(signer).not.toBeNull();
		if (!signer) throw new Error("Expected Agent signer");
		const tradingClient = clientsModule.getTradingClient(signer, false);
		const schedulerModule = await import("@sairn/hl-react/internal/exchange/request-scheduler");
		const scheduler = new schedulerModule.ExchangeRequestScheduler();
		const generation = schedulerModule.captureExchangeRequestGeneration("Mainnet", OWNER, "wallet");
		const run = vi.fn(async () => "unexpected");
		const pending = scheduler.schedule("normal", run, generation);
		const rejection = expect(pending).rejects.toBeInstanceOf(schedulerModule.ExchangeRequestInvalidatedError);

		store.clear();
		window.dispatchEvent(new StorageEvent("storage", { key: null }));

		await rejection;
		expect(run).not.toHaveBeenCalled();
		expect(storageModule.snapshotCache.size).toBe(0);
		expect(signerModule.signerCache.has(PRIVATE_KEY)).toBe(false);
		const replacementSigner = signerModule.getCachedAgentSigner(PRIVATE_KEY);
		expect(replacementSigner).not.toBeNull();
		if (!replacementSigner) throw new Error("Expected replacement Agent signer");
		expect(clientsModule.getTradingClient(replacementSigner, false)).not.toBe(tradingClient);
	});
});
