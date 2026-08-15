// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSetTheme } from "@/stores/use-global-settings-store";

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

describe("document theme sync", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		act(() => root.render(<ThemeProbe />));
	});

	afterEach(async () => {
		act(() => setThemeRef?.("dark"));
		await flushObservers();
		act(() => root.unmount());
		container.remove();
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
});
