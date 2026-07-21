// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/config/app";

describe("network storage", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.resetModules();
	});

	it("prefers the dedicated cross-tab key", async () => {
		localStorage.setItem(STORAGE_KEYS.GLOBAL_SETTINGS, JSON.stringify({ state: { network: "mainnet" } }));
		localStorage.setItem(STORAGE_KEYS.NETWORK, "testnet");
		const { getNetwork } = await import("@/lib/network");
		expect(getNetwork()).toBe("testnet");
	});

	it("migrates by reading the legacy Zustand snapshot when needed", async () => {
		localStorage.setItem(STORAGE_KEYS.GLOBAL_SETTINGS, JSON.stringify({ state: { network: "testnet" } }));
		const { getNetwork } = await import("@/lib/network");
		expect(getNetwork()).toBe("testnet");
	});

	it("persists a standalone network value", async () => {
		const { persistNetwork } = await import("@/lib/network");
		persistNetwork("testnet");
		expect(localStorage.getItem(STORAGE_KEYS.NETWORK)).toBe("testnet");
	});

	it("notifies other tabs only for valid dedicated network events", async () => {
		const { subscribeNetworkStorage } = await import("@/lib/network");
		const listener = vi.fn();
		const unsubscribe = subscribeNetworkStorage(listener);

		window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEYS.NETWORK, newValue: "testnet" }));
		window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEYS.NETWORK, newValue: "invalid" }));
		window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEYS.GLOBAL_SETTINGS, newValue: "{}" }));

		expect(listener).toHaveBeenCalledOnce();
		expect(listener).toHaveBeenCalledWith("testnet");
		unsubscribe();
	});
});
