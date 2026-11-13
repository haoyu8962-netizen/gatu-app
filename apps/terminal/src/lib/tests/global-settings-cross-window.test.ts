/** @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/config/app";

type GlobalSettingsModule = typeof import("@/stores/use-global-settings-store");

const KEY = STORAGE_KEYS.GLOBAL_SETTINGS;
const windowListeners: Array<Array<(event: StorageEvent) => void>> = [];

function readStored(): { version?: number; state?: Record<string, unknown> } {
	return JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
}

async function openWindow(): Promise<GlobalSettingsModule> {
	const added = vi.spyOn(window, "addEventListener");
	vi.resetModules();
	const module = await import("@/stores/use-global-settings-store");
	windowListeners.push(
		added.mock.calls.filter((call) => call[0] === "storage").map((call) => call[1] as (event: StorageEvent) => void),
	);
	added.mockRestore();
	return module;
}

function deliverStorageEvent(target: number, oldValue: string | null, storageArea: Storage = window.localStorage) {
	const event = new StorageEvent("storage", {
		key: KEY,
		oldValue,
		newValue: window.localStorage.getItem(KEY),
		storageArea,
	});
	for (const listener of windowListeners[target] ?? []) listener(event);
}

function readHook<T>(hook: () => T): T {
	let value: T | undefined;
	function Probe() {
		value = hook();
		return null;
	}
	const container = document.createElement("div");
	const root = createRoot(container);
	act(() => root.render(createElement(Probe)));
	act(() => root.unmount());
	return value as T;
}

type Actions = ReturnType<GlobalSettingsModule["useGlobalSettingsActions"]>;

describe("global settings across windows", () => {
	let tabA: GlobalSettingsModule;
	let tabB: GlobalSettingsModule;
	let tabAActions: Actions;
	let tabBActions: Actions;

	beforeEach(async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		window.localStorage.clear();
		windowListeners.length = 0;
		window.localStorage.setItem(
			KEY,
			JSON.stringify({
				state: {
					skipOrderConfirmation: true,
					transactionDelayProtection: false,
					marketOrderSlippagePercent: 5,
					positionsActiveTab: "positions",
					theme: "dark",
				},
				version: 4,
			}),
		);
		tabA = await openWindow();
		tabB = await openWindow();
		expect(windowListeners[1]?.length).toBeGreaterThan(0);
		tabAActions = readHook(tabA.useGlobalSettingsActions);
		tabBActions = readHook(tabB.useGlobalSettingsActions);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		window.localStorage.clear();
		windowListeners.length = 0;
		vi.resetModules();
	});

	function tightenInTabA() {
		const before = window.localStorage.getItem(KEY);
		tabAActions.setSkipOrderConfirmation(false);
		tabAActions.setTransactionDelayProtection(true);
		tabAActions.setMarketOrderSlippagePercent(1);
		return before;
	}

	it("keeps another window's tightened protections when this window changes an unrelated setting", () => {
		const before = tightenInTabA();
		deliverStorageEvent(1, before);

		expect(tabB.getSkipOrderConfirmation()).toBe(false);
		expect(tabB.getTransactionDelayProtection()).toBe(true);

		tabBActions.setPositionsActiveTab("openOrders");

		expect(readStored().state).toMatchObject({
			skipOrderConfirmation: false,
			transactionDelayProtection: true,
			marketOrderSlippagePercent: 1,
			positionsActiveTab: "openOrders",
		});
		expect(tabB.getSkipOrderConfirmation()).toBe(false);
		expect(tabB.getTransactionDelayProtection()).toBe(true);
	});

	it("does not restore older values when the storage event has not arrived before this window writes", () => {
		tightenInTabA();

		expect(tabB.getSkipOrderConfirmation()).toBe(true);

		tabBActions.setPositionsActiveTab("openOrders");

		expect(readStored().state).toMatchObject({
			skipOrderConfirmation: false,
			transactionDelayProtection: true,
			marketOrderSlippagePercent: 1,
			positionsActiveTab: "openOrders",
		});
		expect(tabB.getSkipOrderConfirmation()).toBe(false);
		expect(tabB.getTransactionDelayProtection()).toBe(true);
	});

	it("keeps this window's own change when both windows changed different fields", () => {
		tightenInTabA();
		tabBActions.setHideSmallBalances(false);

		expect(readStored().state).toMatchObject({
			hideSmallBalances: false,
			skipOrderConfirmation: false,
			transactionDelayProtection: true,
		});

		tabAActions.setShowChartScanlines(true);

		expect(readStored().state).toMatchObject({
			hideSmallBalances: false,
			showChartScanlines: true,
			skipOrderConfirmation: false,
		});
	});

	it("keeps each window's visible tab while preserving the other window's stored tab", () => {
		const before = window.localStorage.getItem(KEY);
		tabAActions.setPositionsActiveTab("openOrders");
		deliverStorageEvent(1, before);

		expect(tabB.getPositionsActiveTab()).toBe("positions");

		tabBActions.setHideSmallBalances(false);

		expect(readStored().state).toMatchObject({ positionsActiveTab: "openOrders", hideSmallBalances: false });
		expect(tabB.getPositionsActiveTab()).toBe("positions");
	});

	it("follows a theme change made in another window on the document", () => {
		const before = window.localStorage.getItem(KEY);
		tabAActions.setTheme("light");
		document.documentElement.classList.remove("light");
		document.documentElement.classList.add("dark");
		deliverStorageEvent(1, before);

		expect(readHook(tabB.useTheme)).toBe("light");
		expect(document.documentElement.classList.contains("light")).toBe(true);
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it.each([
		["unparseable text", "{not json"],
		["a schema violation", JSON.stringify({ state: { skipOrderConfirmation: "yes" }, version: 4 })],
		["a newer version", JSON.stringify({ state: { skipOrderConfirmation: true }, version: 99 })],
	])("ignores %s written by another window", (_label, value) => {
		tightenInTabA();
		deliverStorageEvent(1, null);
		const before = window.localStorage.getItem(KEY);
		window.localStorage.setItem(KEY, value);
		deliverStorageEvent(1, before);

		expect(tabB.getSkipOrderConfirmation()).toBe(false);
		expect(tabB.getTransactionDelayProtection()).toBe(true);
		expect(readHook(tabB.useMarketOrderSlippagePercent)).toBe(1);

		tabBActions.setPositionsActiveTab("openOrders");

		expect(readStored().state).toMatchObject({
			skipOrderConfirmation: false,
			transactionDelayProtection: true,
			marketOrderSlippagePercent: 1,
		});
		expect(tabB.getSkipOrderConfirmation()).toBe(false);
	});

	it("ignores a storage event from session storage under the same key", () => {
		const before = tightenInTabA();
		deliverStorageEvent(1, before, window.sessionStorage);

		expect(tabB.getSkipOrderConfirmation()).toBe(true);
		expect(tabB.getTransactionDelayProtection()).toBe(false);

		deliverStorageEvent(1, before);

		expect(tabB.getSkipOrderConfirmation()).toBe(false);
		expect(tabB.getTransactionDelayProtection()).toBe(true);
	});

	it("does not write back when it only applies another window's settings", () => {
		const setItem = vi.spyOn(Storage.prototype, "setItem");
		const before = window.localStorage.getItem(KEY);
		tabAActions.setSkipOrderConfirmation(false);
		setItem.mockClear();
		deliverStorageEvent(1, before);

		expect(tabB.getSkipOrderConfirmation()).toBe(false);
		expect(setItem).not.toHaveBeenCalled();
	});
});
