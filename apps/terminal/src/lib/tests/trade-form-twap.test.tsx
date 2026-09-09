/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeFormTwap } from "@/components/trade/tradebox/trade-form-twap";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	setTwapMinutes: vi.fn(),
	setTwapRandomize: vi.fn(),
	setTwapTriggerPrice: vi.fn(),
	setTwapStopPrice: vi.fn(),
	twapTriggerPrice: "",
	twapStopPrice: "",
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => mocks,
	useTwapMinutes: () => 30,
	useTwapRandomize: () => true,
	useTwapTriggerPrice: () => mocks.twapTriggerPrice,
	useTwapStopPrice: () => mocks.twapStopPrice,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getPriceLabelTexts(container: HTMLElement): string[] {
	return [...container.querySelectorAll("label")]
		.filter((label) => label.textContent?.includes("Price"))
		.map((label) => label.textContent?.replace(/\s+/g, " ").trim() ?? "");
}

function getInputByLabel(container: HTMLElement, text: string): HTMLInputElement {
	const label = [...container.querySelectorAll("label")].find((node) => node.textContent?.includes(text));
	if (!label) throw new Error(`Missing label ${text}`);
	const input = document.getElementById(label.htmlFor);
	if (!(input instanceof HTMLInputElement)) throw new Error(`Missing input for ${text}`);
	return input;
}

const defaultProps = {
	disabled: false,
	side: "buy",
	quoteToken: "USDC",
	markPx: 100,
	assetId: 0,
	szDecimals: 3,
} as const;

describe("TradeFormTwap trigger and stop prices", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		mocks.setTwapMinutes.mockReset();
		mocks.setTwapRandomize.mockReset();
		mocks.setTwapTriggerPrice.mockReset();
		mocks.setTwapStopPrice.mockReset();
		mocks.twapTriggerPrice = "";
		mocks.twapStopPrice = "";
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("renders optional trigger and max price inputs for a buy TWAP", () => {
		act(() => root.render(<TradeFormTwap {...defaultProps} />));

		expect(container.textContent).toContain("Running Time (5m - 7d)");
		expect(getPriceLabelTexts(container)).toEqual(["Trigger Price (USDC)", "Max Price (USDC)"]);
		expect(getInputByLabel(container, "Trigger Price").value).toBe("");
		expect(getInputByLabel(container, "Max Price").value).toBe("");
		expect(container.textContent).not.toContain("Activates when mark");
	});

	it("allows the official seven-day runtime through the hour input", () => {
		act(() => root.render(<TradeFormTwap {...defaultProps} />));
		const hours = container.querySelector<HTMLInputElement>('input[aria-label="Hour(s)"]');
		if (!hours) throw new Error("Missing TWAP hours input");

		act(() => changeInput(hours, "168"));

		expect(mocks.setTwapMinutes).toHaveBeenCalledWith(10_080);
	});

	it("labels the stop price as min price for a sell TWAP", () => {
		act(() => root.render(<TradeFormTwap {...defaultProps} side="sell" quoteToken="USDT0" />));

		expect(getPriceLabelTexts(container)).toEqual(["Trigger Price (USDT0)", "Min Price (USDT0)"]);
	});

	it("writes typed prices back to the order entry store", () => {
		act(() => root.render(<TradeFormTwap {...defaultProps} />));

		act(() => changeInput(getInputByLabel(container, "Trigger Price"), "105.5"));
		act(() => changeInput(getInputByLabel(container, "Max Price"), "110"));

		expect(mocks.setTwapTriggerPrice).toHaveBeenCalledWith("105.5");
		expect(mocks.setTwapStopPrice).toHaveBeenCalledWith("110");
	});

	it("explains the activation direction from the trigger price relative to mark", () => {
		mocks.twapTriggerPrice = "105.5";
		act(() => root.render(<TradeFormTwap {...defaultProps} />));
		expect(container.textContent).toContain("Activates when mark ≥ 105.5");

		mocks.twapTriggerPrice = "95";
		act(() => root.render(<TradeFormTwap {...defaultProps} />));
		expect(container.textContent).toContain("Activates when mark ≤ 95");

		act(() => root.render(<TradeFormTwap {...defaultProps} markPx={0} />));
		expect(container.textContent).not.toContain("Activates when mark");
	});

	it("derives the activation hint from the tick-rounded trigger price, not the raw input", () => {
		mocks.twapTriggerPrice = "117312.4";
		act(() => root.render(<TradeFormTwap {...defaultProps} markPx={117312} szDecimals={5} />));
		expect(container.textContent).not.toContain("Activates when mark");

		mocks.twapTriggerPrice = "117312.6";
		act(() => root.render(<TradeFormTwap {...defaultProps} markPx={117312} szDecimals={5} />));
		expect(container.textContent).toContain("Activates when mark ≥ 117313");
		expect(container.textContent).not.toContain("117312.6");
	});

	it("disables both price inputs with the rest of the form", () => {
		act(() => root.render(<TradeFormTwap {...defaultProps} disabled />));

		expect(getInputByLabel(container, "Trigger Price").disabled).toBe(true);
		expect(getInputByLabel(container, "Max Price").disabled).toBe(true);
	});

	it.each([
		{ compact: true, desktop: false, frameClass: "h-8", inputClass: "h-7" },
		{ compact: false, desktop: true, frameClass: "h-9", inputClass: "h-8" },
	])("preserves $inputClass input geometry and values in the $frameClass frame", (layout) => {
		mocks.twapTriggerPrice = "105.5";
		mocks.twapStopPrice = "110";
		act(() => root.render(<TradeFormTwap {...defaultProps} {...layout} mobileSafe={layout.compact} />));
		const inputs = [...container.querySelectorAll<HTMLInputElement>("input[data-slot='input']")];
		expect(inputs).toHaveLength(4);
		for (const input of inputs) {
			expect(input.classList.contains(layout.inputClass)).toBe(true);
			expect(input.parentElement?.classList.contains(layout.frameClass)).toBe(true);
			expect(input.classList.contains("max-[1000px]:text-base")).toBe(layout.compact);
			expect(input.classList.contains("max-[1000px]:leading-5")).toBe(layout.compact);
			expect(input.disabled).toBe(false);
		}
		expect(inputs.map((input) => input.value)).toEqual(["", "30", "105.5", "110"]);
		act(() => changeInput(getInputByLabel(container, "Trigger Price"), "106.5"));
		expect(mocks.setTwapTriggerPrice).toHaveBeenCalledWith("106.5");
		act(() => changeInput(getInputByLabel(container, "Max Price"), "111"));
		expect(mocks.setTwapStopPrice).toHaveBeenCalledWith("111");
		act(() => root.render(<TradeFormTwap {...defaultProps} {...layout} mobileSafe={layout.compact} disabled />));
		for (const input of inputs) expect(input.disabled).toBe(true);
		expect(inputs.map((input) => input.value)).toEqual(["", "30", "105.5", "110"]);
	});
});
