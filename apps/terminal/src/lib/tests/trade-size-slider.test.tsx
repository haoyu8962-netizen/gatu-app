/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sliderMock = vi.hoisted(() => ({
	props: null as Record<string, unknown> | null,
}));

vi.mock("@gatu/ui", () => ({
	Slider: (props: Record<string, unknown>) => {
		sliderMock.props = props;
		return null;
	},
}));

import { TradeSizeSlider } from "@/components/trade/components/trade-size-slider";

describe("TradeSizeSlider", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		sliderMock.props = null;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});

	function render(
		value: number,
		onPercentChange: (value: number) => void,
		onPercentCommit = vi.fn(),
		ariaLabel = "Size (%)",
		ariaValueText?: string,
		ariaDescribedBy?: string,
		ariaInvalid?: boolean,
		thumbAlignment?: "center" | "edge" | "edge-client-only",
	) {
		act(() => {
			root.render(
				<TradeSizeSlider
					value={value}
					onPercentChange={onPercentChange}
					onPercentCancel={onPercentChange}
					onPercentCommit={onPercentCommit}
					ariaLabel={ariaLabel}
					ariaValueText={ariaValueText}
					ariaDescribedBy={ariaDescribedBy}
					ariaInvalid={ariaInvalid}
					thumbAlignment={thumbAlignment}
				/>,
			);
		});
	}

	it("updates size for keyboard changes and always wires the commit boundary", () => {
		const onPercentChange = vi.fn();
		render(25, onPercentChange);

		const onValueChange = sliderMock.props?.onValueChange as
			| ((value: number, details: { reason: string }) => void)
			| undefined;
		expect(onValueChange).toBeTypeOf("function");

		act(() => onValueChange?.(40, { reason: "keyboard" }));
		expect(onPercentChange).toHaveBeenCalledTimes(1);
		expect(onPercentChange).toHaveBeenCalledWith(40);

		render(5, onPercentChange);
		expect(sliderMock.props?.onValueCommitted).toBeTypeOf("function");
		expect(onPercentChange).toHaveBeenCalledTimes(1);
		expect(sliderMock.props?.value).toBe(5);
	});

	it("ignores non-interactive value notifications", () => {
		const onPercentChange = vi.fn();
		render(25, onPercentChange);

		const onValueChange = sliderMock.props?.onValueChange as
			| ((value: number, details: { reason: string }) => void)
			| undefined;
		act(() => onValueChange?.(80, { reason: "none" }));

		expect(onPercentChange).not.toHaveBeenCalled();
		expect(sliderMock.props?.value).toBe(25);
	});

	it("provides the Base UI thumb an accessible label and percentage formatter", () => {
		render(50, vi.fn(), vi.fn(), "Close percentage", "50% requested; 46.6% after size precision");

		expect(sliderMock.props?.label).toBe("Close percentage");
		expect(sliderMock.props?.labelHidden).toBe(true);
		expect(sliderMock.props?.format).toEqual({
			style: "unit",
			unit: "percent",
			maximumFractionDigits: 1,
		});
		expect(sliderMock.props?.["aria-label"]).toBeUndefined();
		const getAriaValueText = sliderMock.props?.getAriaValueText as (() => string) | undefined;
		expect(getAriaValueText?.()).toBe("50% requested; 46.6% after size precision");
	});

	it("forwards thumb accessibility state and alignment", () => {
		render(50, vi.fn(), vi.fn(), "Close percentage", undefined, "close-error", true, "edge");

		expect(sliderMock.props?.["aria-describedby"]).toBe("close-error");
		expect(sliderMock.props?.["aria-invalid"]).toBe(true);
		expect(sliderMock.props?.thumbAlignment).toBe("edge");
	});

	it("blocks Base UI's duplicate native touch channel when Pointer Events are available", () => {
		vi.stubGlobal("PointerEvent", class extends Event {});
		render(25, vi.fn());
		const stopPropagation = vi.fn();
		const onTouchStartCapture = sliderMock.props?.onTouchStartCapture as
			| ((event: { stopPropagation: () => void }) => void)
			| undefined;

		onTouchStartCapture?.({ stopPropagation });

		expect(stopPropagation).toHaveBeenCalledTimes(1);
	});
});
