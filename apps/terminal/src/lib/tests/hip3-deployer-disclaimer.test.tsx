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

function getConfirmButton(): HTMLButtonElement {
	const button = [...document.body.querySelectorAll("button")].find((candidate) => candidate.textContent === "Confirm");
	if (!(button instanceof HTMLButtonElement)) throw new Error("Confirm button not found");
	return button;
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

	it("blocks dismissal and confirmation until the acknowledgement is checked", () => {
		act(() => {
			root.render(
				createElement(Hip3DeployerDisclaimer, {
					documentationUrl: "https://docs.trade.xyz/consolidated-resources/specification-index",
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
		expect(getConfirmButton().disabled).toBe(true);
		expect(getConfirmButton().classList.contains("h-10")).toBe(true);
		const documentationLink = document.body.querySelector(
			'a[href="https://docs.trade.xyz/consolidated-resources/specification-index"]',
		);
		const termsLink = document.body.querySelector('a[href="/terms"]');
		expect(documentationLink?.classList.contains("text-signal")).toBe(true);
		expect(termsLink?.classList.contains("text-signal")).toBe(true);

		const checkbox = getAcknowledgementCheckbox();
		expect(checkbox.getAttribute("aria-checked")).toBe("false");
		act(() => checkbox.click());

		expect(checkbox.getAttribute("aria-checked")).toBe("true");
		expect(getConfirmButton().disabled).toBe(false);
		act(() => getConfirmButton().click());
		expect(testState.accept).toHaveBeenCalledOnce();
	});

	it("uses a bottom drawer and lets the acknowledgement label confirm on mobile", () => {
		testState.isMobile = true;

		act(() => {
			root.render(createElement(Hip3DeployerDisclaimer, { documentationUrl: undefined }));
		});

		const dialog = document.body.querySelector('[role="dialog"]');
		expect(dialog?.classList.contains("fixed")).toBe(true);
		expect(dialog?.className).toContain("rounded-t-32");
		expect(dialog?.className).not.toContain("min-[1000px]");
		expect(document.body.querySelectorAll('a[target="_blank"]')).toHaveLength(1);
		expect(document.body.querySelector('a[href="/terms"]')).not.toBeNull();

		const checkbox = getAcknowledgementCheckbox();
		const label = checkbox.closest("label");
		if (!(label instanceof HTMLLabelElement)) throw new Error("Acknowledgement label not found");
		expect(getConfirmButton().disabled).toBe(true);
		act(() => label.click());

		expect(checkbox.getAttribute("aria-checked")).toBe("true");
		expect(getConfirmButton().disabled).toBe(false);
		act(() => getConfirmButton().click());
		expect(testState.accept).toHaveBeenCalledOnce();
	});

	it("allows an action-scoped disclaimer to cancel the pending market-close flow", () => {
		const onCancel = vi.fn();

		act(() => {
			root.render(createElement(Hip3DeployerDisclaimer, { documentationUrl: undefined, onCancel }));
		});

		expect(document.body.querySelector('button[aria-label="Close"]')).not.toBeNull();
		const cancelButton = [...document.body.querySelectorAll("button")].find(
			(candidate) => candidate.textContent === "Cancel",
		);
		if (!(cancelButton instanceof HTMLButtonElement)) throw new Error("Cancel button not found");
		act(() => cancelButton.click());
		expect(onCancel).toHaveBeenCalledOnce();
	});
});
