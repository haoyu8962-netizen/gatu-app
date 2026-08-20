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
	popupClassName: "",
	popupOverlayClassName: "",
	popupRenders: 0,
	showSuccess: false,
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
	ModalPopup: ({
		children,
		className,
		overlayClassName,
		showClose,
	}: {
		children: ReactNode;
		className?: string;
		overlayClassName?: string;
		showClose?: boolean;
	}) => {
		modalHarness.popupRenders += 1;
		modalHarness.popupClassName = className ?? "";
		modalHarness.popupOverlayClassName = overlayClassName ?? "";
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
		showSuccess: modalHarness.showSuccess,
		trigger: () => {
			modalHarness.autoCloseTriggers += 1;
			modalHarness.showSuccess = true;
		},
		reset: () => {
			modalHarness.autoCloseResets += 1;
			modalHarness.showSuccess = false;
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
		modalHarness.popupClassName = "";
		modalHarness.popupOverlayClassName = "";
		modalHarness.popupRenders = 0;
		modalHarness.showSuccess = false;
		modalHarness.showClose = true;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderModal(
		pendingLeverage: number | null = null,
		open = true,
		marketIdentity = "HYPE",
		committedLeverage: number | null = null,
		updateError: Error | null = null,
	) {
		act(() => {
			root.render(
				<LeverageModal
					open={open}
					onOpenChange={onOpenChange}
					currentLeverage={3}
					pendingLeverage={pendingLeverage}
					committedLeverage={committedLeverage}
					maxLeverage={10}
					onPendingLeverageChange={onPendingLeverageChange}
					isUpdating={false}
					updateError={updateError}
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

		expect(modalHarness.editorProps?.value).toBe(6);
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

	it("uses the trading scrim and market-close typography on the popup only", () => {
		renderModal();

		expect(modalHarness.popupOverlayClassName).toBe("bg-trading-panel-scrim");
		expect(modalHarness.popupClassName).toContain("font-market-close");
	});

	it("blocks confirmation while the editor contains invalid text", async () => {
		renderModal(6);
		const onInputValidityChange = modalHarness.editorProps?.onInputValidityChange as
			| ((isValid: boolean) => void)
			| undefined;

		act(() => onInputValidityChange?.(false));
		const confirm = getButton(container, "Confirm");
		expect(confirm.disabled).toBe(true);
		await act(async () => confirm.click());
		expect(onApply).not.toHaveBeenCalled();

		act(() => onInputValidityChange?.(true));
		expect(getButton(container, "Confirm").disabled).toBe(false);
	});

	it("never enables submission for a transient slider display", async () => {
		renderModal(6);
		const onDraftChange = modalHarness.editorProps?.onDraftChange as ((value: number | null) => void) | undefined;
		act(() => onDraftChange?.(8));
		expect(modalHarness.editorProps?.value).toBe(8);
		expect(getButton(container, "Confirm").disabled).toBe(true);

		await act(async () => getButton(container, "Confirm").click());
		expect(onApply).not.toHaveBeenCalled();

		act(() => onDraftChange?.(null));
		expect(modalHarness.editorProps?.value).toBe(6);
		expect(getButton(container, "Confirm").disabled).toBe(false);
		await act(async () => getButton(container, "Confirm").click());

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

	it("locks the editor and successful action against duplicate submissions", async () => {
		renderModal(6);
		await act(async () => getButton(container, "Confirm").click());
		renderModal(null);

		const successButton = getButton(container, "Updated");
		expect(successButton.disabled).toBe(true);
		expect(modalHarness.editorProps?.disabled).toBe(true);

		const onChange = modalHarness.editorProps?.onChange as ((value: number) => void) | undefined;
		act(() => onChange?.(8));
		act(() => successButton.click());

		expect(onPendingLeverageChange).not.toHaveBeenCalled();
		expect(onApply).toHaveBeenCalledTimes(1);
	});

	it("lets a new draft override an earlier commit while its subscription is still pending", () => {
		renderModal(null, true, "HYPE", 6);
		expect(modalHarness.editorProps?.value).toBe(6);

		const onChange = modalHarness.editorProps?.onChange as ((value: number) => void) | undefined;
		act(() => onChange?.(8));
		expect(onPendingLeverageChange).toHaveBeenCalledWith(8);

		renderModal(8, true, "HYPE", 6);
		expect(modalHarness.editorProps?.value).toBe(8);
		expect(modalHarness.editorProps?.riskValue).toBe(8);
	});

	it("shows a failed leverage update and allows retrying it", async () => {
		onApply.mockRejectedValueOnce(new Error("Leverage request failed"));
		renderModal(6);
		await act(async () => getButton(container, "Confirm").click());

		renderModal(6, true, "HYPE", null, new Error("Leverage request failed"));
		expect(container.textContent).toContain("Leverage request failed");
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Leverage request failed");

		onApply.mockResolvedValueOnce(undefined);
		await act(async () => getButton(container, "Confirm").click());
		expect(onApply).toHaveBeenCalledTimes(2);
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

	it("drops an uncommitted drag when the account changes on the same market", () => {
		renderModal(null, true, "mainnet:0x1111:perp:1:HYPE");
		const onDraftChange = modalHarness.editorProps?.onDraftChange as ((value: number | null) => void) | undefined;
		act(() => onDraftChange?.(8));
		expect(modalHarness.editorProps?.value).toBe(8);

		renderModal(null, true, "mainnet:0x2222:perp:1:HYPE");

		expect(modalHarness.editorProps?.value).toBe(3);
		expect(onPendingLeverageChange).not.toHaveBeenCalled();
	});

	it("keeps the submitted leverage visible until the success state closes", async () => {
		renderModal(6);

		await act(async () => getButton(container, "Confirm").click());
		renderModal(null);

		expect(modalHarness.autoCloseTriggers).toBe(1);
		expect(modalHarness.editorProps?.value).toBe(6);
	});

	it("does not let an old account request succeed or close the new same-market session", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveApply = resolve;
				}),
		);
		renderModal(6, true, "mainnet:0x1111:perp:1:HYPE");
		act(() => getButton(container, "Confirm").click());

		renderModal(7, true, "mainnet:0x2222:perp:1:HYPE");
		await act(async () => resolveApply?.());

		expect(modalHarness.autoCloseTriggers).toBe(0);
		expect(modalHarness.editorProps?.value).toBe(7);
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it("resets the success session when closing content remains mounted", async () => {
		modalHarness.keepMounted = true;
		renderModal(6);
		await act(async () => getButton(container, "Confirm").click());
		expect(modalHarness.editorProps?.value).toBe(6);

		renderModal(null, false);
		renderModal(null, true);

		expect(modalHarness.autoCloseResets).toBeGreaterThan(0);
		expect(modalHarness.editorProps?.value).toBe(3);
	});
});
