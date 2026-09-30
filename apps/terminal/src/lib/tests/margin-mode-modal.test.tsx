import { clearFeedback, feedbackErrorText, feedbackText, latestFeedback } from "./harness/order-feedback";
// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { ApiRequestError, HttpRequestError } from "@nktkas/hyperliquid";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarginModeModal } from "@/components/trade/tradebox/margin-mode-modal";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";
import { createI18nRoot } from "./harness/react";

const LEVERAGE_DECREASE_ERROR =
	"Cross position does not have sufficient margin available to decrease leverage. To decrease leverage, deposit more collateral.";
const LEVERAGE_DECREASE_MESSAGE =
	"Cross positions do not have enough available margin to lower the leverage. Deposit more collateral to lower it.";
const CHINESE_LEVERAGE_DECREASE_MESSAGE = "全仓仓位的可用保证金不足，无法降低杠杆。请存入更多抵押品后再降低杠杆。";

function messageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const CHINESE_MESSAGES: Messages = {
	[messageId("Adjust leverage")]: "调整杠杆",
	[messageId("Update failed")]: "更新失败",
	[messageId(LEVERAGE_DECREASE_MESSAGE)]: CHINESE_LEVERAGE_DECREASE_MESSAGE,
	[messageId("Position data is unavailable")]: "持仓数据不可用",
};

const modalHarness = vi.hoisted(() => ({
	isActivationLocked: undefined as (() => boolean) | undefined,
	adaptiveClassName: "",
	adaptiveModalRenders: 0,
	adaptiveOpenChange: undefined as ((open: boolean) => void) | undefined,
	adaptiveOverlayClassName: "",
	dismissible: true,
	keepAdaptiveMounted: false,
	leverageSliderProps: null as Record<string, unknown> | null,
	modalDisablePointerDismissal: false,
	modalOpenChange: undefined as ((open: boolean, eventDetails?: { cancel: () => void }) => void) | undefined,
	popupClassName: "",
	popupOverlayClassName: "",
	popupShowClose: true,
	presentation: "modal" as "modal" | "drawer",
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

const feedbackIdentity = vi.hoisted(() => ({
	clientKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	env: "Mainnet",
}));
vi.mock("@/lib/hyperliquid", () => ({ useHyperliquid: () => feedbackIdentity }));

describe("MarginModeModal", () => {
	let container: HTMLDivElement;
	let root: Root;
	let onApply: ReturnType<typeof vi.fn<(mode: "cross" | "isolated", leverage: number) => Promise<number | null>>>;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		feedbackIdentity.clientKey = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		feedbackIdentity.env = "Mainnet";
		clearFeedback();
		modalHarness.adaptiveClassName = "";
		modalHarness.adaptiveModalRenders = 0;
		modalHarness.adaptiveOpenChange = undefined;
		modalHarness.adaptiveOverlayClassName = "";
		modalHarness.keepAdaptiveMounted = false;
		modalHarness.leverageSliderProps = null;
		modalHarness.modalDisablePointerDismissal = false;
		modalHarness.modalOpenChange = undefined;
		modalHarness.popupClassName = "";
		modalHarness.popupOverlayClassName = "";
		modalHarness.popupShowClose = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		onApply = vi
			.fn<(mode: "cross" | "isolated", leverage: number) => Promise<number | null>>()
			.mockImplementation(async (_mode, leverage) => leverage);
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

	it("records the old network result without closing the new same-market session", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			(_mode, leverage) =>
				new Promise<number | null>((resolve) => {
					resolveApply = () => resolve(leverage);
				}),
		);
		const onOpenChange = vi.fn();
		renderModal({
			onOpenChange,
			marketIdentity: "mainnet:0x1111:perp:1:HYPE",
		});
		act(() => getButton(container, "Isolated").click());
		act(() => getButton(container, "Confirm").click());

		feedbackIdentity.env = "Testnet";
		renderModal({
			onOpenChange,
			marketIdentity: "testnet:0x1111:perp:1:HYPE",
		});
		expect(getButton(container, "Cross").getAttribute("aria-pressed")).toBe("true");
		expect(getButton(container, "Confirm").disabled).toBe(true);

		await act(async () => resolveApply?.());

		expect(latestFeedback("success")).toMatchObject({
			owner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			env: "Mainnet",
		});
		expect(latestFeedback("failed")).toBeUndefined();
		expect(onOpenChange).toHaveBeenCalledOnce();
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
			(_mode, leverage) =>
				new Promise<number | null>((resolve) => {
					resolveApply = () => resolve(leverage);
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

	it("closes the mobile leverage sheet at the click and reports the new leverage through a notification", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			(_mode, leverage) =>
				new Promise<number | null>((resolve) => {
					resolveApply = () => resolve(leverage);
				}),
		);
		const onOpenChange = vi.fn();
		renderModal({
			onOpenChange,
			presentation: "drawer",
			marketIdentity: "HYPE",
			pendingLeverage: 7,
			mobileView: "leverage",
		});

		act(() => {
			getButton(container, "Confirm").click();
			getButton(container, "Confirm").click();
		});

		expect(onApply).toHaveBeenCalledTimes(1);
		expect(onOpenChange).toHaveBeenCalledOnce();
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(getButton(container, "Confirm").textContent).toBe("Confirm");
		expect(container.querySelector(".animate-spin")).toBeNull();
		expect(latestFeedback("success")).toBeUndefined();

		await act(async () => resolveApply?.());
		expect(feedbackText("success")).toBe("Leverage updated to 7x");
		expect(container.textContent).not.toContain("Updated");
	});

	it("reports a margin mode change, with the leverage it carried, through one notification", async () => {
		renderModal({ pendingLeverage: 7 });
		act(() => getButton(container, "Isolated").click());

		await act(async () => getButton(container, "Confirm").click());

		expect(onApply).toHaveBeenCalledWith("isolated", 7);
		expect(latestFeedback("success")).toBeDefined();
		expect(feedbackText("success")).toBe("Switched to Isolated margin at 7x");
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

	it("reports a failed mobile leverage update through a notification and allows retrying it", async () => {
		onApply.mockRejectedValueOnce(
			new ApiRequestError({ status: "err", response: LEVERAGE_DECREASE_ERROR }, LEVERAGE_DECREASE_ERROR),
		);
		const onOpenChange = vi.fn();
		const sharedProps = {
			onOpenChange,
			presentation: "drawer" as const,
			marketIdentity: "HYPE",
			pendingLeverage: 7,
			mobileView: "leverage" as const,
		};
		renderModal(sharedProps);
		await act(async () => getButton(container, "Confirm").click());

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(feedbackText("failed", "title")).toBe("Adjust leverage");
		expect(feedbackErrorText(latestFeedback("failed"))).toBe(LEVERAGE_DECREASE_MESSAGE);
		expect(container.querySelector('[role="alert"]')).toBeNull();

		onApply.mockResolvedValueOnce(7);
		await act(async () => getButton(container, "Confirm").click());
		expect(onApply).toHaveBeenCalledTimes(2);
	});

	it("titles a leverage-only notification Adjust leverage and a margin mode change Margin mode", async () => {
		renderModal({ presentation: "drawer", pendingLeverage: 7, mobileView: "leverage" });
		await act(async () => getButton(container, "Confirm").click());
		expect(feedbackText("success", "title")).toBe("Adjust leverage");

		clearFeedback();
		renderModal({ pendingLeverage: 7, showLeverage: true });
		await act(async () => getButton(container, "Confirm").click());
		expect(feedbackText("success", "title")).toBe("Adjust leverage");
		expect(feedbackText("success")).toBe("Leverage updated to 7x");

		clearFeedback();
		renderModal({ open: false });
		renderModal({ pendingLeverage: 7 });
		act(() => getButton(container, "Isolated").click());
		await act(async () => getButton(container, "Confirm").click());
		expect(feedbackText("success", "title")).toBe("Margin mode");

		clearFeedback();
		renderModal({ open: false });
		renderModal({ presentation: "drawer", mobileView: "margin" });
		act(() => getButton(container, "Isolated").click());
		onApply.mockRejectedValueOnce(new Error("request failed"));
		await act(async () => getButton(container, "Confirm").click());
		expect(feedbackText("failed", "title")).toBe("Margin mode");
	});

	it("re-renders a stored exchange rejection in the language the user switches to", async () => {
		onApply.mockRejectedValueOnce(
			new ApiRequestError({ status: "err", response: LEVERAGE_DECREASE_ERROR }, LEVERAGE_DECREASE_ERROR),
		);
		renderModal({ presentation: "drawer", pendingLeverage: 7, mobileView: "leverage" });
		await act(async () => getButton(container, "Confirm").click());
		const failed = latestFeedback("failed");
		expect(feedbackErrorText(failed)).toBe(LEVERAGE_DECREASE_MESSAGE);

		act(() => i18n.loadAndActivate({ locale: "zh", messages: CHINESE_MESSAGES }));

		expect(feedbackText("failed", "title")).toBe("调整杠杆");
		expect(feedbackText("failed")).toBe("更新失败");
		expect(feedbackErrorText(failed)).toBe(CHINESE_LEVERAGE_DECREASE_MESSAGE);
	});

	it("shows an unknown exchange text unchanged and never an untranslated error of our own", async () => {
		const unknownRejection = "Leverage cannot be changed while an order is resting.";
		onApply.mockRejectedValueOnce(new ApiRequestError({ status: "err", response: unknownRejection }, unknownRejection));
		renderModal({ presentation: "drawer", pendingLeverage: 7, mobileView: "leverage" });
		await act(async () => getButton(container, "Confirm").click());
		expect(feedbackErrorText(latestFeedback("failed"))).toBe(unknownRejection);

		clearFeedback();
		onApply.mockRejectedValueOnce(new Error("Leverage request no longer matches the selected market"));
		await act(async () => getButton(container, "Confirm").click());
		expect(feedbackText("failed")).toBe("Update failed");
		expect(feedbackErrorText(latestFeedback("failed"))).toBe("");

		clearFeedback();
		onApply.mockRejectedValueOnce(new LocalizedActionError(msg`Position data is unavailable`));
		await act(async () => getButton(container, "Confirm").click());
		expect(feedbackErrorText(latestFeedback("failed"))).toBe("Position data is unavailable");
		act(() => i18n.loadAndActivate({ locale: "zh", messages: CHINESE_MESSAGES }));
		expect(feedbackErrorText(latestFeedback("failed"))).toBe("持仓数据不可用");
	});

	it("reports an ambiguous result as unconfirmed without repeating it in an error line", async () => {
		onApply.mockRejectedValueOnce(new HttpRequestError({ detail: "Request timed out after 10000 ms" }));
		renderModal({ presentation: "drawer", pendingLeverage: 7, mobileView: "leverage" });
		await act(async () => getButton(container, "Confirm").click());

		expect(latestFeedback("unconfirmed")?.error).toBeUndefined();
		expect(feedbackText("unconfirmed")).toBe("Update not confirmed. Check account settings before retrying.");
	});

	it("keeps the desktop dialog dismissible while a margin or leverage request is in flight", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			(_mode, leverage) =>
				new Promise<number | null>((resolve) => {
					resolveApply = () => resolve(leverage);
				}),
		);
		const onOpenChange = vi.fn();
		renderModal({ onOpenChange, pendingLeverage: 7 });

		act(() => getButton(container, "Confirm").click());

		expect(onOpenChange).toHaveBeenCalledOnce();
		expect(modalHarness.modalDisablePointerDismissal).toBe(false);
		expect(modalHarness.popupShowClose).toBe(true);
		act(() => modalHarness.modalOpenChange?.(false));
		expect(onOpenChange).toHaveBeenCalledTimes(2);

		await act(async () => resolveApply?.());
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

	it("shows the max position row in the mobile leverage drawer and follows drags below the drawer shell", async () => {
		const marginTiers = [
			{ lowerBound: "0.0", maxLeverage: 20 },
			{ lowerBound: "70000000.0", maxLeverage: 10 },
		] as const;
		const onPendingLeverageChange = vi.fn();
		const onOpenChange = vi.fn();
		const drawerProps = {
			presentation: "drawer" as const,
			mobileView: "leverage" as const,
			onOpenChange,
			onPendingLeverageChange,
			marginTiers,
			quoteSymbol: "USDC",
		};
		renderModal(drawerProps);
		const row = container.querySelector('[data-slot="info-row"]');
		const rowValue = () => container.querySelector('[data-slot="info-row-value"]')?.textContent;
		const initialDrawerRenders = modalHarness.adaptiveModalRenders;
		expect(row).not.toBeNull();
		expect(rowValue()).toBe("No tier limit");

		const onChange = modalHarness.leverageSliderProps?.onChange as ((value: number) => void) | undefined;
		act(() => onChange?.(11));
		expect(rowValue()).toBe("$70,000,000");
		act(() => onChange?.(10));
		expect(rowValue()).toBe("No tier limit");
		act(() => onChange?.(15));
		expect(rowValue()).toBe("$70,000,000");
		expect(container.querySelector('[data-slot="info-row"]')).toBe(row);
		expect(modalHarness.adaptiveModalRenders).toBe(initialDrawerRenders);
		expect(onPendingLeverageChange).not.toHaveBeenCalled();

		const onCommit = modalHarness.leverageSliderProps?.onCommit as ((value: number) => void) | undefined;
		act(() => onCommit?.(15));
		expect(onPendingLeverageChange).toHaveBeenCalledWith(15);

		renderModal({ ...drawerProps, pendingLeverage: 15 });
		expect(container.querySelector('[data-slot="info-row"]')).toBe(row);
		expect(rowValue()).toBe("$70,000,000");
		await act(async () => getButton(container, "Confirm").click());

		expect(onApply).toHaveBeenCalledTimes(1);
		expect(onApply).toHaveBeenCalledWith("cross", 15);
		expect(getButton(container, "Confirm").textContent).toBe("Confirm");
	});

	it("does not show the max position row where no leverage editor is rendered", () => {
		const marginTiers = [
			{ lowerBound: "0.0", maxLeverage: 20 },
			{ lowerBound: "70000000.0", maxLeverage: 10 },
		] as const;

		renderModal({ presentation: "drawer", mobileView: "margin", marginTiers, quoteSymbol: "USDC" });
		expect(container.querySelector('[data-slot="info-row"]')).toBeNull();

		renderModal({ presentation: "modal", showLeverage: false, marginTiers, quoteSymbol: "USDC" });
		expect(container.querySelector('input[aria-label="Leverage"]')).toBeNull();
		expect(container.querySelector('[data-slot="info-row"]')).toBeNull();
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

	it("disables the settings forms but keeps the drawer dismissible while either action is pending", () => {
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

		expect(modalHarness.dismissible).toBe(true);
		expect(getButton(container, "Confirm").disabled).toBe(true);
		expect(container.textContent).not.toContain("Switching");
		expect(container.querySelector('[role="tabpanel"]:not([hidden])')).not.toBeNull();
	});

	it("does not notify a new mobile account session about the old same-market request", async () => {
		let resolveApply: (() => void) | undefined;
		onApply.mockImplementation(
			(_mode, leverage) =>
				new Promise<number | null>((resolve) => {
					resolveApply = () => resolve(leverage);
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

		expect(latestFeedback("success")).toMatchObject({
			owner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			env: "Mainnet",
		});
		expect(latestFeedback("failed")).toBeUndefined();
		expect(getLeverageInput(container).value).toBe("5");
		expect(onOpenChange).toHaveBeenCalledOnce();
	});

	it("drops an uncommitted mobile drag when a keep-mounted sheet is reopened", () => {
		modalHarness.keepAdaptiveMounted = true;
		const sharedProps = {
			presentation: "drawer" as const,
			marketIdentity: "HYPE",
			currentLeverage: 10,
			pendingLeverage: null,
			mobileView: "leverage" as const,
		};
		renderModal(sharedProps);
		const onChange = modalHarness.leverageSliderProps?.onChange as ((value: number) => void) | undefined;
		act(() => onChange?.(14));
		expect(getLeverageInput(container).value).toBe("14");

		renderModal({ ...sharedProps, open: false });
		renderModal({ ...sharedProps, open: true });

		expect(getLeverageInput(container).value).toBe("10");
	});
});
