// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { act, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FooterBar, type FooterBarMode } from "@/components/trade/footer/footer-bar";
import { formatTime } from "@/lib/format";
import { LOADING_INDICATOR_SELECTOR } from "./harness/loading-indicator";
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

vi.mock("@sairn/ui", () => ({
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

vi.mock("@/lib/format", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/format")>();
	return { ...actual, formatTime: vi.fn(actual.formatTime) };
});

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
		expect(container.querySelector(LOADING_INDICATOR_SELECTOR)).not.toBeNull();

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

	describe("clock", () => {
		let pageVisibility: DocumentVisibilityState;

		beforeEach(() => {
			pageVisibility = "visible";
			vi.spyOn(document, "visibilityState", "get").mockImplementation(() => pageVisibility);
			vi.useFakeTimers({ now: new Date(2026, 9, 2, 14, 31, 30) });
		});

		afterEach(() => {
			act(() => root.unmount());
			vi.useRealTimers();
			vi.restoreAllMocks();
		});

		function readClock(): string {
			const clock = container.querySelector("footer .tabular-nums");
			if (!clock) throw new Error("Expected the footer clock");
			return clock.textContent?.replace(/\s+/g, " ") ?? "";
		}

		function setPageVisibility(visibility: DocumentVisibilityState) {
			pageVisibility = visibility;
			act(() => document.dispatchEvent(new Event("visibilitychange")));
		}

		it("advances when each minute begins", () => {
			renderFooter("default");
			expect(readClock()).toBe("2:31 PM");

			act(() => vi.advanceTimersByTime(29_999));
			expect(readClock()).toBe("2:31 PM");

			act(() => vi.advanceTimersByTime(1));
			expect(readClock()).toBe("2:32 PM");

			act(() => vi.advanceTimersByTime(60_000));
			expect(readClock()).toBe("2:33 PM");
			expect(vi.getTimerCount()).toBe(1);
		});

		it("keeps one snapshot for the whole minute, so a notification inside it renders nothing", () => {
			renderFooter("default");
			const formattedTimes = vi.mocked(formatTime).mock.calls.length;

			act(() => vi.advanceTimersByTime(20_000));
			setPageVisibility("visible");

			expect(vi.mocked(formatTime).mock.calls.length).toBe(formattedTimes);
			expect(readClock()).toBe("2:31 PM");
		});

		it("waits for the minute boundary on the wall clock when the clock is set back", () => {
			renderFooter("default");
			act(() => vi.advanceTimersByTime(10_000));
			act(() => vi.setSystemTime(new Date(2026, 9, 2, 14, 31, 20)));

			act(() => vi.advanceTimersByTime(20_000));
			expect(readClock()).toBe("2:31 PM");

			act(() => vi.advanceTimersByTime(19_999));
			expect(readClock()).toBe("2:31 PM");

			act(() => vi.advanceTimersByTime(1));
			expect(readClock()).toBe("2:32 PM");
		});

		it("reformats the current minute in the interface language with Latin digits", () => {
			renderFooter("default");
			expect(readClock()).toBe("2:31 PM");

			act(() => i18n.loadAndActivate({ locale: "zh", messages: {} }));
			expect(readClock()).toBe("14:31");

			act(() => i18n.loadAndActivate({ locale: "ar", messages: {} }));
			expect(readClock()).toBe("2:31 م");
			expect(readClock()).not.toMatch(/[٠-٩]/);
		});

		it("keeps no timer while the page is hidden and catches up when it is shown again", () => {
			renderFooter("default");
			expect(vi.getTimerCount()).toBe(1);

			setPageVisibility("hidden");
			expect(vi.getTimerCount()).toBe(0);

			act(() => vi.setSystemTime(new Date(2026, 9, 2, 14, 36, 10)));
			expect(readClock()).toBe("2:31 PM");

			setPageVisibility("visible");
			expect(readClock()).toBe("2:36 PM");
			expect(vi.getTimerCount()).toBe(1);

			act(() => vi.advanceTimersByTime(50_000));
			expect(readClock()).toBe("2:37 PM");
		});

		it("shows the current minute when mounted in a hidden page and releases its timer on unmount", () => {
			pageVisibility = "hidden";
			act(() => vi.setSystemTime(new Date(2026, 9, 2, 9, 5, 0)));
			renderFooter("default");
			expect(readClock()).toBe("9:05 AM");
			expect(vi.getTimerCount()).toBe(0);

			setPageVisibility("visible");
			expect(vi.getTimerCount()).toBe(1);

			act(() => root.unmount());
			expect(vi.getTimerCount()).toBe(0);
		});
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
