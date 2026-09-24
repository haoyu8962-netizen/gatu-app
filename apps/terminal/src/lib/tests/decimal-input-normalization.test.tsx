/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeInputFrameView } from "@/components/trade/tradebox/trade-input-frame-view";
import { NumberInput } from "@/components/ui/number-input";

const formatSettings = vi.hoisted(() => ({
	numberFormatLocale: "en-US" as "en-US" | "de-DE" | "fr-FR",
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => formatSettings.numberFormatLocale,
}));

describe("decimal input normalization", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		formatSettings.numberFormatLocale = "en-US";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function typeValue(value: string): void {
		const input = container.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("input not rendered");
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		act(() => {
			setter?.call(input, value);
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
	}

	it("accepts a typed comma as the decimal point in NumberInput when the format displays a comma", () => {
		formatSettings.numberFormatLocale = "de-DE";
		const onChange = vi.fn((event: { target: HTMLInputElement }) => event.target.value);
		act(() => root.render(<NumberInput value="" onChange={onChange} />));

		typeValue("1,5");

		expect(onChange).toHaveBeenCalledOnce();
		expect(onChange.mock.results[0]?.value).toBe("1.5");
	});

	it("keeps rejecting a comma in NumberInput under the default format", () => {
		const onChange = vi.fn();
		act(() => root.render(<NumberInput value="" onChange={onChange} />));

		typeValue("1,5");

		expect(onChange).not.toHaveBeenCalled();
	});

	it("normalizes the shared trade input frame before the caller reads the event", () => {
		formatSettings.numberFormatLocale = "fr-FR";
		const onChange = vi.fn((event: { target: HTMLInputElement }) => event.target.value);
		act(() => root.render(<TradeInputFrameView label="Size" value="" onChange={onChange} />));

		typeValue("0,25");

		expect(onChange).toHaveBeenCalledOnce();
		expect(onChange.mock.results[0]?.value).toBe("0.25");
	});

	it("passes the shared trade input frame through unchanged under the default format", () => {
		const onChange = vi.fn((event: { target: HTMLInputElement }) => event.target.value);
		act(() => root.render(<TradeInputFrameView label="Size" value="" onChange={onChange} />));

		typeValue("0,25");

		expect(onChange.mock.results[0]?.value).toBe("0,25");
	});
});
