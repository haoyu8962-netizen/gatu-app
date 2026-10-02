// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/config/app";
import { getCanonicalNetworkForHostname, PUBLIC_ORIGINS } from "@/config/public-origins";

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

	it("binds each canonical production hostname to exactly one network", () => {
		expect(getCanonicalNetworkForHostname("app.sairn.ai")).toBe("mainnet");
		expect(getCanonicalNetworkForHostname("APP.SAIRN.AI")).toBe("mainnet");
		expect(getCanonicalNetworkForHostname("testnet.sairn.ai")).toBe("testnet");
		expect(getCanonicalNetworkForHostname("app.sairn.ai.evil.example")).toBeNull();
		expect(getCanonicalNetworkForHostname("preview.sairn.ai")).toBeNull();
	});

	it("keeps recognising the legacy gatu.ai hosts until they are retired from brand.json", async () => {
		expect(getCanonicalNetworkForHostname("app.gatu.ai")).toBe("mainnet");
		expect(getCanonicalNetworkForHostname("testnet.gatu.ai")).toBe("testnet");
		expect(getCanonicalNetworkForHostname("app.gatu.ai.evil.example")).toBeNull();

		const { switchNetwork } = await import("@/lib/network");
		const navigate = vi.fn();
		expect(switchNetwork("testnet", "app.gatu.ai", navigate)).toBe("navigating");
		expect(navigate).toHaveBeenCalledExactlyOnceWith("https://testnet.gatu.ai");
	});

	it("ignores stored network values on canonical production hostnames", async () => {
		localStorage.setItem(STORAGE_KEYS.NETWORK, "testnet");
		const { getNetwork } = await import("@/lib/network");
		expect(getNetwork("app.sairn.ai")).toBe("mainnet");

		localStorage.setItem(STORAGE_KEYS.NETWORK, "mainnet");
		expect(getNetwork("testnet.sairn.ai")).toBe("testnet");
	});

	it("does not persist network overrides on canonical production hostnames", async () => {
		localStorage.setItem(STORAGE_KEYS.NETWORK, "mainnet");
		const { persistNetwork } = await import("@/lib/network");
		persistNetwork("testnet", "app.sairn.ai");
		expect(localStorage.getItem(STORAGE_KEYS.NETWORK)).toBe("mainnet");
	});

	it("switches canonical production networks by navigating to the fixed target origin", async () => {
		const { switchNetwork } = await import("@/lib/network");
		const navigate = vi.fn();

		expect(switchNetwork("testnet", "app.sairn.ai", navigate)).toBe("navigating");
		expect(navigate).toHaveBeenCalledExactlyOnceWith(PUBLIC_ORIGINS.testnet);
		expect(navigate.mock.calls[0]?.[0]).not.toContain("?");
		expect(navigate.mock.calls[0]?.[0]).not.toContain("#");

		navigate.mockClear();
		expect(switchNetwork("mainnet", "testnet.sairn.ai", navigate)).toBe("navigating");
		expect(navigate).toHaveBeenCalledExactlyOnceWith(PUBLIC_ORIGINS.mainnet);

		navigate.mockClear();
		expect(switchNetwork("mainnet", "app.sairn.ai", navigate)).toBe("unchanged");
		expect(navigate).not.toHaveBeenCalled();
	});

	it("keeps local and preview hosts on the persisted reload flow", async () => {
		const { switchNetwork } = await import("@/lib/network");
		const navigate = vi.fn();
		localStorage.setItem(STORAGE_KEYS.NETWORK, "mainnet");

		expect(switchNetwork("testnet", "localhost", navigate)).toBe("persisted");
		expect(localStorage.getItem(STORAGE_KEYS.NETWORK)).toBe("testnet");
		expect(navigate).not.toHaveBeenCalled();
	});

	it("keeps the dedicated key synchronized when a local network selection is unchanged", async () => {
		localStorage.setItem(STORAGE_KEYS.GLOBAL_SETTINGS, JSON.stringify({ state: { network: "mainnet" } }));
		const { switchNetwork } = await import("@/lib/network");

		expect(switchNetwork("mainnet", "localhost", vi.fn())).toBe("unchanged");
		expect(localStorage.getItem(STORAGE_KEYS.NETWORK)).toBe("mainnet");
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

	it("ignores cross-tab network storage events on canonical production hostnames", async () => {
		const { subscribeNetworkStorage } = await import("@/lib/network");
		const listener = vi.fn();
		const unsubscribe = subscribeNetworkStorage(listener, "app.sairn.ai");

		window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEYS.NETWORK, newValue: "testnet" }));

		expect(listener).not.toHaveBeenCalled();
		unsubscribe();
	});
});
