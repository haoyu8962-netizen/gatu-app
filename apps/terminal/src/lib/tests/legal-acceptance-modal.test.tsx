// @vitest-environment jsdom

import { act, createElement, Fragment, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	disconnectWallet: vi.fn(),
	isDisconnecting: false,
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

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useDisconnectWallet: () => ({
		disconnectWallet: testState.disconnectWallet,
		isDisconnecting: testState.isDisconnecting,
	}),
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
		showHandle,
	}: {
		children: ReactNode;
		className?: string;
		dismissible: boolean;
		layer: string;
		open: boolean;
		overlayClassName?: string;
		presentation: string;
		showClose: boolean;
		showHandle: boolean;
	}) =>
		open
			? createElement(
					"div",
					{
						className,
						"data-dismissible": String(dismissible),
						"data-layer": layer,
						"data-overlay-class": overlayClassName,
						"data-presentation": presentation,
						"data-show-close": String(showClose),
						"data-show-handle": String(showHandle),
						role: "dialog",
					},
					children,
				)
			: null,
	Button: ({
		"aria-busy": ariaBusy,
		children,
		className,
		disabled,
		onClick,
	}: {
		"aria-busy"?: boolean;
		children: ReactNode;
		className?: string;
		disabled?: boolean;
		onClick?: () => void;
	}) => createElement("button", { "aria-busy": ariaBusy, className, disabled, onClick, type: "button" }, children),
	Checkbox: ({
		checked,
		className,
		controlClassName,
		disabled,
		indicatorClassName,
		label,
		labelClassName,
		onCheckedChange,
		size,
	}: {
		checked: boolean;
		className?: string;
		controlClassName?: string;
		disabled?: boolean;
		indicatorClassName?: string;
		label: ReactNode;
		labelClassName?: string;
		onCheckedChange: (checked: boolean) => void;
		size: string;
	}) =>
		createElement(
			"label",
			{ className },
			createElement("input", {
				checked,
				"data-control-class": controlClassName,
				"data-indicator-class": indicatorClassName,
				"data-size": size,
				disabled,
				onChange: (event: { currentTarget: { checked: boolean } }) => onCheckedChange(event.currentTarget.checked),
				type: "checkbox",
			}),
			createElement("span", { className: labelClassName }, label),
		),
	ModalContent: ({ children, className }: { children: ReactNode; className?: string }) =>
		createElement("div", { className }, children),
	ModalDescription: ({ children, className }: { children: ReactNode; className?: string }) =>
		createElement("p", { className }, children),
	ModalFooter: ({ children, className }: { children: ReactNode; className?: string }) =>
		createElement("footer", { className }, children),
	ModalHeader: ({ children, className }: { children: ReactNode; className?: string }) =>
		createElement("header", { className }, children),
	ModalTitle: ({ children, className }: { children: ReactNode; className?: string }) =>
		createElement("h2", { className }, children),
}));

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
	if (!(button instanceof HTMLButtonElement)) throw new Error(`${label} button not found`);
	return button;
}

describe("LegalAcceptanceModal", () => {
	let container: HTMLDivElement;
	let root: Root;
	let onAccept = vi.fn(async () => undefined);
	let onResetAcceptance = vi.fn(() => undefined);
	let onRetryStatus = vi.fn(async () => undefined);

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		onAccept = vi.fn(async () => undefined);
		onResetAcceptance = vi.fn(() => undefined);
		onRetryStatus = vi.fn(async () => undefined);
		testState.disconnectWallet.mockReset();
		testState.disconnectWallet.mockResolvedValue(undefined);
		testState.isDisconnecting = false;
		testState.isMobile = false;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("blocks dismissal and signing until both acknowledgements are checked", async () => {
		const { LegalAcceptanceModal } = await import("@/components/trade/components/legal-acceptance-modal");

		act(() => {
			root.render(
				createElement(LegalAcceptanceModal, {
					state: "required",
					acceptanceError: null,
					onAccept,
					onRetryStatus,
					onResetAcceptance,
				}),
			);
		});

		const dialog = container.querySelector('[role="dialog"]');
		expect(dialog?.getAttribute("data-dismissible")).toBe("false");
		expect(dialog?.getAttribute("data-layer")).toBe("blocking");
		expect(dialog?.getAttribute("data-show-close")).toBe("false");
		expect(dialog?.getAttribute("data-show-handle")).toBe("false");
		expect(dialog?.getAttribute("data-presentation")).toBe("modal");
		expect(dialog?.getAttribute("data-overlay-class")).toContain("!bg-trading-panel-scrim");
		expect(dialog?.className).toContain("min-[1001px]:!max-w-[30rem]");
		expect(dialog?.className).toContain("min-[1001px]:!shadow-legal-acceptance");

		const content = container.querySelector('[data-slot="legal-acceptance-content"]');
		expect(content?.className).toContain("min-[1001px]:gap-[18px]");
		expect(content?.className).toContain("min-[1001px]:p-6");
		expect(container.querySelector('[data-slot="legal-acceptance-drawer-handle"]')?.className).toContain(
			"min-[1001px]:hidden",
		);

		const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
		expect(checkboxes).toHaveLength(2);
		expect(checkboxes[0]?.getAttribute("data-control-class")).toContain("size-[17px]");
		expect(checkboxes[0]?.getAttribute("data-control-class")).toContain("rounded-[5px]");
		const confirmButton = findButton(container, "Confirm in wallet");
		const declineButton = findButton(container, "Decline");
		expect(declineButton.compareDocumentPosition(confirmButton) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
		expect(confirmButton.disabled).toBe(true);
		expect(container.textContent).toContain("Select both items to continue.");

		act(() => checkboxes[0]?.click());
		expect(findButton(container, "Confirm in wallet").disabled).toBe(true);
		act(() => checkboxes[1]?.click());
		expect(findButton(container, "Confirm in wallet").disabled).toBe(false);
		expect(container.textContent).toContain("This signature is gas-free.");

		act(() => findButton(container, "Confirm in wallet").click());
		expect(onAccept).toHaveBeenCalledOnce();

		for (const link of container.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]')) {
			expect(link.rel).toBe("noopener noreferrer");
			expect(link.className).toContain("underline");
		}
	});

	it("uses the mobile drawer and disconnects when the user declines", async () => {
		testState.isMobile = true;
		const { LegalAcceptanceModal } = await import("@/components/trade/components/legal-acceptance-modal");

		act(() => {
			root.render(
				createElement(LegalAcceptanceModal, {
					state: "required",
					acceptanceError: null,
					onAccept,
					onRetryStatus,
					onResetAcceptance,
				}),
			);
		});

		expect(container.querySelector('[role="dialog"]')?.getAttribute("data-presentation")).toBe("drawer");
		const handle = container.querySelector('[data-slot="legal-acceptance-drawer-handle"]');
		expect(handle?.className).toContain("h-1");
		expect(handle?.className).toContain("w-9");

		const confirmButton = findButton(container, "Confirm in wallet");
		const declineButton = findButton(container, "Decline");
		expect(confirmButton.compareDocumentPosition(declineButton) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
		expect(confirmButton.className).toContain("h-[46px]");
		expect(declineButton.className).toContain("!border-transparent");
		act(() => findButton(container, "Decline").click());
		expect(testState.disconnectWallet).toHaveBeenCalledOnce();
	});

	it("keeps acknowledgements visible and locks every action while the wallet request is pending", async () => {
		const { LegalAcceptanceModal } = await import("@/components/trade/components/legal-acceptance-modal");
		const props = {
			acceptanceError: null,
			onAccept,
			onRetryStatus,
			onResetAcceptance,
		};

		act(() => root.render(createElement(LegalAcceptanceModal, { ...props, state: "required" })));
		const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
		act(() => checkboxes[0]?.click());
		act(() => checkboxes[1]?.click());

		act(() => root.render(createElement(LegalAcceptanceModal, { ...props, state: "submitting" })));

		for (const checkbox of container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
			expect(checkbox.checked).toBe(true);
			expect(checkbox.disabled).toBe(true);
			expect(checkbox.parentElement?.className).toContain("opacity-100");
			expect(checkbox.parentElement?.className).not.toContain("hover:bg-market-close-card");
		}

		const confirmButton = findButton(container, "Confirm in wallet…");
		expect(confirmButton.disabled).toBe(true);
		expect(confirmButton.getAttribute("aria-busy")).toBe("true");
		expect(confirmButton.className).toContain("data-disabled:!bg-legal-acceptance-pending");
		expect(findButton(container, "Decline").disabled).toBe(true);
		expect(container.textContent).toContain("Confirm the gas-free request in your selected wallet.");
	});

	it("keeps an acceptance failure visible without changing the acknowledgement gate", async () => {
		const { LegalAcceptanceModal } = await import("@/components/trade/components/legal-acceptance-modal");

		act(() => {
			root.render(
				createElement(LegalAcceptanceModal, {
					state: "required",
					acceptanceError: new Error("failed"),
					onAccept,
					onRetryStatus,
					onResetAcceptance,
				}),
			);
		});

		expect(container.querySelector('[role="alert"]')?.textContent).toContain("The terms could not be accepted");
		expect(findButton(container, "Confirm in wallet").disabled).toBe(true);
	});

	it("resets the failed acceptance before retrying legal status", async () => {
		const { LegalAcceptanceModal } = await import("@/components/trade/components/legal-acceptance-modal");

		act(() => {
			root.render(
				createElement(LegalAcceptanceModal, {
					state: "error",
					acceptanceError: new Error("failed"),
					onAccept,
					onRetryStatus,
					onResetAcceptance,
				}),
			);
		});

		act(() => findButton(container, "Retry").click());
		expect(onResetAcceptance).toHaveBeenCalledOnce();
		expect(onRetryStatus).toHaveBeenCalledOnce();
		expect(onResetAcceptance.mock.invocationCallOrder[0]).toBeLessThan(onRetryStatus.mock.invocationCallOrder[0] ?? 0);
	});
});
