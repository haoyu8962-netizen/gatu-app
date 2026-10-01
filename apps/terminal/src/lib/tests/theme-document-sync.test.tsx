// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { THEME_COLORS } from "@/lib/theme-color";
import { useSetTheme } from "@/stores/use-global-settings-store";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_STYLES = readFileSync(resolve(TEST_DIR, "../..", "styles.css"), "utf8");
let setThemeRef: ReturnType<typeof useSetTheme> | null = null;

function ThemeProbe() {
	const setTheme = useSetTheme();
	useEffect(() => {
		setThemeRef = setTheme;
	}, [setTheme]);
	return null;
}

async function flushObservers() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

async function nextAnimationFrame() {
	await act(async () => {
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	});
}

async function flushThemeTransitionGuard() {
	await nextAnimationFrame();
	await nextAnimationFrame();
}

function addThemeColorMeta(content: string) {
	const meta = document.createElement("meta");
	meta.setAttribute("name", "theme-color");
	meta.setAttribute("content", content);
	document.head.append(meta);
}

function themeColorContents() {
	return [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) => meta.getAttribute("content"));
}

describe("document theme sync", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		addThemeColorMeta(THEME_COLORS.dark);
		act(() => root.render(<ThemeProbe />));
	});

	afterEach(async () => {
		act(() => setThemeRef?.("dark"));
		await flushObservers();
		await flushThemeTransitionGuard();
		act(() => root.unmount());
		container.remove();
		for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.remove();
	});

	it("does not suppress transitions during the initial document sync", () => {
		const html = document.documentElement;
		expect(html.classList.contains("dark")).toBe(true);
		expect(html.hasAttribute("data-theme-transition")).toBe(false);
	});

	it("re-asserts the persisted theme when the <html> class is clobbered", async () => {
		const html = document.documentElement;
		act(() => setThemeRef?.("light"));
		await flushObservers();
		expect(html.classList.contains("light")).toBe(true);

		html.className = "dark";
		await flushObservers();
		expect(html.classList.contains("light")).toBe(true);
		expect(html.classList.contains("dark")).toBe(false);
		expect(html.hasAttribute("data-theme-transition")).toBe(true);

		html.className = "";
		await flushObservers();
		expect(html.classList.contains("light")).toBe(true);
	});

	it("still follows explicit theme changes", async () => {
		const html = document.documentElement;
		act(() => setThemeRef?.("light"));
		await flushObservers();
		act(() => setThemeRef?.("dark"));
		await flushObservers();
		expect(html.classList.contains("dark")).toBe(true);
		expect(html.classList.contains("light")).toBe(false);
	});

	it("points the theme-color meta at each explicit theme change", async () => {
		act(() => setThemeRef?.("light"));
		await flushObservers();
		expect(themeColorContents()).toEqual(["#FFFFFF"]);

		act(() => setThemeRef?.("dark"));
		await flushObservers();
		expect(themeColorContents()).toEqual(["#0F1A1F"]);
	});

	it("re-syncs a stale theme-color tag when a shell re-render clobbers the <html> class", async () => {
		const html = document.documentElement;
		act(() => setThemeRef?.("light"));
		await flushObservers();

		addThemeColorMeta(THEME_COLORS.dark);
		html.className = "dark";
		await flushObservers();

		expect(html.classList.contains("light")).toBe(true);
		expect(themeColorContents()).toEqual(["#FFFFFF", "#FFFFFF"]);
	});

	it("re-syncs a stale theme-color tag even when the theme class is already correct", async () => {
		const html = document.documentElement;
		act(() => setThemeRef?.("light"));
		await flushObservers();

		addThemeColorMeta(THEME_COLORS.dark);
		html.classList.add("unrelated-class");
		await flushObservers();
		html.classList.remove("unrelated-class");
		await flushObservers();

		expect(html.classList.contains("light")).toBe(true);
		expect(themeColorContents()).toEqual(["#FFFFFF", "#FFFFFF"]);
	});

	it("suppresses transitions until the switched theme has painted", async () => {
		const html = document.documentElement;
		act(() => setThemeRef?.("light"));

		expect(html.classList.contains("light")).toBe(true);
		expect(html.hasAttribute("data-theme-transition")).toBe(true);

		await nextAnimationFrame();
		expect(html.hasAttribute("data-theme-transition")).toBe(true);

		await nextAnimationFrame();
		expect(html.hasAttribute("data-theme-transition")).toBe(false);
	});

	it("restarts the guard window for rapid consecutive theme changes", async () => {
		const html = document.documentElement;
		act(() => setThemeRef?.("light"));
		await nextAnimationFrame();

		act(() => setThemeRef?.("dark"));
		await nextAnimationFrame();
		expect(html.classList.contains("dark")).toBe(true);
		expect(html.hasAttribute("data-theme-transition")).toBe(true);

		await nextAnimationFrame();
		expect(html.hasAttribute("data-theme-transition")).toBe(false);
	});

	it("disables transitions for the document, descendants, and their pseudo-elements", () => {
		expect(TERMINAL_STYLES).toContain(`html[data-theme-transition],
  html[data-theme-transition]::before,
  html[data-theme-transition]::after,
  html[data-theme-transition] *,
  html[data-theme-transition] *::before,
  html[data-theme-transition] *::after {
    transition-property: none !important;
  }`);
	});
});
