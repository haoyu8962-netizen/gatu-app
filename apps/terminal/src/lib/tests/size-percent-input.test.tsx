/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SizePercentInput } from "@/components/trade/components/size-percent-input";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TRADE_FORM_FIELDS_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/tradebox/trade-form-fields.tsx"),
	"utf8",
);
const MOBILE_SIZE_CONTROL_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/mobile/mobile-trade-size-control.tsx"),
	"utf8",
);
const DESKTOP_PERCENT_USAGE = TRADE_FORM_FIELDS_SOURCE.match(/<SizePercentInput[\s\S]*?\/>/)?.[0] ?? "";
const DESKTOP_SLIDER_USAGE = TRADE_FORM_FIELDS_SOURCE.match(/<TradeSizeSlider[\s\S]*?\/>/)?.[0] ?? "";

interface RenderOverrides {
	interactionIdentity?: string;
	disabled?: boolean;
	onPercentChange?: (percent: number) => void;
	value?: number;
}

describe("SizePercentInput", () => {
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
		vi.clearAllMocks();
	});

	function renderInput(overrides: RenderOverrides = {}) {
		act(() => {
			root.render(
				<SizePercentInput
					ariaLabel="Size (%)"
					interactionIdentity={overrides.interactionIdentity}
					disabled={overrides.disabled ?? false}
					onPercentChange={overrides.onPercentChange ?? vi.fn()}
					value={overrides.value ?? 25}
				/>,
			);
		});
	}

	function rerender(overrides: RenderOverrides) {
		renderInput(overrides);
	}

	it("derives the displayed percentage from the slider value", () => {
		renderInput({ value: 80.7 });

		const input = getPercentInput(container);
		expect(input.value).toBe("81");
		expect(input.inputMode).toBe("numeric");
		expect(input.nextElementSibling?.textContent).toBe("%");
	});

	it("clamps an entered percentage to the supported 0-100 range", () => {
		const onPercentChange = vi.fn();
		renderInput({ onPercentChange, value: 37.5 });

		const input = getPercentInput(container);
		expect(input.value).toBe("38");

		changeInput(input, "125");
		expect(onPercentChange).toHaveBeenLastCalledWith(100);
		expect(input.value).toBe("100");

		changeInput(input, "0");
		expect(onPercentChange).toHaveBeenLastCalledWith(0);
	});

	it("rejects fractional, negative, and non-numeric percentage entries", () => {
		const onPercentChange = vi.fn();
		renderInput({ onPercentChange, value: 25 });
		const input = getPercentInput(container);

		for (const value of ["62.5", "0.1", "-1", "1e2"]) {
			changeInput(input, value);
			expect(onPercentChange).not.toHaveBeenCalled();
			expect(input.value).toBe("25");
		}
	});

	it("keeps the typed draft while focused so rounding cannot fight the keystrokes", () => {
		const onPercentChange = vi.fn();
		renderInput({ onPercentChange, value: 0 });

		const input = getPercentInput(container);
		act(() => input.focus());
		changeInput(input, "50");
		expect(onPercentChange).toHaveBeenLastCalledWith(50);

		rerender({ onPercentChange, value: 49.9 });
		expect(input.value).toBe("50");
	});

	it("snaps back to the derived percentage on blur", () => {
		const onPercentChange = vi.fn();
		renderInput({ onPercentChange, value: 0 });

		const input = getPercentInput(container);
		act(() => input.focus());
		changeInput(input, "50");

		rerender({ onPercentChange, value: 49.2 });
		act(() => input.blur());
		expect(input.value).toBe("49");
	});

	it("ignores a blank entry instead of applying a zero percent", () => {
		const onPercentChange = vi.fn();
		renderInput({ onPercentChange, value: 25 });

		const input = getPercentInput(container);
		changeInput(input, "");
		expect(onPercentChange).not.toHaveBeenCalled();
		expect(input.value).toBe("");
	});

	it("keeps following the slider while focused until the user types", () => {
		const onPercentChange = vi.fn();
		renderInput({ onPercentChange, value: 25 });

		const input = getPercentInput(container);
		act(() => input.focus());

		rerender({ onPercentChange, value: 60 });
		expect(input.value).toBe("60");
	});

	it("clears a draft on identity changes without remounting the input", () => {
		renderInput({ interactionIdentity: "owner:BTC", value: 25 });
		const input = getPercentInput(container);
		changeInput(input, "80");
		rerender({ interactionIdentity: "owner:HYPE", value: 10 });
		expect(getPercentInput(container)).toBe(input);
		expect(input.value).toBe("10");
		rerender({ interactionIdentity: "owner:BTC", value: 25 });
		expect(input.value).toBe("25");
	});

	it("disables the field when percent sizing is unavailable", () => {
		renderInput({ disabled: true });

		expect(getPercentInput(container).disabled).toBe(true);
	});
});

describe("size percent input wiring", () => {
	it("shares one percent control between the desktop panel and the mobile size control", () => {
		expect(TRADE_FORM_FIELDS_SOURCE).toContain("SizePercentInput");
		expect(MOBILE_SIZE_CONTROL_SOURCE).toContain("SizePercentInput");
		expect(TRADE_FORM_FIELDS_SOURCE).toContain('from "../components/size-percent-input"');
		expect(MOBILE_SIZE_CONTROL_SOURCE).toContain('from "../components/size-percent-input"');
	});

	it("feeds the desktop percent box the slider value, the slider handler, and the slider disabled state", () => {
		expect(DESKTOP_PERCENT_USAGE).toContain("value={sliderValue}");
		expect(DESKTOP_PERCENT_USAGE).toContain("onPercentChange={handleSizePercentApply}");
		expect(DESKTOP_PERCENT_USAGE).toContain("disabled={isFormDisabled || maxSize <= 0}");
	});

	it("dims the desktop percent frame with its sibling input frames", () => {
		expect(DESKTOP_PERCENT_USAGE).toContain('(isFormDisabled || maxSize <= 0) && "opacity-50"');
	});

	it("keeps the desktop slider and tick marks without percentage shortcut buttons", () => {
		expect(DESKTOP_SLIDER_USAGE).toContain("value={sliderValue}");
		expect(DESKTOP_SLIDER_USAGE).toContain("onPercentChange={handleSizePercentApply}");
		expect(DESKTOP_SLIDER_USAGE).toContain("disabled={isFormDisabled || maxSize <= 0}");
		expect(TRADE_FORM_FIELDS_SOURCE).not.toContain("SliderTickMarks");
		expect(TRADE_FORM_FIELDS_SOURCE).not.toContain("Math.abs(sliderValue - pct)");
		expect(TRADE_FORM_FIELDS_SOURCE).not.toContain("{pct}%");
		expect(TRADE_FORM_FIELDS_SOURCE).not.toContain("accentTextClass");
	});
});

function getPercentInput(container: HTMLElement): HTMLInputElement {
	const input = container.querySelector<HTMLInputElement>('input[aria-label="Size (%)"]');
	if (!input) throw new Error("Expected the percent input");
	return input;
}

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	act(() => {
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}
