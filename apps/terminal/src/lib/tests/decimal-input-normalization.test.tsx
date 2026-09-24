/** @vitest-environment jsdom */

import { act, type ChangeEvent, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeDecimalInputEvent } from "@/components/ui/decimal-input-event";
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

	it("lets the comma key through NumberInput's keydown filter only when the format displays a comma", () => {
		const onChange = vi.fn();
		const pressKey = (key: string): boolean => {
			const input = container.querySelector<HTMLInputElement>("input");
			if (!input) throw new Error("input not rendered");
			let accepted = false;
			act(() => {
				accepted = input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
			});
			return accepted;
		};

		formatSettings.numberFormatLocale = "de-DE";
		act(() => root.render(<NumberInput value="1" onChange={onChange} />));
		expect(pressKey(",")).toBe(true);
		expect(pressKey(".")).toBe(true);
		expect(pressKey("x")).toBe(false);

		formatSettings.numberFormatLocale = "en-US";
		act(() => root.render(<NumberInput value="2" onChange={onChange} />));
		expect(pressKey(",")).toBe(false);
		expect(pressKey(".")).toBe(true);
	});

	it("keeps rejecting a comma in NumberInput under the default format", () => {
		const onChange = vi.fn();
		act(() => root.render(<NumberInput value="" onChange={onChange} />));

		typeValue("1,5");

		expect(onChange).not.toHaveBeenCalled();
	});

	it("rewrites the DOM value in place and keeps the caret for string-variant inputs", () => {
		formatSettings.numberFormatLocale = "fr-FR";
		const seen: Array<{ value: string; caret: number | null }> = [];
		function BareInput() {
			const [value, setValue] = useState("15");
			return (
				<input
					inputMode="decimal"
					value={value}
					onChange={(event) => {
						const next = normalizeDecimalInputEvent(event).target.value;
						seen.push({ value: next, caret: event.target.selectionStart });
						setValue(next);
					}}
				/>
			);
		}
		act(() => root.render(<BareInput />));
		const input = container.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("input not rendered");

		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		act(() => {
			setter?.call(input, "1,5");
			input.setSelectionRange(2, 2);
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});

		expect(seen).toEqual([{ value: "1.5", caret: 2 }]);
		expect(input.value).toBe("1.5");
		expect(input.selectionStart).toBe(2);
	});

	it("leaves the event untouched under the default format", () => {
		const onChange = vi.fn((event: ChangeEvent<HTMLInputElement>) => normalizeDecimalInputEvent(event).target.value);
		act(() => root.render(<input inputMode="decimal" value="" onChange={onChange} />));

		typeValue("0,25");

		expect(onChange.mock.results[0]?.value).toBe("0,25");
	});
});
