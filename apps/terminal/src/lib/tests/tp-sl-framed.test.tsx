// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TpSlSection } from "@/components/trade/tradebox/tp-sl-section";
import { createI18nRoot } from "./harness/react";

function linkedReturnInputs(overrides?: { onUnitToggle?: () => void; onTpChange?: (value: string) => void }) {
	return {
		unitLabel: "%",
		onUnitToggle: overrides?.onUnitToggle ?? vi.fn(),
		tp: {
			ariaLabel: "Take profit return",
			placeholder: "Profit",
			value: "",
			onChange: overrides?.onTpChange ?? vi.fn(),
		},
		sl: {
			ariaLabel: "Stop loss return",
			placeholder: "Loss",
			value: "",
			onChange: vi.fn(),
		},
	};
}

describe("TpSlSection framed order-panel card", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("renders paired price and return inputs without percent shortcuts or risk/reward card", () => {
		act(() => {
			root.render(
				createElement(TpSlSection, {
					framed: true,
					linkedReturnInputs: linkedReturnInputs(),
					onSlPriceChange: vi.fn(),
					onTpPriceChange: vi.fn(),
					referencePrice: 100,
					side: "buy",
					size: 1,
					slPrice: "95",
					szDecimals: 2,
					tpPrice: "110",
				}),
			);
		});

		expect(container.querySelector('input[placeholder="TP Price"]')).not.toBeNull();
		expect(container.querySelector('input[placeholder="SL Price"]')).not.toBeNull();
		expect(container.querySelector('input[placeholder="Profit"]')).not.toBeNull();
		expect(container.querySelector('input[placeholder="Loss"]')).not.toBeNull();
		expect(container.querySelector('button[aria-label="Set to 25%"]')).toBeNull();
		expect(container.textContent).not.toContain("Risk/Reward");
		expect(container.textContent).toContain("Estimated PnL after trigger");
	});

	it("uses a two-column framed layout without outer card background", () => {
		act(() => {
			root.render(
				createElement(TpSlSection, {
					framed: true,
					linkedReturnInputs: linkedReturnInputs(),
					mobileTouchSafe: true,
					onSlPriceChange: vi.fn(),
					onTpPriceChange: vi.fn(),
					referencePrice: 100,
					side: "buy",
					size: 1,
					slPrice: "",
					szDecimals: 2,
					tpPrice: "",
				}),
			);
		});

		const section = container.firstElementChild as HTMLElement | null;
		expect(section?.className).not.toContain("bg-trading-panel-card");
		expect(section?.className).not.toContain("border-trading-panel-stroke-card");

		const tpPriceFrame = container.querySelector<HTMLInputElement>('input[placeholder="TP Price"]')?.parentElement;
		const tpReturnFrame = container.querySelector<HTMLInputElement>('input[placeholder="Profit"]')?.parentElement;
		const row = tpPriceFrame?.parentElement;

		expect(row?.className).toContain("grid-cols-2");
		expect(tpPriceFrame?.className).toContain("w-full");
		expect(tpPriceFrame?.className).toContain("box-border");
		expect(tpPriceFrame?.className).not.toContain("min-w-[");
		expect(tpReturnFrame?.className).toContain("w-full");
		expect(tpReturnFrame?.className).toContain("box-border");
		expect(tpReturnFrame?.className).not.toContain("min-w-[");
	});

	it("shows direction errors instead of the estimated PnL line", () => {
		act(() => {
			root.render(
				createElement(TpSlSection, {
					framed: true,
					linkedReturnInputs: linkedReturnInputs(),
					onSlPriceChange: vi.fn(),
					onTpPriceChange: vi.fn(),
					referencePrice: 100,
					side: "buy",
					size: 1,
					slPrice: "",
					szDecimals: 2,
					tpError: "Take profit trigger must be above mark",
					tpPrice: "90",
				}),
			);
		});

		expect(container.textContent).toContain("Take profit trigger must be above mark");
	});

	it("toggles the return unit from the paired input", () => {
		const onUnitToggle = vi.fn();
		act(() => {
			root.render(
				createElement(TpSlSection, {
					framed: true,
					linkedReturnInputs: linkedReturnInputs({ onUnitToggle }),
					onSlPriceChange: vi.fn(),
					onTpPriceChange: vi.fn(),
					referencePrice: 100,
					side: "buy",
					size: 1,
					slPrice: "",
					szDecimals: 2,
					tpPrice: "",
				}),
			);
		});

		const unitButtons = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter(
			(button) => button.textContent === "%",
		);
		expect(unitButtons.length).toBe(2);
		act(() => unitButtons[0]?.click());
		expect(onUnitToggle).toHaveBeenCalledTimes(1);
	});
});
