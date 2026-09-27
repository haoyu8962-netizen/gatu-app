// @vitest-environment jsdom

import { act, createElement, Fragment, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hip3DeployerDisclaimer } from "@/components/trade/components/hip3-deployer-disclaimer";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	accept: vi.fn(),
	isMobile: false,
}));

const XYZ_DOCUMENTATION_URL = "https://docs.trade.xyz/consolidated-resources/specification-index";

function renderChildren(children: ReactNode) {
	return createElement(Fragment, null, children);
}

vi.mock("@lingui/react/macro", () => ({
	Trans: ({ children }: { children: ReactNode }) => renderChildren(children),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) =>
		createElement("a", { href: to, ...props }, children),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@/stores/use-hip3-disclaimer-store", () => ({
	useHip3DisclaimerActions: () => ({ accept: testState.accept }),
}));

function findButton(label: string): HTMLButtonElement | undefined {
	const button = [...document.body.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
	return button instanceof HTMLButtonElement ? button : undefined;
}

function getButton(label: string): HTMLButtonElement {
	const button = findButton(label);
	if (!button) throw new Error(`${label} button not found`);
	return button;
}

function dispatchEscape() {
	act(() => {
		document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
	});
}

function getAcknowledgementCheckbox(): HTMLElement {
	const checkbox = document.body.querySelector('[role="checkbox"]');
	if (!(checkbox instanceof HTMLElement)) throw new Error("Acknowledgement checkbox not found");
	return checkbox;
}

describe("Hip3DeployerDisclaimer", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({
				addEventListener: vi.fn(),
				matches: false,
				removeEventListener: vi.fn(),
			}),
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		testState.accept.mockReset();
		testState.isMobile = false;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("blocks dismissal on the trade page, exits through Leave this market and confirms only after acknowledgement", () => {
		const onExit = vi.fn();
		act(() => {
			root.render(
				createElement(Hip3DeployerDisclaimer, {
					open: true,
					documentationUrl: XYZ_DOCUMENTATION_URL,
					exit: "leave-market",
					onExit,
				}),
			);
		});

		const dialog = document.body.querySelector('[role="dialog"]');
		expect(dialog?.classList.contains("relative")).toBe(true);
		expect(dialog?.classList.contains("!shadow-none")).toBe(true);
		expect(document.body.querySelector(".backdrop-blur-\\[2px\\]")).not.toBeNull();
		expect(document.body.querySelector('button[aria-label="Close"]')).toBeNull();
		expect(document.body.querySelector("h2")?.classList.contains("font-normal")).toBe(true);
		const modalContent = document.body.querySelector(".space-y-3");
		expect(modalContent).not.toBeNull();
		const bodyParagraphs = modalContent?.querySelectorAll(":scope > p") ?? [];
		expect(bodyParagraphs).toHaveLength(3);
		for (const paragraph of bodyParagraphs) {
			expect(paragraph.classList.contains("text-fg")).toBe(true);
			expect(paragraph.classList.contains("text-fg-muted")).toBe(false);
			expect(paragraph.classList.contains("leading-4")).toBe(true);
		}
		expect(document.body.querySelector("label .text-fg-muted")).not.toBeNull();
		expect(getButton("Confirm").disabled).toBe(true);
		expect(getButton("Confirm").classList.contains("h-10")).toBe(true);
		const documentationLink = document.body.querySelector(`a[href="${XYZ_DOCUMENTATION_URL}"]`);
		const termsLink = document.body.querySelector('a[href="/terms"]');
		expect(documentationLink?.classList.contains("text-signal")).toBe(true);
		expect(termsLink?.classList.contains("text-signal")).toBe(true);

		expect(findButton("Cancel")).toBeUndefined();
		act(() => getButton("Leave this market").click());
		expect(onExit).toHaveBeenCalledOnce();

		const checkbox = getAcknowledgementCheckbox();
		expect(checkbox.getAttribute("aria-checked")).toBe("false");
		act(() => checkbox.click());

		expect(checkbox.getAttribute("aria-checked")).toBe("true");
		expect(getButton("Confirm").disabled).toBe(false);
		act(() => getButton("Confirm").click());
		expect(testState.accept).toHaveBeenCalledOnce();
	});

	it("uses a bottom drawer and lets the acknowledgement label confirm on mobile", () => {
		testState.isMobile = true;

		act(() => {
			root.render(
				createElement(Hip3DeployerDisclaimer, {
					open: true,
					documentationUrl: undefined,
					exit: "leave-market",
					onExit: vi.fn(),
				}),
			);
		});

		const dialog = document.body.querySelector('[role="dialog"]');
		expect(dialog?.classList.contains("fixed")).toBe(true);
		expect(dialog?.className).toContain("rounded-t-32");
		expect(dialog?.className).not.toContain("min-[1000px]");
		expect(document.body.querySelector('button[aria-label="Close"]')).toBeNull();
		expect(document.body.querySelectorAll('a[target="_blank"]')).toHaveLength(1);
		expect(document.body.querySelector('a[href="/terms"]')).not.toBeNull();
		expect(getButton("Leave this market")).toBeDefined();

		const checkbox = getAcknowledgementCheckbox();
		const label = checkbox.closest("label");
		if (!(label instanceof HTMLLabelElement)) throw new Error("Acknowledgement label not found");
		expect(getButton("Confirm").disabled).toBe(true);
		act(() => label.click());

		expect(checkbox.getAttribute("aria-checked")).toBe("true");
		expect(getButton("Confirm").disabled).toBe(false);
		act(() => getButton("Confirm").click());
		expect(testState.accept).toHaveBeenCalledOnce();
	});

	it("ends a position flow through its Cancel button", () => {
		const onExit = vi.fn();

		act(() => {
			root.render(
				createElement(Hip3DeployerDisclaimer, {
					open: true,
					documentationUrl: undefined,
					exit: "cancel",
					onExit,
				}),
			);
		});

		expect(document.body.querySelector('button[aria-label="Close"]')).toBeNull();
		expect(findButton("Leave this market")).toBeUndefined();
		act(() => getButton("Cancel").click());
		expect(onExit).toHaveBeenCalledOnce();
		expect(testState.accept).not.toHaveBeenCalled();
	});

	it.each([
		["desktop modal", false],
		["phone drawer", true],
	])("keeps the trade-page copy open on Escape in the %s", (_presentation, isMobile) => {
		testState.isMobile = isMobile;
		const onExit = vi.fn();
		act(() => {
			root.render(
				createElement(Hip3DeployerDisclaimer, {
					open: true,
					documentationUrl: undefined,
					exit: "leave-market",
					onExit,
				}),
			);
		});

		dispatchEscape();
		expect(onExit).not.toHaveBeenCalled();
		expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
	});

	it.each([
		["desktop modal", false],
		["phone drawer", true],
	])("ends the position flow on Escape in the %s", (_presentation, isMobile) => {
		testState.isMobile = isMobile;
		const onExit = vi.fn();
		act(() => {
			root.render(
				createElement(Hip3DeployerDisclaimer, {
					open: true,
					documentationUrl: undefined,
					exit: "cancel",
					onExit,
				}),
			);
		});

		dispatchEscape();
		expect(onExit).toHaveBeenCalledOnce();
		expect(testState.accept).not.toHaveBeenCalled();
	});
});
