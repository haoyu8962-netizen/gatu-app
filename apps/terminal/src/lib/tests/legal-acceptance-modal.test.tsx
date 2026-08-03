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
		dismissible,
		layer,
		open,
		presentation,
		showClose,
	}: {
		children: ReactNode;
		dismissible: boolean;
		layer: string;
		open: boolean;
		presentation: string;
		showClose: boolean;
	}) =>
		open
			? createElement(
					"div",
					{
						"data-dismissible": String(dismissible),
						"data-layer": layer,
						"data-presentation": presentation,
						"data-show-close": String(showClose),
						role: "dialog",
					},
					children,
				)
			: null,
	Button: ({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) =>
		createElement("button", { disabled, onClick, type: "button" }, children),
	Checkbox: ({
		checked,
		disabled,
		label,
		onCheckedChange,
	}: {
		checked: boolean;
		disabled?: boolean;
		label: ReactNode;
		onCheckedChange: (checked: boolean) => void;
	}) =>
		createElement(
			"label",
			null,
			createElement("input", {
				checked,
				disabled,
				onChange: (event: { currentTarget: { checked: boolean } }) => onCheckedChange(event.currentTarget.checked),
				type: "checkbox",
			}),
			label,
		),
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
	ModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
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
		expect(dialog?.getAttribute("data-presentation")).toBe("modal");

		const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
		expect(checkboxes).toHaveLength(2);
		expect(findButton(container, "Accept").disabled).toBe(true);

		act(() => checkboxes[0]?.click());
		expect(findButton(container, "Accept").disabled).toBe(true);
		act(() => checkboxes[1]?.click());
		expect(findButton(container, "Accept").disabled).toBe(false);

		act(() => findButton(container, "Accept").click());
		expect(onAccept).toHaveBeenCalledOnce();
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
		act(() => findButton(container, "Decline").click());
		expect(testState.disconnectWallet).toHaveBeenCalledOnce();
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
