/** @vitest-environment jsdom */

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeverageModal } from "@/components/trade/tradebox/leverage-modal";
import { createI18nRoot } from "./harness/react";

const modalHarness = vi.hoisted(() => ({
	autoCloseResets: 0,
	autoCloseTriggers: 0,
	disablePointerDismissal: false,
	editorProps: null as Record<string, unknown> | null,
	keepMounted: false,
	modalOpenChange: undefined as ((open: boolean, eventDetails?: { cancel: () => void }) => void) | undefined,
	popupRenders: 0,
	showClose: true,
}));

vi.mock("@gatu/ui", () => ({
	Button: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("button", { ...props, type: "button" }, children),
	Modal: ({
		children,
		disablePointerDismissal,
		onOpenChange,
		open,
	}: {
		children: ReactNode;
		disablePointerDismissal?: boolean;
		onOpenChange?: (open: boolean, eventDetails?: { cancel: () => void }) => void;
		open: boolean;
	}) => {
		modalHarness.disablePointerDismissal = !!disablePointerDismissal;
		modalHarness.modalOpenChange = onOpenChange;
		return open || modalHarness.keepMounted ? children : null;
	},
	ModalContent: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("div", props, children),
	ModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalPopup: ({ children, showClose }: { children: ReactNode; showClose?: boolean }) => {
		modalHarness.popupRenders += 1;
		modalHarness.showClose = showClose ?? true;
		return createElement("section", null, children);
	},
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({ children, containerClassName: _containerClassName, ...props }: Record<string, unknown>) =>
		createElement("button", { ...props, type: "button" }, children as ReactNode),
}));

vi.mock("@/components/trade/tradebox/leverage-editor", () => ({
	LeverageEditor: (props: Record<string, unknown>) => {
		modalHarness.editorProps = props;
		return createElement("div", { "data-testid": "leverage-editor" });
	},
}));

vi.mock("@/hooks/ui/use-auto-close-success", () => ({
	useAutoCloseSuccess: () => ({
		showSuccess: false,
		trigger: () => {
			modalHarness.autoCloseTriggers += 1;
		},
		reset: () => {
			modalHarness.autoCloseResets += 1;
		},
	}),
}));

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(label));
	if (!(button instanceof HTMLButtonElement)) throw new Error(`${label} button not found`);
	return button;
}

describe("LeverageModal", () => {
	let container: HTMLDivElement;
	let root: Root;
	let onPendingLeverageChange: ReturnType<typeof vi.fn<(value: number) => void>>;
	let onApply: ReturnType<typeof vi.fn<(value: number) => Promise<void>>>;
	let onOpenChange: ReturnType<typeof vi.fn<(open: boolean) => void>>;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		onPendingLeverageChange = vi.fn<(value: number) => void>();
		onApply = vi.fn<(value: number) => Promise<void>>().mockResolvedValue(undefined);
		onOpenChange = vi.fn<(open: boolean) => void>();
		modalHarness.editorProps = null;
		modalHarness.keepMounted = false;
		modalHarness.autoCloseResets = 0;
		modalHarness.autoCloseTriggers = 0;
		modalHarness.disablePointerDismissal = false;
		modalHarness.modalOpenChange = undefined;
		modalHarness.popupRenders = 0;
		modalHarness.showClose = true;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderModal(pendingLeverage: number | null = null, open = true, marketIdentity = "HYPE") {
		act(() => {
			root.render(
				<LeverageModal
					open={open}
					onOpenChange={onOpenChange}
					currentLeverage={3}
					pendingLeverage={pendingLeverage}
					maxLeverage={10}
					onPendingLeverageChange={onPendingLeverageChange}
					isUpdating={false}
					updateError={null}
					onApply={onApply}
					marketIdentity={marketIdentity}
				/>,
			);
		});
	}

	it("updates only the modal content while dragging and calls the API boundary only on confirm", async () => {
		renderModal();
		expect(modalHarness.popupRenders).toBe(1);

		const onDraftChange = modalHarness.editorProps?.onDraftChange as ((value: number | null) => void) | undefined;
		const onChange = modalHarness.editorProps?.onChange as ((value: number) => void) | undefined;

		act(() => {
			onDraftChange?.(4);
			onDraftChange?.(5);
			onDraftChange?.(6);
		});

		expect(container.querySelector("h2")?.textContent).toContain("6x");
		expect(modalHarness.popupRenders).toBe(1);
		expect(onPendingLeverageChange).not.toHaveBeenCalled();
		expect(onApply).not.toHaveBeenCalled();

		act(() => onChange?.(6));

		expect(modalHarness.popupRenders).toBe(1);
		expect(onPendingLeverageChange).toHaveBeenCalledTimes(1);
		expect(onPendingLeverageChange).toHaveBeenCalledWith(6);
		expect(onApply).not.toHaveBeenCalled();

		renderModal(6);
		await act(async () => getButton(container, "Confirm").click());

		expect(onApply).toHaveBeenCalledTimes(1);
		expect(onApply).toHaveBeenCalledWith(6);
	});

	it("submits at most once before the pending state can rerender", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveApply = resolve;
				}),
		);
		renderModal(6);

		const confirm = getButton(container, "Confirm");
		act(() => {
			confirm.click();
			confirm.click();
		});

		expect(onApply).toHaveBeenCalledTimes(1);
		expect(onApply).toHaveBeenCalledWith(6);

		await act(async () => resolveApply?.());
	});

	it("blocks every dismissal path while the leverage request is in flight", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveApply = resolve;
				}),
		);
		renderModal(6);

		act(() => getButton(container, "Confirm").click());

		expect(modalHarness.disablePointerDismissal).toBe(true);
		expect(modalHarness.showClose).toBe(false);
		const cancel = vi.fn();
		act(() => modalHarness.modalOpenChange?.(false, { cancel }));
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(onOpenChange).not.toHaveBeenCalled();

		await act(async () => resolveApply?.());
		expect(modalHarness.disablePointerDismissal).toBe(false);
	});

	it("does not rerender the popup when a parent rerenders with unchanged leverage props", () => {
		renderModal();
		expect(modalHarness.popupRenders).toBe(1);

		renderModal();

		expect(modalHarness.popupRenders).toBe(1);
	});

	it("drops an uncommitted drag when the selected market changes", () => {
		renderModal(null, true, "HYPE");
		const onDraftChange = modalHarness.editorProps?.onDraftChange as ((value: number | null) => void) | undefined;
		act(() => onDraftChange?.(8));
		expect(container.querySelector("h2")?.textContent).toContain("8x");

		renderModal(null, true, "BTC");

		expect(container.querySelector("h2")?.textContent).toContain("3x");
		expect(onPendingLeverageChange).not.toHaveBeenCalled();
	});

	it("keeps the submitted leverage visible until the success state closes", async () => {
		renderModal(6);

		await act(async () => getButton(container, "Confirm").click());
		renderModal(null);

		expect(modalHarness.autoCloseTriggers).toBe(1);
		expect(container.querySelector("h2")?.textContent).toContain("6x");
	});

	it("does not let an old market request close the new market session", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveApply = resolve;
				}),
		);
		renderModal(6, true, "HYPE");
		act(() => getButton(container, "Confirm").click());

		renderModal(7, true, "BTC");
		await act(async () => resolveApply?.());

		expect(modalHarness.autoCloseTriggers).toBe(0);
		expect(container.querySelector("h2")?.textContent).toContain("7x");
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it("resets the success session when closing content remains mounted", async () => {
		modalHarness.keepMounted = true;
		renderModal(6);
		await act(async () => getButton(container, "Confirm").click());
		expect(container.querySelector("h2")?.textContent).toContain("6x");

		renderModal(null, false);
		renderModal(null, true);

		expect(modalHarness.autoCloseResets).toBeGreaterThan(0);
		expect(container.querySelector("h2")?.textContent).toContain("3x");
	});
});
