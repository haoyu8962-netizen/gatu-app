/** @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/config/app";
import { marketOrderSlippagePercentToBpsString } from "@/stores/use-global-settings-store";

const GLOBAL_SETTINGS_VERSION = 4;

type GlobalSettingsModule = typeof import("@/stores/use-global-settings-store");

async function loadStore(persisted?: unknown): Promise<GlobalSettingsModule> {
	window.localStorage.clear();
	if (persisted !== undefined) {
		window.localStorage.setItem(STORAGE_KEYS.GLOBAL_SETTINGS, JSON.stringify(persisted));
	}
	vi.resetModules();
	return await import("@/stores/use-global-settings-store");
}

describe("global settings market-order slippage", () => {
	it.each([
		[0.1, "10"],
		[0.29, "29"],
		[0.57, "57"],
		[2.5, "250"],
		[5, "500"],
	])("converts %s percent to an exact basis-point string", (percent, expected) => {
		expect(marketOrderSlippagePercentToBpsString(percent)).toBe(expected);
	});
});

describe("global settings order-confirmation preference", () => {
	beforeEach(() => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		window.localStorage.clear();
		vi.resetModules();
	});

	it("keeps the order confirmation on by default", async () => {
		const store = await loadStore();

		expect(store.getSkipOrderConfirmation()).toBe(false);
	});

	it("restores a persisted opt-out", async () => {
		const store = await loadStore({
			state: { skipOrderConfirmation: true },
			version: GLOBAL_SETTINGS_VERSION,
		});

		expect(store.getSkipOrderConfirmation()).toBe(true);
	});

	it.each([["yes"], [1], [null]])("falls back to confirming when the persisted value is %p", async (value) => {
		const store = await loadStore({
			state: { skipOrderConfirmation: value },
			version: GLOBAL_SETTINGS_VERSION,
		});

		expect(store.getSkipOrderConfirmation()).toBe(false);
	});

	it("carries a version-3 payload through the version bump", async () => {
		const store = await loadStore({
			state: { skipOrderConfirmation: true, numberFormatLocale: "de-DE" },
			version: 3,
		});

		expect(store.getSkipOrderConfirmation()).toBe(true);
		expect(store.getNumberFormatLocale()).toBe("de-DE");
	});

	it("persists the opt-out under the current store version", async () => {
		await loadStore({ state: { skipOrderConfirmation: true }, version: 3 });

		const raw = window.localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS);
		const persisted = JSON.parse(raw ?? "{}") as { version?: number; state?: { skipOrderConfirmation?: boolean } };

		expect(persisted.version).toBe(GLOBAL_SETTINGS_VERSION);
		expect(persisted.state?.skipOrderConfirmation).toBe(true);
	});
});

describe("global settings order-book animations", () => {
	let container: HTMLDivElement;
	let root: Root | undefined;

	beforeEach(() => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		container = document.createElement("div");
		document.body.append(container);
	});

	afterEach(() => {
		act(() => root?.unmount());
		root = undefined;
		container.remove();
		vi.restoreAllMocks();
		window.localStorage.clear();
		vi.resetModules();
	});

	function renderPreference(store: GlobalSettingsModule) {
		function Preference() {
			const enabled = store.useAnimateOrderbook();
			const { setAnimateOrderbook } = store.useGlobalSettingsActions();
			return createElement("button", {
				type: "button",
				role: "switch",
				"aria-checked": enabled,
				onClick: () => setAnimateOrderbook(!enabled),
			});
		}
		root = createRoot(container);
		act(() => root?.render(createElement(Preference)));
		const toggle = container.querySelector("button");
		if (!toggle) throw new Error("Missing animation preference toggle");
		return toggle;
	}

	it("enables animations by default", async () => {
		const toggle = renderPreference(await loadStore());

		expect(toggle.getAttribute("aria-checked")).toBe("true");
	});

	it("restores a persisted disabled preference", async () => {
		const toggle = renderPreference(
			await loadStore({
				state: { animateOrderbook: false },
				version: GLOBAL_SETTINGS_VERSION,
			}),
		);

		expect(toggle.getAttribute("aria-checked")).toBe("false");
	});

	it.each([3, GLOBAL_SETTINGS_VERSION])(
		"defaults the missing field in version %s without resetting existing preferences",
		async (version) => {
			const store = await loadStore({ state: { numberFormatLocale: "de-DE", skipOrderConfirmation: true }, version });
			const toggle = renderPreference(store);

			expect(toggle.getAttribute("aria-checked")).toBe("true");
			expect(store.getNumberFormatLocale()).toBe("de-DE");
			expect(store.getSkipOrderConfirmation()).toBe(true);
		},
	);

	it.each(["false", 0, null])("falls back to enabled for invalid stored data %p", async (animateOrderbook) => {
		const toggle = renderPreference(
			await loadStore({
				state: { animateOrderbook },
				version: GLOBAL_SETTINGS_VERSION,
			}),
		);

		expect(toggle.getAttribute("aria-checked")).toBe("true");
		expect(window.localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS)).toBeNull();
	});

	it("persists both changes made by the real setting action and restores disabled after reload", async () => {
		const toggle = renderPreference(await loadStore());
		act(() => toggle.click());

		expect(toggle.getAttribute("aria-checked")).toBe("false");
		let persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS) ?? "{}");
		expect(persisted.version).toBe(GLOBAL_SETTINGS_VERSION);
		expect(persisted.state.animateOrderbook).toBe(false);

		act(() => toggle.click());

		expect(toggle.getAttribute("aria-checked")).toBe("true");
		persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS) ?? "{}");
		expect(persisted.state.animateOrderbook).toBe(true);

		act(() => toggle.click());
		persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS) ?? "{}");
		act(() => root?.unmount());
		root = undefined;
		const restoredToggle = renderPreference(await loadStore(persisted));

		expect(restoredToggle.getAttribute("aria-checked")).toBe("false");
	});
});
