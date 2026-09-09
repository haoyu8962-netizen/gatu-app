/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeFormScale } from "@/components/trade/tradebox/trade-form-scale";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	setScaleEnd: vi.fn(),
	setScaleLevels: vi.fn(),
	setScaleSkew: vi.fn(),
	setScaleStart: vi.fn(),
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => mocks,
	useScaleEnd: () => "",
	useScaleLevels: () => 4,
	useScaleSkew: () => "1",
	useScaleStart: () => "",
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("TradeFormScale Mid controls", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		mocks.setScaleEnd.mockReset();
		mocks.setScaleLevels.mockReset();
		mocks.setScaleSkew.mockReset();
		mocks.setScaleStart.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("fills both scale boundaries from the provided BBO mid", () => {
		act(() =>
			root.render(<TradeFormScale midPrice="101.25" szDecimals={2} marketType="perp" disabled={false} compact />),
		);

		const midButtons = [...container.querySelectorAll<HTMLButtonElement>("button")].filter(
			(button) => button.textContent?.trim() === "Mid",
		);
		expect(midButtons).toHaveLength(2);
		expect(midButtons.every((button) => button.className.includes("min-w-11"))).toBe(true);
		expect(midButtons.every((button) => button.className.includes("after:inset-0"))).toBe(true);
		expect(midButtons.every((button) => !button.className.includes("after:size-11"))).toBe(true);
		expect(midButtons.every((button) => button.className.includes("ms-1"))).toBe(true);
		expect(midButtons.every((button) => !button.className.includes("ml-1"))).toBe(true);

		act(() => midButtons[0]?.click());
		act(() => midButtons[1]?.click());

		expect(mocks.setScaleStart).toHaveBeenCalledWith("101.2500");
		expect(mocks.setScaleEnd).toHaveBeenCalledWith("101.2500");
	});

	it("keeps compact mobile fields readable with exactly one working mid control per boundary", () => {
		function render(disabled: boolean) {
			act(() =>
				root.render(
					<TradeFormScale midPrice="101.25" szDecimals={2} marketType="perp" disabled={disabled} compact mobileSafe />,
				),
			);
		}
		render(false);
		const inputs = [...container.querySelectorAll<HTMLInputElement>("input")];
		expect(inputs).toHaveLength(4);
		for (const input of inputs) {
			expect(input.classList.contains("h-7")).toBe(true);
			expect(input.closest(".h-8")?.classList.contains("px-2.5")).toBe(true);
			expect(input.classList.contains("max-[1000px]:text-base")).toBe(true);
			expect(input.classList.contains("max-[1000px]:leading-5")).toBe(true);
			expect(input.disabled).toBe(false);
		}
		const midButtons = [...container.querySelectorAll<HTMLButtonElement>("button")];
		expect(midButtons).toHaveLength(2);
		for (const button of midButtons) {
			expect(button.getAttribute("aria-label")).toBe("Use mid price 101.2500");
			expect(button.classList.contains("text-trading-panel-success")).toBe(true);
			expect(button.disabled).toBe(false);
			act(() => button.click());
		}
		expect(mocks.setScaleStart).toHaveBeenCalledExactlyOnceWith("101.2500");
		expect(mocks.setScaleEnd).toHaveBeenCalledExactlyOnceWith("101.2500");
		render(true);
		for (const input of inputs) expect(input.disabled).toBe(true);
		for (const button of midButtons) {
			expect(button.disabled).toBe(true);
			act(() => button.click());
		}
		expect(mocks.setScaleStart).toHaveBeenCalledTimes(1);
		expect(mocks.setScaleEnd).toHaveBeenCalledTimes(1);
	});
});
