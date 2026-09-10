/** @vitest-environment jsdom */

import { act, createElement, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeverageEditor, parseLeverageInput } from "@/components/trade/tradebox/leverage-editor";
import { createI18nRoot } from "./harness/react";

const sliderHarness = vi.hoisted(() => ({
	props: null as Record<string, unknown> | null,
}));

vi.mock("@/components/trade/tradebox/leverage-slider", () => ({
	LeverageSlider: (props: Record<string, unknown>) => {
		sliderHarness.props = props;
		return createElement("div", { "data-testid": "leverage-slider" });
	},
}));

describe("LeverageEditor", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		sliderHarness.props = null;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderEditor(
		onChange: (value: number) => void,
		onDraftChange: (value: number | null) => void,
		variant: "sheet" | "modal" = "sheet",
		onInputValidityChange?: (isValid: boolean) => void,
	) {
		act(() => {
			root.render(
				<LeverageEditor
					value={5}
					max={20}
					disabled={false}
					onChange={onChange}
					onDraftChange={onDraftChange}
					onInputValidityChange={onInputValidityChange}
					variant={variant}
				/>,
			);
		});
	}

	function getInput(): HTMLInputElement {
		const input = container.querySelector('input[aria-label="Leverage"]');
		if (!(input instanceof HTMLInputElement)) throw new Error("Leverage input not found");
		return input;
	}

	function changeInput(input: HTMLInputElement, value: string) {
		const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		valueSetter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	}

	it("keeps drag values in the modal draft and commits once on pointer release", () => {
		const onChange = vi.fn();
		const onDraftChange = vi.fn();
		renderEditor(onChange, onDraftChange);

		const onValueChange = sliderHarness.props?.onChange as ((value: number) => void) | undefined;
		const onValueCommitted = sliderHarness.props?.onCommit as ((value: number) => void) | undefined;

		act(() => {
			onValueChange?.(11);
			onValueChange?.(12);
			onValueChange?.(13);
		});

		expect(onDraftChange).toHaveBeenNthCalledWith(1, 11);
		expect(onDraftChange).toHaveBeenNthCalledWith(2, 12);
		expect(onDraftChange).toHaveBeenNthCalledWith(3, 13);
		expect(onChange).not.toHaveBeenCalled();

		act(() => onValueCommitted?.(13));

		expect(onDraftChange).toHaveBeenLastCalledWith(null);
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith(13);
	});

	it("clears the transient draft when a pointer interaction is cancelled", () => {
		const onChange = vi.fn();
		const onDraftChange = vi.fn();
		renderEditor(onChange, onDraftChange);

		const onValueChange = sliderHarness.props?.onChange as ((value: number) => void) | undefined;
		const onCancel = sliderHarness.props?.onCancel as (() => void) | undefined;

		act(() => onValueChange?.(12));
		act(() => onCancel?.());

		expect(onDraftChange).toHaveBeenNthCalledWith(1, 12);
		expect(onDraftChange).toHaveBeenNthCalledWith(2, null);
		expect(onChange).not.toHaveBeenCalled();
	});

	it.each(["sheet", "modal"] as const)("uses the shared geometry without extra stops in %s", (variant) => {
		renderEditor(vi.fn(), vi.fn(), variant);
		expect(sliderHarness.props?.controlClassName).toBeUndefined();
		expect(sliderHarness.props?.trackClassName).toBeUndefined();
		expect(sliderHarness.props?.thumbClassName).toBeUndefined();
		expect(container.querySelector("[data-slider-ticks]")).toBeNull();
	});

	it("does not mount the high leverage warning for an uncommitted drag value", () => {
		act(() => {
			root.render(
				<LeverageEditor
					value={12}
					riskValue={9}
					max={20}
					disabled={false}
					onChange={vi.fn()}
					onDraftChange={vi.fn()}
				/>,
			);
		});

		expect(container.textContent).not.toContain("High leverage significantly increases liquidation risk");
	});

	it("accepts only canonical decimal integers within the market maximum", () => {
		expect(parseLeverageInput("1", 20)).toBe(1);
		expect(parseLeverageInput("20", 20)).toBe(20);
		for (const invalid of ["", "0", "01", "1.5", "1e1", "-1", "+1", " 1", "21", "999999999999999999999"]) {
			expect(parseLeverageInput(invalid, 20)).toBeNull();
		}
	});

	it("keeps invalid text as a non-submittable draft and restores the canonical value on blur", () => {
		const onChange = vi.fn();
		const onDraftChange = vi.fn();
		const onInputValidityChange = vi.fn();
		renderEditor(onChange, onDraftChange, "sheet", onInputValidityChange);
		const input = getInput();

		act(() => changeInput(input, ""));

		expect(input.value).toBe("");
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(onInputValidityChange).toHaveBeenLastCalledWith(false);
		expect(onDraftChange).toHaveBeenLastCalledWith(null);
		expect(onChange).not.toHaveBeenCalled();

		act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

		expect(input.value).toBe("5");
		expect(input.getAttribute("aria-invalid")).toBe("false");
		expect(onInputValidityChange).toHaveBeenLastCalledWith(true);
	});

	it("restores the canonical value on Escape without committing an invalid draft", () => {
		const onChange = vi.fn();
		const onInputValidityChange = vi.fn();
		renderEditor(onChange, vi.fn(), "sheet", onInputValidityChange);
		const input = getInput();

		act(() => changeInput(input, "21"));
		expect(input.value).toBe("21");
		expect(onChange).not.toHaveBeenCalled();

		act(() => input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" })));

		expect(input.value).toBe("5");
		expect(onInputValidityChange).toHaveBeenLastCalledWith(true);
		expect(onChange).not.toHaveBeenCalled();
	});

	it("commits a valid text value without clamping it to a different displayed value", () => {
		const onChange = vi.fn();
		const onInputValidityChange = vi.fn();
		renderEditor(onChange, vi.fn(), "sheet", onInputValidityChange);
		const input = getInput();

		act(() => changeInput(input, "12"));

		expect(input.value).toBe("12");
		expect(onChange).toHaveBeenCalledWith(12);
		expect(onInputValidityChange).toHaveBeenLastCalledWith(true);
	});

	it("ends a valid text edit on Enter without changing the committed pending value", () => {
		const onChange = vi.fn();
		function ControlledEditor() {
			const [value, setValue] = useState(5);
			return (
				<LeverageEditor
					value={value}
					max={20}
					disabled={false}
					onChange={(next) => {
						onChange(next);
						setValue(next);
					}}
					onDraftChange={vi.fn()}
				/>
			);
		}
		act(() => root.render(<ControlledEditor />));
		const input = getInput();

		act(() => changeInput(input, "12"));
		expect(input.value).toBe("12");

		act(() => input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" })));

		expect(input.value).toBe("12");
		expect(input.getAttribute("aria-invalid")).toBe("false");
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith(12);
	});

	it("keeps an invalid Enter draft visible and non-committing", () => {
		const onChange = vi.fn();
		const onInputValidityChange = vi.fn();
		renderEditor(onChange, vi.fn(), "sheet", onInputValidityChange);
		const input = getInput();

		act(() => changeInput(input, "21"));
		act(() => input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" })));

		expect(input.value).toBe("21");
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(onInputValidityChange).toHaveBeenLastCalledWith(false);
		expect(onChange).not.toHaveBeenCalled();
	});
});
