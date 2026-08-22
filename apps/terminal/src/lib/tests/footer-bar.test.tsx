// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FooterBar, type FooterBarMode } from "@/components/trade/footer/footer-bar";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	openCommandMenu: vi.fn(),
}));

vi.mock("@gatu/ui", () => ({
	Divider: ({ className }: { className?: string }) => <hr className={className} />,
}));

vi.mock("@phosphor-icons/react", () => ({
	SpinnerGapIcon: ({ className }: { className?: string }) => <span aria-hidden className={className} />,
	WifiHighIcon: ({ className }: { className?: string }) => <span aria-hidden className={className} />,
	WifiSlashIcon: ({ className }: { className?: string }) => <span aria-hidden className={className} />,
}));

vi.mock("@tanstack/react-router", () => ({
	ClientOnly: ({ children }: { children: ReactNode }) => children,
	Link: ({ children, className, to }: { children: ReactNode; className?: string; to: string }) => (
		<a className={className} href={to}>
			{children}
		</a>
	),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useApiStatus: () => ({ status: "connecting", error: undefined }),
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useCommandMenuActions: () => ({ open: testState.openCommandMenu }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("FooterBar", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		testState.openCommandMenu.mockReset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderFooter(mode: FooterBarMode) {
		act(() => root.render(<FooterBar mode={mode} />));
	}

	function getCommandButton(): HTMLButtonElement {
		const button = container.querySelector<HTMLButtonElement>('button[aria-label="Open command menu"]');
		if (!button) throw new Error("Expected the command menu button");
		return button;
	}

	function expectStatusAndLinks() {
		expect(container.textContent).toContain("Connecting");
		expect(container.querySelector(".animate-spin")).not.toBeNull();

		expect(
			[...container.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Documentation and legal"] a')].map((link) => [
				link.textContent?.trim(),
				link.getAttribute("href"),
			]),
		).toEqual([
			["Docs", "/docs"],
			["Support", "/support"],
			["Terms", "/terms"],
			["Privacy Policy", "/privacy"],
			["Risk Disclosure", "/risk"],
		]);
	}

	it("keeps the live API status and legal links while disabling the command menu during market loading", () => {
		renderFooter("market-loading");

		expectStatusAndLinks();
		const commandButton = getCommandButton();
		expect(commandButton.textContent).toContain("⌘K");
		expect(commandButton.disabled).toBe(true);

		act(() => commandButton.focus());
		expect(document.activeElement).not.toBe(commandButton);
		act(() => commandButton.click());
		expect(testState.openCommandMenu).not.toHaveBeenCalled();
	});

	it("opens the command menu once in the default mode without hiding status or legal links", () => {
		renderFooter("default");

		expectStatusAndLinks();
		const commandButton = getCommandButton();
		expect(commandButton.disabled).toBe(false);

		act(() => commandButton.click());
		expect(testState.openCommandMenu).toHaveBeenCalledTimes(1);
	});
});
