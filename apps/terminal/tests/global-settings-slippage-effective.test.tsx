/** @vitest-environment jsdom */

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "@/lib/tests/harness/react";

const slippageHarness = vi.hoisted(() => ({
	inputProps: null as Record<string, unknown> | null,
	sliderProps: null as Record<string, unknown> | null,
	storeValue: 0.5,
	setStoreValue: vi.fn((requested: number) => {
		const committed = Math.min(Math.max(requested, 0.1), 5);
		slippageHarness.storeValue = committed;
		return committed;
	}),
}));

vi.mock("@gatu/ui", () => ({
	Button: ({ children, intent: _intent, size: _size, variant: _variant, ...props }: Record<string, unknown>) =>
		createElement("button", { ...props, type: "button" }, children as ReactNode),
	Modal: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalContent: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("div", props, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalPopup: ({ children }: { children: ReactNode }) => createElement("section", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
	SegmentedControlItem: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	SegmentedControls: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	Slider: (props: Record<string, unknown>) => {
		slippageHarness.sliderProps = props;
		return createElement("div", { "data-testid": "slippage-slider" });
	},
	Toggle: () => createElement("div"),
}));

vi.mock("@/components/ui/number-input", () => ({
	NumberInput: ({
		inputSize: _inputSize,
		maxAllowedDecimals: _maxAllowedDecimals,
		mobileSafe: _mobileSafe,
		...props
	}: Record<string, unknown>) => {
		slippageHarness.inputProps = props;
		return createElement("input", props);
	},
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => false,
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

vi.mock(import("../src/stores/use-global-settings-store"), async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		useGlobalSettings: () => ({ ...actual.useGlobalSettings(), showOrderbookInQuote: false }),
		useGlobalSettingsActions: () => ({
			...actual.useGlobalSettingsActions(),
			setMarketOrderSlippagePercent: slippageHarness.setStoreValue,
			setNetwork: vi.fn(),
			setShowOrderbookInQuote: vi.fn(),
			setSkipOrderConfirmation: vi.fn(),
		}),
		useMarketOrderSlippagePercent: () => slippageHarness.storeValue,
		useNetwork: () => "mainnet" as const,
		useSkipOrderConfirmation: () => false,
	};
});

import { GlobalSettingsModal } from "@/components/trade/components/global-settings-modal";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function setNativeInputValue(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("global settings slippage effective-value contracts", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		slippageHarness.inputProps = null;
		slippageHarness.sliderProps = null;
		slippageHarness.storeValue = 0.5;
		slippageHarness.setStoreValue.mockClear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(<GlobalSettingsModal />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("A2 immediately replaces an out-of-range input draft with the value committed by the store", () => {
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Slippage tolerance"]');
		if (!input) throw new Error("Slippage input not found");

		act(() => setNativeInputValue(input, "9"));

		expect.soft(slippageHarness.setStoreValue).toHaveBeenCalledOnce();
		expect.soft(slippageHarness.setStoreValue).toHaveBeenCalledWith(9);
		expect.soft(slippageHarness.storeValue).toBe(5);
		expect.soft(input.value).toBe("5");
	});

	it("A4 exposes the percent unit in the slippage slider aria value text", () => {
		const getAriaValueText = slippageHarness.sliderProps?.getAriaValueText as
			| ((formattedValue: string, value: number, index: number) => string)
			| undefined;

		expect.soft(getAriaValueText).toBeTypeOf("function");
		expect.soft(getAriaValueText?.("2.5", 2.5, 0)).toBe("2.5%");
	});
});
