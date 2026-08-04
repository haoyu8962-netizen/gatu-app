// @vitest-environment jsdom

import { act, createElement, Fragment, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({
		children,
		className,
		dismissible,
		layer,
		open,
		overlayClassName,
		presentation,
		showClose,
	}: {
		children: ReactNode;
		className?: string;
		dismissible: boolean;
		layer: string;
		open: boolean;
		overlayClassName?: string;
		presentation: string;
		showClose: boolean;
	}) =>
		open
			? createElement(
					"div",
					{
						"data-dismissible": String(dismissible),
						"data-layer": layer,
						"data-overlay-class": overlayClassName,
						"data-presentation": presentation,
						"data-show-close": String(showClose),
						className,
						role: "dialog",
					},
					children,
				)
			: null,
	Button: ({
		children,
		className,
		disabled,
		onClick,
	}: {
		children: ReactNode;
		className?: string;
		disabled?: boolean;
		onClick?: () => void;
	}) => createElement("button", { className, disabled, onClick, type: "button" }, children),
	Checkbox: ({
		checked,
		label,
		onCheckedChange,
	}: {
		checked: boolean;
		label: ReactNode;
		onCheckedChange: (checked: boolean) => void;
	}) =>
		createElement(
			"label",
			null,
			createElement("input", {
				checked,
				onChange: (event: { currentTarget: { checked: boolean } }) => onCheckedChange(event.currentTarget.checked),
				type: "checkbox",
			}),
			label,
		),
	ModalContent: ({ children, className }: { children: ReactNode; className?: string }) =>
		createElement("div", { className, "data-slot": "content" }, children),
	ModalDescription: ({ children, className }: { children: ReactNode; className?: string }) =>
		createElement("p", { className }, children),
	ModalFooter: ({ children, className }: { children: ReactNode; className?: string }) =>
		createElement("footer", { className }, children),
	ModalHeader: ({ children, className }: { children: ReactNode; className?: string }) =>
		createElement("header", { className }, children),
	ModalTitle: ({ children, className }: { children: ReactNode; className?: string }) =>
		createElement("h2", { className }, children),
}));

function getConfirmButton(container: HTMLElement): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === "Confirm");
	if (!(button instanceof HTMLButtonElement)) throw new Error("Confirm button not found");
	return button;
}

describe("Hip3DeployerDisclaimer", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
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

	it("blocks dismissal and confirmation until the acknowledgement is checked", async () => {
		const { Hip3DeployerDisclaimer } = await import("@/components/trade/components/hip3-deployer-disclaimer");

		act(() => {
			root.render(
				createElement(Hip3DeployerDisclaimer, {
					documentationUrl: "https://docs.trade.xyz/consolidated-resources/specification-index",
				}),
			);
		});

		const dialog = container.querySelector('[role="dialog"]');
		expect(dialog?.getAttribute("data-dismissible")).toBe("false");
		expect(dialog?.getAttribute("data-layer")).toBe("blocking");
		expect(dialog?.getAttribute("data-show-close")).toBe("false");
		expect(dialog?.getAttribute("data-presentation")).toBe("modal");
		expect(dialog?.getAttribute("data-overlay-class")).toContain("backdrop-blur-[2px]");
		expect(dialog?.classList.contains("!shadow-none")).toBe(true);
		expect(container.querySelector("h2")?.classList.contains("font-normal")).toBe(true);
		expect(container.querySelector('[data-slot="content"]')?.classList.contains("space-y-3")).toBe(true);
		const bodyParagraphs = container.querySelectorAll('[data-slot="content"] > p');
		expect(bodyParagraphs).toHaveLength(3);
		for (const paragraph of bodyParagraphs) {
			expect(paragraph.classList.contains("text-fg")).toBe(true);
			expect(paragraph.classList.contains("text-fg-muted")).toBe(false);
			expect(paragraph.classList.contains("leading-4")).toBe(true);
		}
		expect(container.querySelector("label > span")?.classList.contains("text-fg-muted")).toBe(true);
		expect(getConfirmButton(container).disabled).toBe(true);
		expect(getConfirmButton(container).classList.contains("h-10")).toBe(true);
		const documentationLink = container.querySelector(
			'a[href="https://docs.trade.xyz/consolidated-resources/specification-index"]',
		);
		const termsLink = container.querySelector('a[href="/terms"]');
		expect(documentationLink?.classList.contains("text-brand")).toBe(true);
		expect(termsLink?.classList.contains("text-brand")).toBe(true);

		const checkbox = container.querySelector('input[type="checkbox"]');
		if (!(checkbox instanceof HTMLInputElement)) throw new Error("Acknowledgement checkbox not found");
		act(() => checkbox.click());

		expect(getConfirmButton(container).disabled).toBe(false);
		act(() => getConfirmButton(container).click());
		expect(testState.accept).toHaveBeenCalledOnce();
	});

	it("uses a bottom drawer on the terminal mobile breakpoint and omits unknown deployer links", async () => {
		testState.isMobile = true;
		const { Hip3DeployerDisclaimer } = await import("@/components/trade/components/hip3-deployer-disclaimer");

		act(() => {
			root.render(createElement(Hip3DeployerDisclaimer, { documentationUrl: undefined }));
		});

		expect(container.querySelector('[role="dialog"]')?.getAttribute("data-presentation")).toBe("drawer");
		expect(container.querySelectorAll('a[target="_blank"]')).toHaveLength(1);
		expect(container.querySelector('a[href="/terms"]')).not.toBeNull();
	});

	it("allows an action-scoped disclaimer to cancel the pending market-close flow", async () => {
		const onCancel = vi.fn();
		const { Hip3DeployerDisclaimer } = await import("@/components/trade/components/hip3-deployer-disclaimer");

		act(() => {
			root.render(createElement(Hip3DeployerDisclaimer, { documentationUrl: undefined, onCancel }));
		});

		const dialog = container.querySelector('[role="dialog"]');
		expect(dialog?.getAttribute("data-dismissible")).toBe("true");
		expect(dialog?.getAttribute("data-show-close")).toBe("true");
		const cancelButton = [...container.querySelectorAll("button")].find(
			(candidate) => candidate.textContent === "Cancel",
		);
		if (!(cancelButton instanceof HTMLButtonElement)) throw new Error("Cancel button not found");
		act(() => cancelButton.click());
		expect(onCancel).toHaveBeenCalledOnce();
	});
});
