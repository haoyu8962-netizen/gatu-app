// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarginModeModal } from "@/components/trade/tradebox/margin-mode-modal";
import { createI18nRoot } from "./harness/react";

vi.mock("@gatu/ui", () => ({
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
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("button", { ...props, type: "button" }, children),
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
});
