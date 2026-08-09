// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarginModeModal } from "@/components/trade/tradebox/margin-mode-modal";
import { createI18nRoot } from "./harness/react";

const modalHarness = vi.hoisted(() => ({
	dismissible: true,
	presentation: "modal" as "modal" | "drawer",
	tabChange: undefined as ((value: string) => void) | undefined,
	tabsDisabled: false,
	tabValue: "margin",
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({
		children,
		dismissible,
		open,
		presentation,
	}: {
		children: ReactNode;
		dismissible: boolean;
		open: boolean;
		presentation: "modal" | "drawer";
	}) => {
		modalHarness.dismissible = dismissible;
		modalHarness.presentation = presentation;
		return open ? createElement("section", { "data-presentation": presentation }, children) : null;
	},
	Button: ({ children, iconLeft: _iconLeft, iconRight: _iconRight, ...props }: Record<string, unknown>) =>
		createElement("button", { ...props, type: "button" }, children as ReactNode),
	Modal: ({ children, open }: { children: ReactNode; open: boolean }) => (open ? children : null),
	ModalContent: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("div", props, children),
	ModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalPopup: ({ children, size: _size, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("section", props, children),
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
	LeverageSlider: () => createElement("div", { "data-testid": "leverage-slider" }),
}));

vi.mock("@/hooks/ui/use-auto-close-success", () => ({
	useAutoCloseSuccess: () => ({ showSuccess: false, trigger: vi.fn() }),
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
});
