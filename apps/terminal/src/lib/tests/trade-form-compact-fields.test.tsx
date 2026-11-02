/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeFormScale } from "@/components/trade/tradebox/trade-form-scale";
import { TradeFormTwap } from "@/components/trade/tradebox/trade-form-twap";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	setScaleEnd: vi.fn(),
	setScaleLevels: vi.fn(),
	setScaleSkew: vi.fn(),
	setScaleStart: vi.fn(),
	setTwapMinutes: vi.fn(),
	setTwapRandomize: vi.fn(),
	setTwapStopPrice: vi.fn(),
	setTwapTriggerPrice: vi.fn(),
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => mocks,
	useScaleEnd: () => "",
	useScaleLevels: () => 4,
	useScaleSkew: () => "1",
	useScaleStart: () => "",
	useTwapMinutes: () => 30,
	useTwapAdvancedEnabled: () => true,
	useTwapRandomize: () => true,
	useTwapStopPrice: () => "",
	useTwapTriggerPrice: () => "",
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const twapProps = {
	disabled: false,
	side: "buy",
	quoteToken: "USDC",
	markPx: 100,
	assetId: 0,
	szDecimals: 3,
} as const;

const scaleProps = {
	midPrice: "101.25",
	szDecimals: 2,
	marketType: "perp",
	disabled: false,
} as const;

function inputByLabel(container: HTMLElement, label: string): HTMLInputElement {
	const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
	if (!input) throw new Error(`Missing input labelled ${label}`);
	return input;
}

function frameOf(input: HTMLInputElement): HTMLElement {
	const frame = input.closest<HTMLElement>("[class*='border-trading-panel-stroke-input']");
	if (!frame) throw new Error("Missing trading input frame");
	return frame;
}

function midButtons(container: HTMLElement): HTMLButtonElement[] {
	return [...container.querySelectorAll<HTMLButtonElement>("button")].filter(
		(button) => button.textContent?.trim() === "Mid",
	);
}

describe("compact trade form fields", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		for (const mock of Object.values(mocks)) mock.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("keeps the twap duration values readable by shortening the labels and the frame", () => {
		act(() => root.render(<TradeFormTwap {...twapProps} compact mobileSafe />));

		const minutes = inputByLabel(container, "Minute(s)");
		expect(minutes.value).toBe("30");
		expect(container.textContent).toContain("Mins");
		expect(container.textContent).toContain("Hrs");
		expect(container.textContent).not.toContain("Minute(s)");
		expect(frameOf(minutes).className).toContain("h-8");
		expect(minutes.className).toContain("h-7");
	});

	it("keeps the full desktop twap labels and frame when not compact", () => {
		act(() => root.render(<TradeFormTwap {...twapProps} />));

		const minutes = inputByLabel(container, "Minute(s)");
		expect(container.textContent).toContain("Minute(s)");
		expect(container.textContent).not.toContain("Mins");
		expect(frameOf(minutes).className).toContain("h-10");
	});

	it("hoists the scale Mid affordance out of the input in compact mode", () => {
		act(() => root.render(<TradeFormScale {...scaleProps} compact mobileSafe />));

		const start = inputByLabel(container, "Start Price");
		expect(start.className).not.toContain("pr-20");
		expect(frameOf(start).className).toContain("h-8");
		expect(start.className).toContain("h-7");

		const buttons = midButtons(container);
		expect(buttons).toHaveLength(2);
		expect(buttons[0]?.className).toContain("text-trading-panel-success");

		act(() => buttons[0]?.click());
		act(() => buttons[1]?.click());
		expect(mocks.setScaleStart).toHaveBeenCalledWith("101.25");
		expect(mocks.setScaleEnd).toHaveBeenCalledWith("101.25");
	});

	it("wraps every compact scale field in the trading panel frame", () => {
		act(() => root.render(<TradeFormScale {...scaleProps} compact mobileSafe />));

		for (const label of ["Start Price", "End Price", "Number of Orders", "Size Skew"]) {
			expect(frameOf(inputByLabel(container, label)).className).toContain("border-trading-panel-stroke-input");
		}
	});

	it("keeps the desktop scale layout with the in-input Mid affordance", () => {
		act(() => root.render(<TradeFormScale {...scaleProps} />));

		const start = inputByLabel(container, "Start Price");
		expect(start.className).toContain("pr-20");
		expect(midButtons(container)).toHaveLength(2);
	});
});
