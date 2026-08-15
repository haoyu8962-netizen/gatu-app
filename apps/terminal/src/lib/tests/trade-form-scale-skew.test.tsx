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
	scaleSkew: "1",
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => mocks,
	useScaleEnd: () => "",
	useScaleLevels: () => 4,
	useScaleSkew: () => mocks.scaleSkew,
	useScaleStart: () => "",
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getSkewInput(container: HTMLElement): HTMLInputElement {
	const label = [...container.querySelectorAll("span")].find((node) => node.textContent === "Size Skew");
	const input = label?.parentElement?.parentElement?.querySelector("input");
	if (!(input instanceof HTMLInputElement)) throw new Error("Missing Size Skew input");
	return input;
}

describe("TradeFormScale size skew", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		mocks.setScaleSkew.mockReset();
		mocks.scaleSkew = "1";
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("renders the size skew input after the number of orders with the store value", () => {
		mocks.scaleSkew = "2.5";
		act(() => root.render(<TradeFormScale midPrice="100" szDecimals={2} marketType="perp" disabled={false} />));

		const inputs = [...container.querySelectorAll("input")];
		expect(inputs).toHaveLength(4);
		expect(inputs[3]).toBe(getSkewInput(container));
		expect(getSkewInput(container).value).toBe("2.5");
		expect(container.textContent).toContain("0.01–100");
	});

	it("writes the typed skew back to the order entry store", () => {
		act(() => root.render(<TradeFormScale midPrice="100" szDecimals={2} marketType="perp" disabled={false} />));

		act(() => changeInput(getSkewInput(container), "0.5"));

		expect(mocks.setScaleSkew).toHaveBeenCalledWith("0.5");
	});

	it("caps the skew input at four decimals so validation and submission read the same value", () => {
		act(() => root.render(<TradeFormScale midPrice="100" szDecimals={2} marketType="perp" disabled={false} />));

		act(() => changeInput(getSkewInput(container), "1.00001"));
		expect(mocks.setScaleSkew).not.toHaveBeenCalled();

		act(() => changeInput(getSkewInput(container), "1.0001"));
		expect(mocks.setScaleSkew).toHaveBeenCalledWith("1.0001");
	});

	it("disables the skew input with the rest of the form", () => {
		act(() => root.render(<TradeFormScale midPrice="100" szDecimals={2} marketType="perp" disabled />));

		expect(getSkewInput(container).disabled).toBe(true);
	});
});
