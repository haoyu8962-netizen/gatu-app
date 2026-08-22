// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, type ReactNode, useEffect } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/trade/header/theme-toggle";
import { useGlobalSettingsActions } from "@/stores/use-global-settings-store";
import { createI18nRoot } from "./harness/react";

vi.mock("@tanstack/react-router", () => ({
	ClientOnly: ({ children }: { children: ReactNode }) => children,
}));

function ThemeReset() {
	const { setTheme } = useGlobalSettingsActions();
	useEffect(() => setTheme("dark"), [setTheme]);
	return null;
}

describe("ThemeToggle", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(<ThemeReset />));
		act(() => root.render(<ThemeToggle />));
	});

	afterEach(() => {
		act(() => root.render(<ThemeReset />));
		act(() => root.unmount());
		container.remove();
	});

	it("switches themes without applying the shared pressed-scale transform", () => {
		const button = container.querySelector<HTMLButtonElement>('button[aria-label="Switch to light mode"]');
		expect(button).not.toBeNull();
		expect(button?.className).toContain("active:not-data-disabled:scale-100");
		expect(button?.className).not.toContain("active:not-data-disabled:scale-[0.97]");

		act(() => button?.click());

		expect(container.querySelector('button[aria-label="Switch to dark mode"]')).not.toBeNull();
	});
});
