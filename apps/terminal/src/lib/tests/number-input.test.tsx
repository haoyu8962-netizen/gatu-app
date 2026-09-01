/** @vitest-environment jsdom */

import type { ComponentProps } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NumberInput } from "@/components/ui/number-input";

describe("NumberInput keyboard stepping", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function stepValue(
		value: string,
		key: "ArrowDown" | "ArrowUp",
		props: Omit<ComponentProps<typeof NumberInput>, "onChange" | "value"> = {},
	): string | undefined {
		const onChange = vi.fn();
		act(() => {
			root.render(<NumberInput {...props} value={value} onChange={onChange} />);
		});

		const input = container.querySelector<HTMLInputElement>("input");
		act(() => input?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key })));

		return onChange.mock.calls.at(-1)?.[0].target.value;
	}

	it("adds decimal steps without floating-point artifacts", () => {
		expect(stepValue("0.1", "ArrowUp", { step: 0.2 })).toBe("0.3");
		expect(stepValue("0.3", "ArrowDown", { step: 0.2 })).toBe("0.1");
	});

	it("emits fixed-point strings for very small steps", () => {
		expect(stepValue("0", "ArrowUp", { maxAllowedDecimals: 30, step: 1e-30 })).toBe("0.000000000000000000000000000001");
		expect(stepValue("0.00000001", "ArrowUp", { maxAllowedDecimals: 8, step: 1e-8 })).toBe("0.00000002");
	});

	it("clamps stepped values to min, max, and non-negative bounds", () => {
		expect(stepValue("0.9", "ArrowUp", { max: 1, step: 0.2 })).toBe("1");
		expect(stepValue("-0.9", "ArrowDown", { allowNegative: true, min: -1, step: 0.2 })).toBe("-1");
		expect(stepValue("0.1", "ArrowDown", { allowNegative: false, min: -1, step: 0.2 })).toBe("0");
	});

	it("rounds stepped values in integer mode without number conversion", () => {
		expect(stepValue("1", "ArrowUp", { allowDecimals: false, step: 0.6 })).toBe("2");
		expect(stepValue("-1", "ArrowDown", { allowDecimals: false, allowNegative: true, step: 0.5 })).toBe("-1");
	});

	it("lets suffixed inputs shrink to fit responsive grid columns", () => {
		act(() => {
			root.render(
				<NumberInput
					className="!rounded-[10px]"
					onChange={vi.fn()}
					suffix="%"
					suffixClassName="right-2.5 text-[13px]"
					value="100.0"
				/>,
			);
		});

		const input = container.querySelector<HTMLInputElement>("input");
		const suffix = input?.parentElement?.querySelector("span");
		expect(input?.className).toContain("w-full");
		expect(input?.className).toContain("!rounded-[10px]");
		expect(input?.parentElement?.className).toContain("min-w-0");
		expect(suffix?.className).toContain("right-2.5");
		expect(suffix?.className).toContain("text-[13px]");
		expect(suffix?.className).not.toContain("right-2 ");
	});

	it("associates its visible label while preserving an explicit input id", () => {
		const explicitId = "transfer-amount";
		act(() => {
			root.render(<NumberInput id={explicitId} label="Amount" onChange={vi.fn()} value="" />);
		});

		const input = container.querySelector<HTMLInputElement>("input");
		const label = container.querySelector<HTMLLabelElement>("label");
		expect(input?.id).toBe(explicitId);
		expect(label?.htmlFor).toBe(explicitId);
		expect(label?.textContent).toBe("Amount");
	});

	it("generates an input id for labels when the caller does not provide one", () => {
		act(() => {
			root.render(<NumberInput label="Price" onChange={vi.fn()} value="" />);
		});

		const input = container.querySelector<HTMLInputElement>("input");
		const label = container.querySelector<HTMLLabelElement>("label");
		expect(input?.id).toBeTruthy();
		expect(label?.htmlFor).toBe(input?.id);
	});

	it("defaults ASCII financial input to LTR while allowing an explicit direction override", () => {
		act(() => root.render(<NumberInput onChange={vi.fn()} value="123.45" />));
		expect(container.querySelector<HTMLInputElement>("input")?.dir).toBe("ltr");

		act(() => root.render(<NumberInput dir="auto" onChange={vi.fn()} value="123.45" />));
		expect(container.querySelector<HTMLInputElement>("input")?.dir).toBe("auto");
	});
});
