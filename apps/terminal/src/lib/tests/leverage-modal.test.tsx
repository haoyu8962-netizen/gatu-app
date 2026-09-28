import { clearFeedback, feedbackErrorText, feedbackText, latestFeedback } from "./harness/order-feedback";
/** @vitest-environment jsdom */

import { act, type ComponentProps, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeverageModal } from "@/components/trade/tradebox/leverage-modal";
import { createI18nRoot } from "./harness/react";

const modalHarness = vi.hoisted(() => ({
	isActivationLocked: undefined as (() => boolean) | undefined,
	autoCloseResets: 0,
	autoCloseTriggers: 0,
	disablePointerDismissal: false,
	editorProps: null as Record<string, unknown> | null,
	keepMounted: false,
	modalOpenChange: undefined as ((open: boolean, eventDetails?: { cancel: () => void }) => void) | undefined,
	popupClassName: "",
	popupOverlayClassName: "",
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
	TradingActionButton: ({
		children,
		containerClassName: _containerClassName,
		isActivationLocked,
		requiresBuilderFee: _requiresBuilderFee,
		...props
	}: Record<string, unknown>) => {
		modalHarness.isActivationLocked = isActivationLocked as (() => boolean) | undefined;
		return createElement("button", { ...props, type: "button" }, children as ReactNode);
	},
}));

vi.mock("@/components/trade/tradebox/leverage-editor", () => ({
	LeverageEditor: (props: Record<string, unknown>) => {
		modalHarness.editorProps = props;
		return createElement("div", { "data-testid": "leverage-editor" });
	},
}));

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(label));
	if (!(button instanceof HTMLButtonElement)) throw new Error(`${label} button not found`);
	return button;
}

const feedbackIdentity = vi.hoisted(() => ({
	clientKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	env: "Mainnet",
}));
vi.mock("@/lib/hyperliquid", () => ({ useHyperliquid: () => feedbackIdentity }));

describe("LeverageModal", () => {
	let container: HTMLDivElement;
	let root: Root;
	let onPendingLeverageChange: ReturnType<typeof vi.fn<(value: number) => void>>;
	let onApply: ReturnType<typeof vi.fn<(value: number) => Promise<number | null>>>;
	let onOpenChange: ReturnType<typeof vi.fn<(open: boolean) => void>>;

	beforeEach(() => {
		feedbackIdentity.clientKey = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		feedbackIdentity.env = "Mainnet";
		clearFeedback();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		onPendingLeverageChange = vi.fn<(value: number) => void>();
		onApply = vi.fn<(value: number) => Promise<number | null>>().mockImplementation(async (value) => value);
		onOpenChange = vi.fn<(open: boolean) => void>();
		modalHarness.editorProps = null;
		modalHarness.keepMounted = false;
		modalHarness.disablePointerDismissal = false;
		modalHarness.modalOpenChange = undefined;
		modalHarness.popupClassName = "";
		modalHarness.popupOverlayClassName = "";
		modalHarness.popupRenders = 0;
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
		extraProps: Partial<ComponentProps<typeof LeverageModal>> = {},
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
					onApply={onApply}
					marketIdentity={marketIdentity}
					{...extraProps}
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

	it("locks Confirm in the same tick a leverage drag starts, before any render", async () => {
		renderModal(6);
		const onDraftChange = modalHarness.editorProps?.onDraftChange as ((value: number | null) => void) | undefined;
		const confirm = getButton(container, "Confirm");

		await act(async () => {
			onDraftChange?.(8);
			expect(modalHarness.isActivationLocked?.()).toBe(true);
			confirm.click();
		});
		expect(onApply).not.toHaveBeenCalled();

		act(() => onDraftChange?.(null));
		await act(async () => getButton(container, "Confirm").click());
		expect(onApply).toHaveBeenCalledWith(6);
	});

	it("never submits a transient slider display and does not grey Confirm while it is shown", async () => {
		renderModal(6);
		const onDraftChange = modalHarness.editorProps?.onDraftChange as ((value: number | null) => void) | undefined;
		expect(modalHarness.isActivationLocked?.()).toBe(false);
		act(() => onDraftChange?.(8));
		expect(modalHarness.editorProps?.value).toBe(8);
		expect(getButton(container, "Confirm").disabled).toBe(false);
		expect(modalHarness.isActivationLocked?.()).toBe(true);

		await act(async () => getButton(container, "Confirm").click());
		expect(onApply).not.toHaveBeenCalled();

		act(() => onDraftChange?.(null));
		expect(modalHarness.editorProps?.value).toBe(6);
		expect(getButton(container, "Confirm").disabled).toBe(false);
		expect(modalHarness.isActivationLocked?.()).toBe(false);
		await act(async () => getButton(container, "Confirm").click());

		expect(onApply).toHaveBeenCalledWith(6);
	});

	it("submits at most once before the pending state can rerender", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			(value) =>
				new Promise<number | null>((resolve) => {
					resolveApply = () => resolve(value);
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

	it("closes at the click, keeps a static label and reports success through a notification", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			(value) =>
				new Promise<number | null>((resolve) => {
					resolveApply = () => resolve(value);
				}),
		);
		renderModal(6);

		act(() => getButton(container, "Confirm").click());

		expect(onOpenChange).toHaveBeenCalledOnce();
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(getButton(container, "Confirm").textContent).toBe("Confirm");
		expect(container.querySelector(".animate-spin")).toBeNull();
		expect(latestFeedback("success")).toBeUndefined();

		await act(async () => resolveApply?.());
		expect(feedbackText("success")).toBe("Leverage updated to 6x");
		expect(container.textContent).not.toContain("Updated to");
	});

	it("lets a new draft override an earlier commit while its subscription is still pending", () => {
		renderModal(null, true, "HYPE", 6);
		expect(modalHarness.editorProps?.value).toBe(6);

		const onChange = modalHarness.editorProps?.onChange as ((value: number) => void) | undefined;
		act(() => onChange?.(8));
		expect(onPendingLeverageChange).toHaveBeenCalledWith(8);

		renderModal(8, true, "HYPE", 6);
		expect(modalHarness.editorProps?.value).toBe(8);
	});

	it("reports a failed leverage update through a notification and allows retrying it", async () => {
		onApply.mockRejectedValueOnce(new Error("Leverage request failed"));
		renderModal(6);
		await act(async () => getButton(container, "Confirm").click());

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(feedbackErrorText(latestFeedback("failed"))).toBe("Leverage request failed");
		expect(container.querySelector('[role="alert"]')).toBeNull();

		onApply.mockResolvedValueOnce(6);
		await act(async () => getButton(container, "Confirm").click());
		expect(onApply).toHaveBeenCalledTimes(2);
	});

	it("stays dismissible while a leverage request is in flight", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			(value) =>
				new Promise<number | null>((resolve) => {
					resolveApply = () => resolve(value);
				}),
		);
		renderModal(6);

		act(() => getButton(container, "Confirm").click());

		expect(modalHarness.disablePointerDismissal).toBe(false);
		expect(modalHarness.showClose).toBe(true);
		act(() => modalHarness.modalOpenChange?.(false));
		expect(onOpenChange).toHaveBeenCalledTimes(2);

		await act(async () => resolveApply?.());
	});

	it("does not rerender the popup when a parent rerenders with unchanged leverage props", () => {
		renderModal();
		expect(modalHarness.popupRenders).toBe(1);

		renderModal();

		expect(modalHarness.popupRenders).toBe(1);
	});

	it("forwards the market's margin tiers without rerendering the popup for the same reference", async () => {
		const marginTiers = [
			{ lowerBound: "0.0", maxLeverage: 10 },
			{ lowerBound: "20000000.0", maxLeverage: 5 },
		] as const;
		const tierProps = { marginTiers, quoteSymbol: "USDC" };
		renderModal(null, true, "HYPE", null, tierProps);

		expect(modalHarness.editorProps?.marginTiers).toBe(marginTiers);
		expect(modalHarness.editorProps?.quoteSymbol).toBe("USDC");
		expect(modalHarness.popupRenders).toBe(1);

		renderModal(null, true, "HYPE", null, tierProps);
		expect(modalHarness.popupRenders).toBe(1);

		const onDraftChange = modalHarness.editorProps?.onDraftChange as ((value: number | null) => void) | undefined;
		act(() => onDraftChange?.(8));
		expect(modalHarness.editorProps?.value).toBe(8);
		expect(modalHarness.editorProps?.marginTiers).toBe(marginTiers);
		expect(modalHarness.popupRenders).toBe(1);

		act(() => onDraftChange?.(null));
		renderModal(6, true, "HYPE", null, tierProps);
		await act(async () => getButton(container, "Confirm").click());
		expect(onApply).toHaveBeenCalledTimes(1);
		expect(onApply).toHaveBeenCalledWith(6);
		expect(getButton(container, "Confirm").textContent).toBe("Confirm");
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

	it("records the old account result without closing the new same-market session", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			(value) =>
				new Promise<number | null>((resolve) => {
					resolveApply = () => resolve(value);
				}),
		);
		renderModal(6, true, "mainnet:0x1111:perp:1:HYPE");
		act(() => getButton(container, "Confirm").click());

		feedbackIdentity.clientKey = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
		renderModal(7, true, "mainnet:0x2222:perp:1:HYPE");
		await act(async () => resolveApply?.());

		expect(latestFeedback("success")?.owner).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
		expect(latestFeedback("failed")).toBeUndefined();
		expect(modalHarness.editorProps?.value).toBe(7);
		expect(onOpenChange).toHaveBeenCalledOnce();
	});

	it("drops an uncommitted drag when closing content remains mounted", () => {
		modalHarness.keepMounted = true;
		renderModal(null);
		const onDraftChange = modalHarness.editorProps?.onDraftChange as ((value: number | null) => void) | undefined;
		act(() => onDraftChange?.(8));
		expect(modalHarness.editorProps?.value).toBe(8);

		renderModal(null, false);
		renderModal(null, true);

		expect(modalHarness.editorProps?.value).toBe(3);
	});
});
