// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarginModeModal } from "@/components/trade/tradebox/margin-mode-modal";
import { createI18nRoot } from "./harness/react";

const modalHarness = vi.hoisted(() => ({
	isActivationLocked: undefined as (() => boolean) | undefined,
	adaptiveClassName: "",
	adaptiveModalRenders: 0,
	adaptiveOpenChange: undefined as ((open: boolean) => void) | undefined,
	adaptiveOverlayClassName: "",
	autoCloseResets: 0,
	autoCloseTriggers: 0,
	dismissible: true,
	keepAdaptiveMounted: false,
	leverageSliderProps: null as Record<string, unknown> | null,
	modalDisablePointerDismissal: false,
	modalOpenChange: undefined as ((open: boolean, eventDetails?: { cancel: () => void }) => void) | undefined,
	popupClassName: "",
	popupOverlayClassName: "",
	popupShowClose: true,
	presentation: "modal" as "modal" | "drawer",
	showSuccess: false,
	tabChange: undefined as ((value: string) => void) | undefined,
	tabsDisabled: false,
	tabValue: "margin",
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({
		children,
		className,
		dismissible,
		onOpenChange,
		open,
		overlayClassName,
		presentation,
	}: {
		children: ReactNode;
		className?: string;
		dismissible: boolean;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		overlayClassName?: string;
		presentation: "modal" | "drawer";
	}) => {
		modalHarness.adaptiveClassName = className ?? "";
		modalHarness.adaptiveModalRenders += 1;
		modalHarness.adaptiveOpenChange = onOpenChange;
		modalHarness.adaptiveOverlayClassName = overlayClassName ?? "";
		modalHarness.dismissible = dismissible;
		modalHarness.presentation = presentation;
		return open || modalHarness.keepAdaptiveMounted
			? createElement("section", { "data-presentation": presentation }, children)
			: null;
	},
	Button: ({ children, iconLeft: _iconLeft, iconRight: _iconRight, ...props }: Record<string, unknown>) =>
		createElement("button", { ...props, type: "button" }, children as ReactNode),
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
		modalHarness.modalDisablePointerDismissal = !!disablePointerDismissal;
		modalHarness.modalOpenChange = onOpenChange;
		return open ? children : null;
	},
	ModalContent: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("div", props, children),
	ModalFooter: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("footer", props, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalPopup: ({
		children,
		showClose,
		size: _size,
		...props
	}: {
		children: ReactNode;
		showClose?: boolean;
		[key: string]: unknown;
	}) => {
		modalHarness.popupClassName = typeof props.className === "string" ? props.className : "";
		modalHarness.popupOverlayClassName = typeof props.overlayClassName === "string" ? props.overlayClassName : "";
		modalHarness.popupShowClose = showClose ?? true;
		return createElement("section", { className: props.className as string | undefined }, children);
	},
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
	Tabs: ({
		children,
		disabled,
		onValueChange,
		value,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onValueChange: (value: string) => void;
		value: string;
	}) => {
		modalHarness.tabChange = onValueChange;
		modalHarness.tabsDisabled = !!disabled;
		modalHarness.tabValue = value;
		return createElement("div", null, children);
	},
	TabsContent: ({ children, value, ...props }: { children: ReactNode; value: string; [key: string]: unknown }) =>
		createElement(
			"div",
			{ ...props, role: "tabpanel", hidden: value !== modalHarness.tabValue, "data-value": value },
			children,
		),
	TabsList: ({ children }: { children: ReactNode }) => createElement("div", { role: "tablist" }, children),
	TabsTrigger: ({ children, value, ...props }: { children: ReactNode; value: string; [key: string]: unknown }) =>
		createElement(
			"button",
			{
				...props,
				type: "button",
				role: "tab",
				disabled: modalHarness.tabsDisabled,
				"aria-selected": value === modalHarness.tabValue,
				onClick: () => modalHarness.tabChange?.(value),
			},
			children,
		),
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({
		children,
		containerClassName: _containerClassName,
		isActivationLocked,
		requiresBuilderFee: _requiresBuilderFee,
		...props
	}: {
		children: ReactNode;
		containerClassName?: string;
		isActivationLocked?: () => boolean;
		[key: string]: unknown;
	}) => {
		modalHarness.isActivationLocked = isActivationLocked;
		return createElement("button", { ...props, type: "button" }, children);
	},
}));

vi.mock("@/components/trade/tradebox/leverage-slider", () => ({
	LeverageSlider: (props: Record<string, unknown>) => {
		modalHarness.leverageSliderProps = props;
		return createElement("div", { "data-testid": "leverage-slider" });
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

function getLeverageInput(container: HTMLElement): HTMLInputElement {
	const input = container.querySelector('input[aria-label="Leverage"]');
	if (!(input instanceof HTMLInputElement)) throw new Error("Leverage input not found");
	return input;
}

describe("MarginModeModal", () => {
	let container: HTMLDivElement;
	let root: Root;
	let onApply: ReturnType<typeof vi.fn<(mode: "cross" | "isolated", leverage: number) => Promise<void>>>;

	beforeEach(() => {
		modalHarness.adaptiveClassName = "";
		modalHarness.adaptiveModalRenders = 0;
		modalHarness.adaptiveOpenChange = undefined;
		modalHarness.adaptiveOverlayClassName = "";
		modalHarness.autoCloseResets = 0;
		modalHarness.autoCloseTriggers = 0;
		modalHarness.keepAdaptiveMounted = false;
		modalHarness.leverageSliderProps = null;
		modalHarness.modalDisablePointerDismissal = false;
		modalHarness.modalOpenChange = undefined;
		modalHarness.popupClassName = "";
		modalHarness.popupOverlayClassName = "";
		modalHarness.popupShowClose = true;
		modalHarness.showSuccess = false;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		onApply = vi.fn<(mode: "cross" | "isolated", leverage: number) => Promise<void>>().mockResolvedValue(undefined);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderModal(overrides: Partial<Parameters<typeof MarginModeModal>[0]> = {}) {
		act(() => {
			root.render(
				createElement(MarginModeModal, {
					open: true,
					onOpenChange: vi.fn(),
					currentMode: "cross",
					currentLeverage: 10,
					pendingLeverage: null,
					maxLeverage: 20,
					onPendingLeverageChange: vi.fn(),
					hasPosition: false,
					positionStateReady: true,
					allowsCrossMargin: true,
					allowsIsolatedMarginRemoval: true,
					isUpdating: false,
					updateError: null,
					showLeverage: true,
					onApply,
					...overrides,
				}),
			);
		});
	}

	it("describes removable isolated margin for noCross markets", async () => {
		renderModal({
			currentMode: "isolated",
			pendingLeverage: 7,
			allowsCrossMargin: false,
			allowsIsolatedMarginRemoval: true,
		});

		expect(getButton(container, "Cross").disabled).toBe(true);
		expect(container.textContent).toContain("This market only supports isolated margin mode.");
		expect(container.textContent).toContain("Margin can be added or removed individually.");
		expect(container.textContent).not.toContain("cannot be removed while the position is open");
		expect(getButton(container, "Confirm").disabled).toBe(false);

		await act(async () => {
			getButton(container, "Confirm").click();
		});
		expect(onApply).toHaveBeenCalledWith("isolated", 7);
	});

	it("uses the trading scrim and market-close typography for desktop and mobile content", () => {
		renderModal();

		expect(modalHarness.popupOverlayClassName).toBe("bg-trading-panel-scrim");
		expect(modalHarness.popupClassName).toContain("font-market-close");

		renderModal({ presentation: "drawer" });

		expect(modalHarness.adaptiveOverlayClassName).toBe("bg-trading-panel-scrim");
		expect(modalHarness.adaptiveClassName).toContain("font-market-close");
	});

	it("does not clamp or submit an out-of-range leverage text draft", async () => {
		const onPendingLeverageChange = vi.fn();
		renderModal({ pendingLeverage: 7, onPendingLeverageChange });
		const input = container.querySelector('input[aria-label="Leverage"]');
		if (!(input instanceof HTMLInputElement)) throw new Error("Leverage input not found");
		const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

		act(() => {
			valueSetter?.call(input, "21");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});

		expect(input.value).toBe("21");
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(onPendingLeverageChange).not.toHaveBeenCalled();
		expect(getButton(container, "Confirm").disabled).toBe(true);
		act(() => input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" })));
		expect(input.value).toBe("21");
		expect(getButton(container, "Confirm").disabled).toBe(true);
		await act(async () => getButton(container, "Confirm").click());
		expect(onApply).not.toHaveBeenCalled();

		act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
		expect(input.value).toBe("7");
		expect(getButton(container, "Confirm").disabled).toBe(false);
	});

	it("describes append-only margin for strictIsolated markets", () => {
		renderModal({
			currentMode: "isolated",
			allowsCrossMargin: false,
			allowsIsolatedMarginRemoval: false,
		});

		expect(getButton(container, "Cross").disabled).toBe(true);
		expect(container.textContent).toContain("Margin can be added, but cannot be removed while the position is open.");
		expect(container.textContent).not.toContain("Margin can be added or removed individually.");
	});

	it("keeps the removable-margin description for normal isolated mode", () => {
		renderModal({ currentMode: "isolated" });

		expect(getButton(container, "Cross").disabled).toBe(false);
		expect(container.textContent).toContain("Margin can be added or removed individually.");
		expect(container.textContent).not.toContain("This market only supports isolated margin mode.");
	});

	it("disables cross-to-isolated switching while position data is unavailable", () => {
		renderModal({ positionStateReady: false });

		act(() => getButton(container, "Isolated").click());

		expect(getButton(container, "Confirm").disabled).toBe(true);
		expect(container.textContent).toContain("Position data is unavailable.");
		expect(onApply).not.toHaveBeenCalled();
	});

	it("disables cross-to-isolated switching for an open position", () => {
		renderModal({ hasPosition: true });

		act(() => getButton(container, "Isolated").click());

		expect(getButton(container, "Confirm").disabled).toBe(true);
		expect(container.textContent).toContain("Cannot switch to Isolated mode with an open position.");
		expect(onApply).not.toHaveBeenCalled();
	});

	it("allows a position-free market to switch to isolated", async () => {
		renderModal();

		act(() => getButton(container, "Isolated").click());
		expect(getButton(container, "Confirm").disabled).toBe(false);
		await act(async () => {
			getButton(container, "Confirm").click();
		});

		expect(onApply).toHaveBeenCalledWith("isolated", 10);
	});

	it("preserves an unconfirmed committed leverage when only the margin mode changes", async () => {
		renderModal({ committedLeverage: 20, currentLeverage: 10, showLeverage: false });

		act(() => getButton(container, "Isolated").click());
		await act(async () => getButton(container, "Confirm").click());

		expect(onApply).toHaveBeenCalledWith("isolated", 20);
	});

	it("resets the margin draft after closing and reopening", () => {
		renderModal({ marketIdentity: "HYPE" });
		act(() => getButton(container, "Isolated").click());
		expect(getButton(container, "Confirm").disabled).toBe(false);

		renderModal({ open: false, marketIdentity: "HYPE" });
		renderModal({ marketIdentity: "HYPE" });

		expect(getButton(container, "Cross").getAttribute("aria-pressed")).toBe("true");
		expect(getButton(container, "Confirm").disabled).toBe(true);
	});

	it("resets the margin draft when the selected market changes while open", () => {
		renderModal({ marketIdentity: "HYPE" });
		act(() => getButton(container, "Isolated").click());
		expect(getButton(container, "Confirm").disabled).toBe(false);

		renderModal({ marketIdentity: "BTC" });

		expect(getButton(container, "Cross").getAttribute("aria-pressed")).toBe("true");
		expect(getButton(container, "Confirm").disabled).toBe(true);
	});

	it("does not let an old network request succeed or close the new same-market session", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveApply = resolve;
				}),
		);
		const onOpenChange = vi.fn();
		renderModal({
			onOpenChange,
			marketIdentity: "mainnet:0x1111:perp:1:HYPE",
		});
		act(() => getButton(container, "Isolated").click());
		act(() => getButton(container, "Confirm").click());

		renderModal({
			onOpenChange,
			marketIdentity: "testnet:0x1111:perp:1:HYPE",
		});
		expect(getButton(container, "Cross").getAttribute("aria-pressed")).toBe("true");
		expect(getButton(container, "Confirm").disabled).toBe(true);

		await act(async () => resolveApply?.());

		expect(modalHarness.autoCloseTriggers).toBe(0);
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it("uses a mobile drawer with separate margin and account actions", async () => {
		const onSettingsTabChange = vi.fn();
		const accountApply = vi.fn().mockResolvedValue(undefined);
		renderModal({
			presentation: "drawer",
			marketIdentity: "HYPE",
			marketLabel: "HYPE-USDC",
			settingsTab: "margin",
			onSettingsTabChange,
			accountModeForm: {
				currentMode: "disabled",
				canChange: true,
				portfolioMarginActivationEnabled: true,
				onApply: accountApply,
			},
		});

		expect(modalHarness.presentation).toBe("drawer");
		expect(modalHarness.adaptiveClassName).toContain("max-h-[calc(100dvh-1rem)]");
		expect(container.textContent).toContain("HYPE-USDC Margin mode");
		expect(container.textContent).toContain("Position margin");
		expect(container.textContent).toContain("Account type");
		expect(getButton(container, "Position margin").className).toContain("min-h-10");
		expect(getButton(container, "Account type").className).toContain("min-h-10");
		expect(container.querySelector('[data-testid="leverage-slider"]')).toBeNull();
		expect(getButton(container, "Cross").className).toContain("rounded-12");
		expect(getButton(container, "Cross").className).toContain("border-trading-panel-control");
		act(() => getButton(container, "Account type").click());
		expect(onSettingsTabChange).toHaveBeenCalledWith("account");

		renderModal({
			presentation: "drawer",
			marketIdentity: "HYPE",
			marketLabel: "HYPE-USDC",
			settingsTab: "account",
			onSettingsTabChange,
			accountModeForm: {
				currentMode: "disabled",
				canChange: true,
				portfolioMarginActivationEnabled: true,
				onApply: accountApply,
			},
		});
		expect(container.querySelector("h2")?.textContent).toBe("Account type");
		act(() => getButton(container, "Unified account").click());
		const confirmButton = getButton(container, "Confirm");
		expect(confirmButton.className).toContain("min-h-11");
		expect(confirmButton.closest("footer")?.className).toContain("pb-3");
		await act(async () => confirmButton.click());

		expect(accountApply).toHaveBeenCalledWith("unifiedAccount");
		expect(onApply).not.toHaveBeenCalled();
	});

	it("keeps leverage out of the mobile margin view", async () => {
		renderModal({
			presentation: "drawer",
			marketLabel: "HYPE-USDC",
			pendingLeverage: 7,
			mobileView: "margin",
		});

		expect(container.textContent).toContain("HYPE-USDC Margin mode");
		expect(container.querySelector('[data-testid="leverage-slider"]')).toBeNull();
		expect(getButton(container, "Confirm").disabled).toBe(true);

		act(() => getButton(container, "Isolated").click());
		await act(async () => getButton(container, "Confirm").click());

		expect(onApply).toHaveBeenCalledWith("isolated", 10);
	});

	it("renders leverage as an independent mobile drawer", async () => {
		renderModal({
			presentation: "drawer",
			marketLabel: "HYPE-USDC",
			pendingLeverage: 7,
			mobileView: "leverage",
			accountModeForm: {
				currentMode: "disabled",
				canChange: true,
				onApply: vi.fn().mockResolvedValue(undefined),
			},
		});

		expect(container.querySelector("h2")?.textContent).toContain("Adjust leverage");
		expect(getLeverageInput(container).value).toBe("7");
		expect(container.textContent).not.toContain("Position margin");
		expect(container.textContent).not.toContain("Account type");
		expect(container.querySelector('[data-testid="leverage-slider"]')).not.toBeNull();

		await act(async () => getButton(container, "Confirm").click());

		expect(onApply).toHaveBeenCalledWith("cross", 7);
	});

	it("locks Confirm in the same tick a leverage drag starts, before any render", async () => {
		renderModal({
			presentation: "drawer",
			pendingLeverage: 7,
			mobileView: "leverage",
		});
		const slider = modalHarness.leverageSliderProps;
		if (!slider) throw new Error("Expected the leverage slider");
		const confirm = getButton(container, "Confirm");

		await act(async () => {
			(slider.onInteractionStart as (value: number) => void)(7);
			expect(modalHarness.isActivationLocked?.()).toBe(true);
			confirm.click();
		});
		expect(onApply).not.toHaveBeenCalled();

		act(() => (modalHarness.leverageSliderProps?.onInteractionEnd as () => void)());
		await act(async () => getButton(container, "Confirm").click());
		expect(onApply).toHaveBeenCalledTimes(1);
	});

	it("ignores Confirm while the leverage slider is held without greying it", async () => {
		renderModal({
			presentation: "drawer",
			pendingLeverage: 7,
			mobileView: "leverage",
		});
		const slider = modalHarness.leverageSliderProps;
		if (!slider) throw new Error("Expected the leverage slider");
		expect(getButton(container, "Confirm").disabled).toBe(false);
		expect(modalHarness.isActivationLocked?.()).toBe(false);

		act(() => (slider.onInteractionStart as (value: number) => void)(7));
		expect(getButton(container, "Confirm").disabled).toBe(false);
		expect(modalHarness.isActivationLocked?.()).toBe(true);
		await act(async () => getButton(container, "Confirm").click());
		expect(onApply).not.toHaveBeenCalled();

		act(() => (modalHarness.leverageSliderProps?.onInteractionEnd as () => void)());
		expect(modalHarness.isActivationLocked?.()).toBe(false);
		await act(async () => getButton(container, "Confirm").click());
		expect(onApply).toHaveBeenCalledTimes(1);
		expect(onApply).toHaveBeenCalledWith("cross", 7);
	});

	it("submits mobile leverage at most once before the pending state can rerender", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveApply = resolve;
				}),
		);
		renderModal({
			presentation: "drawer",
			pendingLeverage: 7,
			mobileView: "leverage",
		});

		const confirm = getButton(container, "Confirm");
		act(() => {
			confirm.click();
			confirm.click();
		});

		expect(onApply).toHaveBeenCalledTimes(1);
		expect(onApply).toHaveBeenCalledWith("cross", 7);

		await act(async () => resolveApply?.());
	});

	it("locks the successful mobile leverage editor against another draft or submission", async () => {
		const onPendingLeverageChange = vi.fn();
		const overrides = {
			presentation: "drawer" as const,
			marketIdentity: "HYPE",
			pendingLeverage: 7,
			mobileView: "leverage" as const,
			onPendingLeverageChange,
		};
		renderModal(overrides);
		await act(async () => getButton(container, "Confirm").click());
		renderModal({ ...overrides, pendingLeverage: null });

		const successButton = getButton(container, "Updated");
		expect(successButton.disabled).toBe(true);
		expect(getLeverageInput(container).disabled).toBe(true);
		expect(modalHarness.leverageSliderProps?.disabled).toBe(true);

		const onCommit = modalHarness.leverageSliderProps?.onCommit as ((value: number) => void) | undefined;
		act(() => onCommit?.(12));
		act(() => successButton.click());

		expect(onPendingLeverageChange).not.toHaveBeenCalled();
		expect(onApply).toHaveBeenCalledTimes(1);
	});

	it("keeps a new mobile draft ahead of an older commit as that commit is confirmed", () => {
		const onPendingLeverageChange = vi.fn();
		const sharedProps = {
			presentation: "drawer" as const,
			marketIdentity: "HYPE",
			mobileView: "leverage" as const,
			onPendingLeverageChange,
		};
		renderModal({ ...sharedProps, committedLeverage: 15, currentLeverage: 10 });
		expect(getLeverageInput(container).value).toBe("15");

		const onChange = modalHarness.leverageSliderProps?.onChange as ((value: number) => void) | undefined;
		const onCommit = modalHarness.leverageSliderProps?.onCommit as ((value: number) => void) | undefined;
		act(() => onChange?.(17));
		expect(getLeverageInput(container).value).toBe("17");
		act(() => onCommit?.(17));
		expect(onPendingLeverageChange).toHaveBeenCalledWith(17);

		renderModal({ ...sharedProps, committedLeverage: 15, currentLeverage: 10, pendingLeverage: 17 });
		const inputBeforeConfirmation = getLeverageInput(container);
		expect(inputBeforeConfirmation.value).toBe("17");

		renderModal({ ...sharedProps, committedLeverage: null, currentLeverage: 15, pendingLeverage: 17 });
		expect(getLeverageInput(container)).toBe(inputBeforeConfirmation);
		expect(getLeverageInput(container).value).toBe("17");
	});

	it("shows a failed mobile leverage update and allows retrying it", async () => {
		onApply.mockRejectedValueOnce(new Error("Mobile leverage request failed"));
		const sharedProps = {
			presentation: "drawer" as const,
			marketIdentity: "HYPE",
			pendingLeverage: 7,
			mobileView: "leverage" as const,
		};
		renderModal(sharedProps);
		await act(async () => getButton(container, "Confirm").click());

		renderModal({ ...sharedProps, updateError: new Error("Mobile leverage request failed") });
		expect(container.textContent).toContain("Mobile leverage request failed");
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Mobile leverage request failed");

		onApply.mockResolvedValueOnce(undefined);
		await act(async () => getButton(container, "Confirm").click());
		expect(onApply).toHaveBeenCalledTimes(2);
	});

	it("blocks desktop dismissal while a margin or leverage request is in flight", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveApply = resolve;
				}),
		);
		const onOpenChange = vi.fn();
		renderModal({ onOpenChange, pendingLeverage: 7 });

		act(() => getButton(container, "Confirm").click());

		expect(modalHarness.modalDisablePointerDismissal).toBe(true);
		expect(modalHarness.popupShowClose).toBe(false);
		const cancel = vi.fn();
		act(() => modalHarness.modalOpenChange?.(false, { cancel }));
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(onOpenChange).not.toHaveBeenCalled();

		await act(async () => resolveApply?.());
		expect(modalHarness.modalDisablePointerDismissal).toBe(false);
	});

	it("keeps leverage drag renders below the adaptive drawer shell", () => {
		const onPendingLeverageChange = vi.fn();
		renderModal({
			presentation: "drawer",
			mobileView: "leverage",
			pendingLeverage: null,
			onPendingLeverageChange,
		});

		const initialDrawerRenders = modalHarness.adaptiveModalRenders;
		const onChange = modalHarness.leverageSliderProps?.onChange as ((value: number) => void) | undefined;
		const onCommit = modalHarness.leverageSliderProps?.onCommit as ((value: number) => void) | undefined;

		act(() => {
			onChange?.(11);
			onChange?.(12);
			onChange?.(13);
		});

		expect(getLeverageInput(container).value).toBe("13");
		expect(modalHarness.adaptiveModalRenders).toBe(initialDrawerRenders);
		expect(getButton(container, "Confirm").disabled).toBe(true);
		expect(onPendingLeverageChange).not.toHaveBeenCalled();
		expect(onApply).not.toHaveBeenCalled();

		act(() => onCommit?.(13));

		expect(modalHarness.adaptiveModalRenders).toBe(initialDrawerRenders);
		expect(onPendingLeverageChange).toHaveBeenCalledTimes(1);
		expect(onPendingLeverageChange).toHaveBeenCalledWith(13);
		expect(onApply).not.toHaveBeenCalled();
	});

	it("does not rerender the mobile drawer when parent props remain referentially stable", () => {
		const onOpenChange = vi.fn();
		const onPendingLeverageChange = vi.fn();
		const overrides = {
			presentation: "drawer" as const,
			mobileView: "leverage" as const,
			onOpenChange,
			onPendingLeverageChange,
		};
		renderModal(overrides);
		const initialRenders = modalHarness.adaptiveModalRenders;

		renderModal(overrides);

		expect(modalHarness.adaptiveModalRenders).toBe(initialRenders);
	});

	it("locks the complete settings drawer while either action is pending", () => {
		renderModal({
			presentation: "drawer",
			settingsTab: "account",
			isUpdating: true,
			accountModeForm: {
				currentMode: "disabled",
				canChange: true,
				isUpdating: false,
				onApply: vi.fn().mockResolvedValue(undefined),
			},
		});

		expect(modalHarness.dismissible).toBe(false);
		expect(getButton(container, "Position margin").disabled).toBe(true);
		expect(getButton(container, "Account type").disabled).toBe(true);
		expect(getButton(container, "Confirm").disabled).toBe(true);
		expect(container.textContent).not.toContain("Switching");
		expect(container.querySelector('[role="tabpanel"]:not([hidden])')).not.toBeNull();
	});

	it("keeps submitted mobile leverage visible while awaiting automatic close", async () => {
		renderModal({
			presentation: "drawer",
			marketIdentity: "HYPE",
			pendingLeverage: 7,
			mobileView: "leverage",
		});

		await act(async () => getButton(container, "Confirm").click());
		renderModal({
			presentation: "drawer",
			marketIdentity: "HYPE",
			currentLeverage: 10,
			pendingLeverage: null,
			mobileView: "leverage",
		});

		expect(modalHarness.autoCloseTriggers).toBe(1);
		expect(getLeverageInput(container).value).toBe("7");
	});

	it("does not auto-close a new mobile account session after the old same-market request resolves", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveApply = resolve;
				}),
		);
		const onOpenChange = vi.fn();
		renderModal({
			open: true,
			onOpenChange,
			presentation: "drawer",
			marketIdentity: "mainnet:0x1111:perp:1:HYPE",
			pendingLeverage: 7,
			mobileView: "leverage",
		});
		act(() => getButton(container, "Confirm").click());

		renderModal({
			open: true,
			onOpenChange,
			presentation: "drawer",
			marketIdentity: "mainnet:0x2222:perp:1:HYPE",
			pendingLeverage: 5,
			mobileView: "leverage",
		});
		await act(async () => resolveApply?.());

		expect(modalHarness.autoCloseTriggers).toBe(0);
		expect(getLeverageInput(container).value).toBe("5");
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it("resets a keep-mounted mobile success session before reopening", async () => {
		modalHarness.keepAdaptiveMounted = true;
		renderModal({
			presentation: "drawer",
			marketIdentity: "HYPE",
			pendingLeverage: 7,
			mobileView: "leverage",
		});
		await act(async () => getButton(container, "Confirm").click());
		expect(getLeverageInput(container).value).toBe("7");

		renderModal({
			open: false,
			presentation: "drawer",
			marketIdentity: "HYPE",
			currentLeverage: 10,
			pendingLeverage: null,
			mobileView: "leverage",
		});
		renderModal({
			open: true,
			presentation: "drawer",
			marketIdentity: "HYPE",
			currentLeverage: 10,
			pendingLeverage: null,
			mobileView: "leverage",
		});

		expect(modalHarness.autoCloseResets).toBeGreaterThan(0);
		expect(getLeverageInput(container).value).toBe("10");
	});
});
