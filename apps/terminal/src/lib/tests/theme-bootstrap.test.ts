// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "@/config/app";
import { buildRootHead } from "@/lib/seo";
import { getDocumentThemeColor, THEME_BOOTSTRAP_SCRIPT, THEME_COLORS } from "@/lib/theme-color";

function runBootstrap() {
	new Function(THEME_BOOTSTRAP_SCRIPT)();
}

function themeColorContents() {
	return [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) => meta.getAttribute("content"));
}

function persistTheme(value: string) {
	localStorage.setItem(STORAGE_KEYS.GLOBAL_SETTINGS, value);
}

describe("theme bootstrap script", () => {
	beforeEach(() => {
		document.documentElement.className = "dark";
		const prerenderedMeta = document.createElement("meta");
		prerenderedMeta.setAttribute("name", "theme-color");
		prerenderedMeta.setAttribute("content", THEME_COLORS.dark);
		document.head.append(prerenderedMeta);
	});

	afterEach(() => {
		localStorage.clear();
		for (const meta of document.head.querySelectorAll("meta")) meta.remove();
		document.documentElement.className = "";
	});

	it("uses the dark canvas and the light page background as the two theme colors", () => {
		expect(THEME_COLORS).toEqual({ dark: "#0F1A1F", light: "#FFFFFF" });
	});

	it("applies the persisted light theme to the class and the theme color before first paint", () => {
		persistTheme(JSON.stringify({ state: { theme: "light" }, version: 0 }));

		runBootstrap();

		expect(document.documentElement.classList.contains("light")).toBe(true);
		expect(document.documentElement.classList.contains("dark")).toBe(false);
		expect(themeColorContents()).toEqual(["#FFFFFF"]);
	});

	it.each([
		["a persisted dark theme", JSON.stringify({ state: { theme: "dark" }, version: 0 })],
		["settings without a theme", JSON.stringify({ state: {}, version: 0 })],
		["an unknown theme", JSON.stringify({ state: { theme: "sepia" }, version: 0 })],
		["corrupt settings", "{not json"],
	])("keeps the dark class and theme color for %s", (_case, persisted) => {
		persistTheme(persisted);
		document.documentElement.className = "light";
		document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS.light);

		runBootstrap();

		expect(document.documentElement.className).toBe("dark");
		expect(themeColorContents()).toEqual(["#0F1A1F"]);
	});

	it("keeps the dark theme color when nothing is persisted", () => {
		runBootstrap();

		expect(document.documentElement.className).toBe("dark");
		expect(themeColorContents()).toEqual(["#0F1A1F"]);
	});

	it("reads the global settings storage key the settings store persists to", () => {
		expect(THEME_BOOTSTRAP_SCRIPT).toContain(`localStorage.getItem("${STORAGE_KEYS.GLOBAL_SETTINGS}")`);
		expect(STORAGE_KEYS.GLOBAL_SETTINGS).toBe("global-settings-v2");
	});

	it.each(["light", "dark"] as const)(
		"gives the root head the theme color the bootstrap wrote for %s, so hydration claims the same tag",
		(theme) => {
			persistTheme(JSON.stringify({ state: { theme }, version: 0 }));

			runBootstrap();
			const hydratedHead = buildRootHead([], getDocumentThemeColor());
			const headThemeColor = hydratedHead.meta.find((meta) => meta.name === "theme-color")?.content;

			expect(headThemeColor).toBe(THEME_COLORS[theme]);
			expect(themeColorContents()).toEqual([headThemeColor]);
		},
	);

	it("follows the class on <html>, not the stored preference, when the root head is built", () => {
		persistTheme(JSON.stringify({ state: { theme: "light" }, version: 0 }));
		document.documentElement.className = "dark";

		expect(getDocumentThemeColor()).toBe("#0F1A1F");

		document.documentElement.className = "light";
		expect(getDocumentThemeColor()).toBe("#FFFFFF");
	});
});
