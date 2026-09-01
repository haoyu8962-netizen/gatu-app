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
});
