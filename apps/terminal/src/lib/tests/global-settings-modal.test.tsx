/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

const testState = vi.hoisted(() => ({
	isMobile: false,
	marketOrderSlippagePercent: 0.5,
	setMarketOrderSlippagePercent: vi.fn((value: number) => {
		testState.marketOrderSlippagePercent = value;
	}),
	setShowOrderbookInQuote: vi.fn(),
	skipOrderConfirmation: false,
	setSkipOrderConfirmation: vi.fn((value: boolean) => {
		testState.skipOrderConfirmation = value;
	}),
	numberInputProps: null as Record<string, unknown> | null,
	sliderProps: null as Record<string, unknown> | null,
	toggleProps: [] as Record<string, unknown>[],
}));

vi.mock("@gatu/ui", () => ({
	Button: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("button", { type: "button", ...props }, children),
	Modal: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalPopup: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
	SegmentedControlItem: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	SegmentedControls: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	Slider: (props: Record<string, unknown>) => {
		testState.sliderProps = props;
		return createElement("div", { "data-testid": "slider" });
	},
	Toggle: (props: Record<string, unknown>) => {
		testState.toggleProps.push(props);
		return createElement("div");
	},
}));

vi.mock("@/components/ui/number-input", () => ({
	NumberInput: (props: Record<string, unknown>) => {
		testState.numberInputProps = props;
		return createElement("input", { readOnly: true, value: String(props.value ?? "") });
	},
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: "0xabc", env: "Mainnet" }),
}));

vi.mock("@/lib/trade/position-market-close-confirmation-preference", () => ({
	readPositionMarketCloseConfirmationPreference: () => "required",
	resetPositionMarketCloseConfirmation: () => "required",
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useSettingsDialogActions: () => ({ close: vi.fn() }),
	useSettingsDialogOpen: () => true,
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useGlobalSettings: () => ({ showOrderbookInQuote: false }),
	useGlobalSettingsActions: () => ({
		setMarketOrderSlippagePercent: testState.setMarketOrderSlippagePercent,
		setNetwork: vi.fn(),
		setShowOrderbookInQuote: testState.setShowOrderbookInQuote,
		setSkipOrderConfirmation: testState.setSkipOrderConfirmation,
	}),
	useMarketOrderSlippagePercent: () => testState.marketOrderSlippagePercent,
	useNetwork: () => "mainnet",
	useSkipOrderConfirmation: () => testState.skipOrderConfirmation,
}));

import { GlobalSettingsModal } from "@/components/trade/components/global-settings-modal";

describe("GlobalSettingsModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		testState.isMobile = false;
		testState.marketOrderSlippagePercent = 0.5;
		testState.setMarketOrderSlippagePercent.mockClear();
		testState.setShowOrderbookInQuote.mockClear();
		testState.skipOrderConfirmation = false;
		testState.setSkipOrderConfirmation.mockClear();
		testState.numberInputProps = null;
		testState.sliderProps = null;
		testState.toggleProps = [];
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		renderModal();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderModal() {
		act(() => root.render(createElement(I18nProvider, { i18n }, createElement(GlobalSettingsModal))));
	}

	it("keeps drag updates local and persists only the committed slippage", () => {
		const onValueChange = testState.sliderProps?.onValueChange as ((value: number) => void) | undefined;
		const onValueCommitted = testState.sliderProps?.onValueCommitted as ((value: number) => void) | undefined;

		act(() => onValueChange?.(1.2));

		expect(testState.setMarketOrderSlippagePercent).not.toHaveBeenCalled();
		expect(testState.sliderProps?.value).toBe(1.2);
		expect(testState.numberInputProps?.value).toBe("1.2");

		act(() => onValueCommitted?.(1.2));

		expect(testState.setMarketOrderSlippagePercent).toHaveBeenCalledTimes(1);
		expect(testState.setMarketOrderSlippagePercent).toHaveBeenCalledWith(1.2);
		expect(testState.sliderProps?.value).toBe(1.2);
	});

	it("shows the order confirmation toggle on and writes the inverted skip flag when turned off", () => {
		const toggle = findOrderConfirmationToggle();

		expect(toggle?.checked).toBe(true);

		act(() => (toggle?.onCheckedChange as ((next: boolean) => void) | undefined)?.(false));

		expect(testState.setSkipOrderConfirmation).toHaveBeenCalledTimes(1);
		expect(testState.setSkipOrderConfirmation).toHaveBeenCalledWith(true);
	});

	it("renders the toggle off once the skip preference is stored", () => {
		testState.skipOrderConfirmation = true;
		testState.toggleProps = [];
		renderModal();

		const toggle = findOrderConfirmationToggle();

		expect(toggle?.checked).toBe(false);

		act(() => (toggle?.onCheckedChange as ((next: boolean) => void) | undefined)?.(true));

		expect(testState.setSkipOrderConfirmation).toHaveBeenCalledWith(false);
	});

	it("names the slippage input and every settings toggle", () => {
		expect(testState.numberInputProps?.["aria-label"]).toBe("Slippage tolerance");
		expect(testState.numberInputProps?.mobileSafe).toBe(true);
		expect(testState.numberInputProps?.className).toContain("max-[1000px]:h-8");
		expect(testState.toggleProps.map((props) => props["aria-label"])).toEqual(["Order confirmation"]);

		testState.isMobile = true;
		testState.toggleProps = [];
		act(() => root.unmount());
		root = createRoot(container);
		renderModal();

		expect(testState.toggleProps.map((props) => props["aria-label"])).toEqual([
			"Order confirmation",
			"Order book in quote asset",
		]);
	});

	it("hides the order book unit setting on the desktop layout", () => {
		expect(findOrderbookUnitToggle()).toBeUndefined();
		expect(container.textContent).not.toContain("Order book in quote asset");
	});

	it("shows the order book unit setting on the mobile layout and writes the global preference", () => {
		testState.isMobile = true;
		testState.toggleProps = [];
		renderModal();

		const toggle = findOrderbookUnitToggle();
		expect(toggle?.checked).toBe(false);

		act(() => (toggle?.onCheckedChange as ((next: boolean) => void) | undefined)?.(true));

		expect(testState.setShowOrderbookInQuote).toHaveBeenCalledTimes(1);
		expect(testState.setShowOrderbookInQuote).toHaveBeenCalledWith(true);
		expect(testState.setSkipOrderConfirmation).not.toHaveBeenCalled();
	});

	it("keeps the desktop order book unit source decoupled from the global setting", () => {
		const modalSource = readFileSync(
			resolve(TEST_DIR, "../..", "components/trade/components/global-settings-modal.tsx"),
			"utf8",
		);
		const orderbookPanelSource = readFileSync(
			resolve(TEST_DIR, "../..", "components/trade/orderbook/orderbook-panel.tsx"),
			"utf8",
		);

		expect(modalSource).not.toContain("use-order-entry-store");
		expect(orderbookPanelSource).toContain("useSizeMode");
		expect(orderbookPanelSource).not.toContain("use-global-settings-store");
	});
});

function findOrderConfirmationToggle(): Record<string, unknown> | undefined {
	return testState.toggleProps.find((props) => props["aria-label"] === "Order confirmation");
}

function findOrderbookUnitToggle(): Record<string, unknown> | undefined {
	return testState.toggleProps.find((props) => props["aria-label"] === "Order book in quote asset");
}
