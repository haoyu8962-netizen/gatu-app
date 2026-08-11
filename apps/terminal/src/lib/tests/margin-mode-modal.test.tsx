// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarginModeModal } from "@/components/trade/tradebox/margin-mode-modal";
import { createI18nRoot } from "./harness/react";

const modalHarness = vi.hoisted(() => ({
	adaptiveModalRenders: 0,
	adaptiveOpenChange: undefined as ((open: boolean) => void) | undefined,
	autoCloseResets: 0,
	autoCloseTriggers: 0,
	dismissible: true,
	keepAdaptiveMounted: false,
	leverageSliderProps: null as Record<string, unknown> | null,
	modalDisablePointerDismissal: false,
	modalOpenChange: undefined as ((open: boolean, eventDetails?: { cancel: () => void }) => void) | undefined,
	popupShowClose: true,
	presentation: "modal" as "modal" | "drawer",
	tabChange: undefined as ((value: string) => void) | undefined,
	tabsDisabled: false,
	tabValue: "margin",
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({
		children,
		dismissible,
		onOpenChange,
		open,
		presentation,
	}: {
		children: ReactNode;
		dismissible: boolean;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		presentation: "modal" | "drawer";
	}) => {
		modalHarness.adaptiveModalRenders += 1;
		modalHarness.adaptiveOpenChange = onOpenChange;
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
	ModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
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
		modalHarness.popupShowClose = showClose ?? true;
		return createElement("section", props, children);
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
		...props
	}: {
		children: ReactNode;
		containerClassName?: string;
		[key: string]: unknown;
	}) => createElement("button", { ...props, type: "button" }, children),
}));

vi.mock("@/components/trade/tradebox/leverage-slider", () => ({
	LeverageSlider: (props: Record<string, unknown>) => {
		modalHarness.leverageSliderProps = props;
		return createElement("div", { "data-testid": "leverage-slider" });
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

describe("MarginModeModal", () => {
	let container: HTMLDivElement;
	let root: Root;
	let onApply: ReturnType<typeof vi.fn<(mode: "cross" | "isolated", leverage: number) => Promise<void>>>;

	beforeEach(() => {
		modalHarness.adaptiveModalRenders = 0;
		modalHarness.adaptiveOpenChange = undefined;
		modalHarness.autoCloseResets = 0;
		modalHarness.autoCloseTriggers = 0;
		modalHarness.keepAdaptiveMounted = false;
		modalHarness.leverageSliderProps = null;
		modalHarness.modalDisablePointerDismissal = false;
		modalHarness.modalOpenChange = undefined;
		modalHarness.popupShowClose = true;
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
		expect(container.textContent).toContain("HYPE-USDC Margin mode");
		expect(container.textContent).toContain("Position margin");
		expect(container.textContent).toContain("Account type");
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
		await act(async () => getButton(container, "Confirm").click());

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

		expect(container.querySelector("h2")?.textContent).toBe("Adjust leverage7x");
		expect(container.textContent).not.toContain("Position margin");
		expect(container.textContent).not.toContain("Account type");
		expect(container.querySelector('[data-testid="leverage-slider"]')).not.toBeNull();

		await act(async () => getButton(container, "Confirm").click());

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

		expect(container.querySelector("h2")?.textContent).toBe("Adjust leverage13x");
		expect(modalHarness.adaptiveModalRenders).toBe(initialDrawerRenders);
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
		expect(getButton(container, "Switching...").disabled).toBe(true);
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
		expect(container.querySelector("h2")?.textContent).toBe("Adjust leverage7x");
	});

	it("does not auto-close a new mobile market after the old request resolves", async () => {
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
			marketIdentity: "HYPE",
			pendingLeverage: 7,
			mobileView: "leverage",
		});
		act(() => getButton(container, "Confirm").click());

		renderModal({
			open: true,
			onOpenChange,
			presentation: "drawer",
			marketIdentity: "BTC",
			pendingLeverage: 5,
			mobileView: "leverage",
		});
		await act(async () => resolveApply?.());

		expect(modalHarness.autoCloseTriggers).toBe(0);
		expect(container.querySelector("h2")?.textContent).toBe("Adjust leverage5x");
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
		expect(container.querySelector("h2")?.textContent).toBe("Adjust leverage7x");

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
		expect(container.querySelector("h2")?.textContent).toBe("Adjust leverage10x");
	});
});
