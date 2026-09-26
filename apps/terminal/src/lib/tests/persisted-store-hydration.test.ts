// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreApi } from "zustand";
import { STORAGE_KEYS } from "@/config/app";
import { defaultNumberFormatLocale } from "@/config/i18n";

interface PersistedStore extends StoreApi<object> {
	persist: {
		hasHydrated: () => boolean;
		rehydrate: () => Promise<void> | void;
		onFinishHydration: (listener: (state: object) => void) => () => void;
	};
}

interface PersistedStoreCase {
	name: string;
	file: string;
	key: string;
	load: () => Promise<unknown>;
}

interface UnmigratedStoreCase extends PersistedStoreCase {
	foreignVersionPayload: { state: object; version: number };
}

const persistedStores = vi.hoisted(() => new Map<string, PersistedStore>());

vi.mock("zustand/middleware", async (importOriginal) => {
	const actual = await importOriginal<typeof import("zustand/middleware")>();
	const persist: typeof actual.persist = (initializer, options) => (set, get, api) => {
		const state = actual.persist(initializer, options)(set, get, api);
		persistedStores.set(options.name, api as unknown as PersistedStore);
		return state;
	};
	return { ...actual, persist };
});

const TERMINAL_SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PERSIST_IMPORT = /import\s*\{[^}]*\bpersist\b[^}]*\}\s*from\s*"zustand\/middleware"/;
const ZUSTAND_UNMIGRATED_VERSION_ERROR =
	"State loaded from storage couldn't be migrated since no migrate function was provided";

const GLOBAL_SETTINGS_STORE: PersistedStoreCase = {
	name: "global settings",
	file: "stores/use-global-settings-store.ts",
	key: STORAGE_KEYS.GLOBAL_SETTINGS,
	load: () => import("@/stores/use-global-settings-store"),
};

const HIP3_DISCLAIMER_STORE: UnmigratedStoreCase = {
	name: "HIP-3 disclaimer",
	file: "stores/use-hip3-disclaimer-store.ts",
	key: STORAGE_KEYS.HIP3_DISCLAIMER,
	load: () => import("@/stores/use-hip3-disclaimer-store"),
	foreignVersionPayload: { state: { acceptedVersion: 1 }, version: 2 },
};

const UNMIGRATED_STORES: UnmigratedStoreCase[] = [
	HIP3_DISCLAIMER_STORE,
	{
		name: "market",
		file: "stores/use-market-store.ts",
		key: STORAGE_KEYS.MARKET_PREFS,
		load: () => import("@/stores/use-market-store"),
		foreignVersionPayload: { state: { favoriteMarkets: ["ETH"] }, version: 2 },
	},
	{
		name: "order entry",
		file: "stores/use-order-entry-store.ts",
		key: STORAGE_KEYS.ORDER_ENTRY,
		load: () => import("@/stores/use-order-entry-store"),
		foreignVersionPayload: { state: { side: "sell" }, version: 1 },
	},
];

const PERSISTED_STORES: PersistedStoreCase[] = [GLOBAL_SETTINGS_STORE, ...UNMIGRATED_STORES];

async function loadPersistedStore({ key, load }: PersistedStoreCase, stored?: string): Promise<PersistedStore> {
	localStorage.clear();
	if (stored !== undefined) localStorage.setItem(key, stored);
	persistedStores.clear();
	vi.resetModules();
	await load();
	const store = persistedStores.get(key);
	if (!store) throw new Error(`No persisted store was created under ${key}`);
	return store;
}

function findPersistedStoreFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = resolve(directory, entry.name);
		if (entry.isDirectory()) return entry.name === "tests" ? [] : findPersistedStoreFiles(entryPath);
		if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
		return PERSIST_IMPORT.test(readFileSync(entryPath, "utf8")) ? [relative(TERMINAL_SOURCE_ROOT, entryPath)] : [];
	});
}

describe("persisted store hydration", () => {
	beforeEach(() => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		persistedStores.clear();
		localStorage.clear();
		vi.resetModules();
	});

	it("covers every store that persists through zustand", () => {
		expect(
			findPersistedStoreFiles(TERMINAL_SOURCE_ROOT).sort(),
			"a new persisted store needs a case here, because zustand passes its merge undefined on a first visit",
		).toEqual(PERSISTED_STORES.map((store) => store.file).sort());
	});

	it.each(PERSISTED_STORES)("finishes hydrating the $name store on a first visit", async (storeCase) => {
		const store = await loadPersistedStore(storeCase);

		expect(store.persist.hasHydrated()).toBe(true);
		expect(store.getState()).toEqual(store.getInitialState());
		expect(localStorage.getItem(storeCase.key)).toBeNull();

		const onFinishHydration = vi.fn();
		store.persist.onFinishHydration(onFinishHydration);
		await store.persist.rehydrate();

		expect(onFinishHydration).toHaveBeenCalledTimes(1);
		expect(store.persist.hasHydrated()).toBe(true);
	});

	it.each(PERSISTED_STORES)(
		"finishes hydrating the $name store after invalid stored data is cleared",
		async (storeCase) => {
			const store = await loadPersistedStore(storeCase, JSON.stringify({ state: null }));

			expect(console.warn).toHaveBeenCalledWith(
				expect.stringContaining("failed schema validation, clearing"),
				expect.anything(),
			);
			expect(localStorage.getItem(storeCase.key)).toBeNull();
			expect(store.persist.hasHydrated()).toBe(true);
			expect(store.getState()).toEqual(store.getInitialState());
		},
	);

	it.each(UNMIGRATED_STORES)(
		"finishes hydrating the $name store with its defaults when the stored version differs",
		async (storeCase) => {
			const store = await loadPersistedStore(storeCase, JSON.stringify(storeCase.foreignVersionPayload));

			expect(console.error).toHaveBeenCalledWith(ZUSTAND_UNMIGRATED_VERSION_ERROR);
			expect(store.persist.hasHydrated()).toBe(true);
			expect(store.getState()).toEqual(store.getInitialState());
		},
	);

	it("keeps the global settings defaults on a first visit", async () => {
		await loadPersistedStore(GLOBAL_SETTINGS_STORE);
		const { getNumberFormatLocale, getPositionsActiveTab, getSkipOrderConfirmation } = await import(
			"@/stores/use-global-settings-store"
		);

		expect(getSkipOrderConfirmation()).toBe(false);
		expect(getNumberFormatLocale()).toBe(defaultNumberFormatLocale);
		expect(getPositionsActiveTab()).toBe("positions");
	});

	it("keeps the HIP-3 disclaimer unaccepted when a stored acceptance has another version", async () => {
		await loadPersistedStore(HIP3_DISCLAIMER_STORE, JSON.stringify(HIP3_DISCLAIMER_STORE.foreignVersionPayload));
		const { hasAcceptedHip3Disclaimer } = await import("@/stores/use-hip3-disclaimer-store");

		expect(hasAcceptedHip3Disclaimer()).toBe(false);
	});
});
