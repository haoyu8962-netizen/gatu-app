/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	marketOrderSlippagePercent: 0.5,
	setMarketOrderSlippagePercent: vi.fn((value: number) => {
		testState.marketOrderSlippagePercent = value;
	}),
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
		setShowOrderbookInQuote: vi.fn(),
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
		testState.marketOrderSlippagePercent = 0.5;
		testState.setMarketOrderSlippagePercent.mockClear();
		testState.skipOrderConfirmation = false;
		testState.setSkipOrderConfirmation.mockClear();
		testState.numberInputProps = null;
		testState.sliderProps = null;
		testState.toggleProps = [];
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(createElement(I18nProvider, { i18n }, createElement(GlobalSettingsModal))));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

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
		act(() => root.render(createElement(I18nProvider, { i18n }, createElement(GlobalSettingsModal))));

		const toggle = findOrderConfirmationToggle();

		expect(toggle?.checked).toBe(false);

		act(() => (toggle?.onCheckedChange as ((next: boolean) => void) | undefined)?.(true));

		expect(testState.setSkipOrderConfirmation).toHaveBeenCalledWith(false);
	});

	it("names the slippage input and every settings toggle", () => {
		expect(testState.numberInputProps?.["aria-label"]).toBe("Slippage tolerance");
		expect(testState.numberInputProps?.mobileSafe).toBe(true);
		expect(testState.numberInputProps?.className).toContain("max-[1000px]:h-8");
		expect(testState.toggleProps.map((props) => props["aria-label"])).toEqual([
			"Order confirmation",
			"Order book in quote asset",
		]);
	});
});

function findOrderConfirmationToggle(): Record<string, unknown> | undefined {
	return testState.toggleProps.find((props) => props["aria-label"] === "Order confirmation");
}
