// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { act, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FooterBar, type FooterBarMode } from "@/components/trade/footer/footer-bar";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	openCommandMenu: vi.fn(),
}));

const DOCUMENTATION_AND_LEGAL = "Documentation and legal";
const DOCUMENTATION_AND_LEGAL_AR = "الوثائق والمعلومات القانونية";
const arabicMessages: Messages = {
	[createHash("sha256").update(`${DOCUMENTATION_AND_LEGAL}\x1f`).digest("base64").slice(0, 6)]:
		DOCUMENTATION_AND_LEGAL_AR,
};

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

	it("retains both divider rules and supplies a visible runtime clock", () => {
		renderFooter("default");
		expect(container.querySelectorAll("footer .border-l")).toHaveLength(2);
		const clock = container.querySelector("footer .tabular-nums");
		expect(clock?.classList.contains("invisible")).toBe(false);
		expect(clock?.textContent).toMatch(/\d/);
	});

	it("retranslates the legal navigation landmark when the locale changes", () => {
		renderFooter("default");
		const navigation = container.querySelector("nav");
		expect(navigation?.getAttribute("aria-label")).toBe(DOCUMENTATION_AND_LEGAL);

		act(() => {
			i18n.loadAndActivate({ locale: "ar", messages: arabicMessages });
		});

		expect(navigation?.getAttribute("aria-label")).toBe(DOCUMENTATION_AND_LEGAL_AR);
	});
});
