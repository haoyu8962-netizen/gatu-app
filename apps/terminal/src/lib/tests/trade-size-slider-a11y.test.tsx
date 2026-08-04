/** @vitest-environment jsdom */

import { act, useId } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeSizeSlider } from "@/components/trade/components/trade-size-slider";

function AccessibleSliderFixture() {
	const descriptionId = useId();

	return (
		<>
			<TradeSizeSlider
				value={50}
				onPercentChange={vi.fn()}
				ariaLabel="Close percentage"
				ariaValueText="50% requested; 46.6% after size precision"
				ariaDescribedBy={descriptionId}
				ariaInvalid
			/>
			<p id={descriptionId}>Close percentage is invalid</p>
		</>
	);
}

describe("TradeSizeSlider accessibility", () => {
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

	it("exposes native range semantics and thumb accessibility state", () => {
		act(() => {
			root.render(<AccessibleSliderFixture />);
		});

		const input = container.querySelector<HTMLInputElement>('input[type="range"]');
		const labelledBy = input?.getAttribute("aria-labelledby");
		expect(labelledBy).toBeTruthy();
		const label = container.querySelector(`#${labelledBy}`);
		expect(label?.textContent).toBe("Close percentage");
		expect(label?.parentElement?.className).toContain("sr-only");
		expect(input?.min).toBe("0");
		expect(input?.max).toBe("100");
		expect(input?.step).toBe("0.1");
		expect(input?.value).toBe("50");
		expect(input?.getAttribute("aria-valuenow")).toBe("50");
		expect(input?.getAttribute("aria-valuetext")).toBe("50% requested; 46.6% after size precision");
		expect(input?.getAttribute("aria-orientation")).toBe("horizontal");
		const describedBy = input?.getAttribute("aria-describedby");
		expect(describedBy).toBeTruthy();
		expect(container.querySelector(`#${describedBy}`)?.textContent).toBe("Close percentage is invalid");
		expect(input?.getAttribute("aria-invalid")).toBe("true");
		expect(input?.parentElement?.className).toContain("[&:has(input:focus-visible)]:outline-2");
	});

	it("uses Base UI keyboard handling without leaking fractional floating-point values", () => {
		const onPercentChange = vi.fn();
		act(() => {
			root.render(<TradeSizeSlider value={0.2} onPercentChange={onPercentChange} ariaLabel="Size percentage" />);
		});

		const input = container.querySelector<HTMLInputElement>('input[type="range"]');
		act(() => input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
		expect(onPercentChange).toHaveBeenLastCalledWith(0.3);

		act(() => input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
		expect(onPercentChange).toHaveBeenLastCalledWith(0);

		act(() => input?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
		expect(onPercentChange).toHaveBeenLastCalledWith(100);
	});

	it("removes a disabled slider from native interaction", () => {
		act(() => {
			root.render(<TradeSizeSlider value={50} onPercentChange={vi.fn()} ariaLabel="Size percentage" disabled />);
		});

		const input = container.querySelector<HTMLInputElement>('input[type="range"]');
		expect(input?.disabled).toBe(true);
	});

	it("follows Base UI RTL arrow-key direction", () => {
		const onPercentChange = vi.fn();
		act(() => {
			root.render(
				<DirectionProvider direction="rtl">
					<TradeSizeSlider value={50} onPercentChange={onPercentChange} ariaLabel="Size percentage" />
				</DirectionProvider>,
			);
		});

		const input = container.querySelector<HTMLInputElement>('input[type="range"]');
		act(() => input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
		expect(onPercentChange).toHaveBeenLastCalledWith(49.9);

		act(() => input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
		expect(onPercentChange).toHaveBeenLastCalledWith(50.1);
	});
});

import { DirectionProvider } from "@base-ui/react/direction-provider";
