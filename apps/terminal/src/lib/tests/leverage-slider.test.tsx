/** @vitest-environment jsdom */

import { DirectionProvider } from "@base-ui/react/direction-provider";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeverageSlider } from "@/components/trade/tradebox/leverage-slider";
import { createI18nRoot } from "./harness/react";

function createPointerEvent(type: string, options: { clientX: number; pointerId?: number }): MouseEvent {
	const event = new MouseEvent(type, { bubbles: true, clientX: options.clientX });
	Object.defineProperties(event, {
		pointerId: { value: options.pointerId ?? 1 },
		pointerType: { value: "touch" },
	});
	return event;
}

describe("LeverageSlider", () => {
	let container: HTMLDivElement;
	let root: Root;
	let animationFrames: Array<FrameRequestCallback>;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		animationFrames = [];
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
			animationFrames.push(callback);
			return animationFrames.length;
		});
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
	});

	type RenderOptions = {
		onChange: (value: number) => void;
		onCommit: (value: number) => void;
		onCancel?: () => void;
		value: number;
		max: number;
		disabled: boolean;
		direction: "ltr" | "rtl";
	};

	function renderSlider(options: Partial<RenderOptions> = {}) {
		let props: RenderOptions = {
			onChange: vi.fn(),
			onCommit: vi.fn(),
			value: 1,
			max: 10,
			disabled: false,
			direction: "ltr",
			...options,
		};
		function render() {
			act(() => {
				root.render(
					<DirectionProvider direction={props.direction}>
						<LeverageSlider
							value={props.value}
							max={props.max}
							disabled={props.disabled}
							onChange={props.onChange}
							onCommit={props.onCommit}
							onCancel={props.onCancel}
						/>
					</DirectionProvider>,
				);
			});
		}
		render();
		const input = container.querySelector<HTMLInputElement>('input[type="range"]');
		const thumb = input?.parentElement;
		const control = thumb?.parentElement;
		const indicator = control?.firstElementChild?.firstElementChild as HTMLElement | null | undefined;
		if (!input || !thumb || !control || !indicator) throw new Error("Slider DOM is incomplete");
		const getBoundingClientRect = vi.fn(() => ({
			left: 10,
			right: 110,
			top: 0,
			bottom: 32,
			width: 100,
			height: 32,
			x: 10,
			y: 0,
			toJSON: vi.fn(),
		}));
		Object.defineProperty(control, "getBoundingClientRect", { value: getBoundingClientRect });
		const releasePointerCapture = vi.fn();
		Object.defineProperties(control, {
			setPointerCapture: { value: vi.fn() },
			hasPointerCapture: { value: vi.fn(() => true) },
			releasePointerCapture: { value: releasePointerCapture },
		});
		return {
			control,
			getBoundingClientRect,
			indicator,
			input,
			releasePointerCapture,
			rerender(next: Partial<RenderOptions>) {
				props = { ...props, ...next };
				render();
			},
			thumb,
		};
	}

	it("coalesces pointer moves into one transform frame and emits only the latest integer draft", () => {
		const onChange = vi.fn();
		const onCommit = vi.fn();
		const { control, getBoundingClientRect, indicator, thumb } = renderSlider({ onChange, onCommit });

		act(() => {
			control.dispatchEvent(createPointerEvent("pointerdown", { clientX: 10 }));
			control.dispatchEvent(createPointerEvent("pointermove", { clientX: 35 }));
			control.dispatchEvent(createPointerEvent("pointermove", { clientX: 60 }));
		});

		expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
		expect(getBoundingClientRect).toHaveBeenCalledTimes(1);
		expect(onChange).not.toHaveBeenCalled();

		act(() => animationFrames.shift()?.(16));

		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith(6);
		expect(thumb.style.left).toBe("0px");
		expect(thumb.style.transform).toBe("translate3d(50px, -50%, 0) translateX(-50%)");
		expect(indicator.style.transform).toBe("scaleX(0.5)");

		act(() => control.dispatchEvent(createPointerEvent("pointerup", { clientX: 60 })));

		expect(onCommit).toHaveBeenCalledTimes(1);
		expect(onCommit).toHaveBeenCalledWith(6);
	});

	it("restores the starting value when pointer capture is cancelled", () => {
		const onChange = vi.fn();
		const onCommit = vi.fn();
		const onCancel = vi.fn();
		const { control, input } = renderSlider({ onCancel, onChange, onCommit, value: 4 });

		act(() => {
			control.dispatchEvent(createPointerEvent("pointerdown", { clientX: 43 }));
			control.dispatchEvent(createPointerEvent("pointermove", { clientX: 98 }));
			control.dispatchEvent(createPointerEvent("pointercancel", { clientX: 98 }));
			animationFrames[0]?.(16);
		});

		expect(onChange).not.toHaveBeenCalled();
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onCommit).not.toHaveBeenCalled();
		expect(input.value).toBe("4");
	});

	it("clears a rendered preview without emitting another draft when capture is cancelled", () => {
		const onChange = vi.fn();
		const onCancel = vi.fn();
		const { control, input } = renderSlider({ onCancel, onChange, value: 4 });

		act(() => {
			control.dispatchEvent(createPointerEvent("pointerdown", { clientX: 43 }));
			control.dispatchEvent(createPointerEvent("pointermove", { clientX: 98 }));
			animationFrames.shift()?.(16);
		});

		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenLastCalledWith(9);

		act(() => control.dispatchEvent(createPointerEvent("pointercancel", { clientX: 98 })));

		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(input.value).toBe("4");
	});

	it("does not rerender React state while pointer frames remain within one integer step", () => {
		const onChange = vi.fn();
		const { control, getBoundingClientRect } = renderSlider({ onChange });

		act(() => {
			control.dispatchEvent(createPointerEvent("pointerdown", { clientX: 10 }));
			animationFrames.shift()?.(16);
			control.dispatchEvent(createPointerEvent("pointermove", { clientX: 12 }));
			animationFrames.shift()?.(32);
			control.dispatchEvent(createPointerEvent("pointermove", { clientX: 14 }));
			animationFrames.shift()?.(48);
		});

		expect(getBoundingClientRect).toHaveBeenCalledTimes(1);
		expect(onChange).not.toHaveBeenCalled();
	});

	it("preserves native range semantics and integer keyboard commits", () => {
		const onChange = vi.fn();
		const onCommit = vi.fn();
		const { input } = renderSlider({ onChange, onCommit, value: 5 });

		expect(input.min).toBe("1");
		expect(input.max).toBe("10");
		expect(input.step).toBe("1");
		expect(input.labels?.[0]?.textContent).toBe("Leverage");
		expect(container.querySelector("[data-base-ui-swipe-ignore]")).not.toBeNull();

		act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));

		expect(onChange).toHaveBeenCalledWith(6);
		expect(onCommit).toHaveBeenCalledWith(6);
		expect(input.value).toBe("6");
	});

	it("supports native assistive-technology changes", () => {
		const onChange = vi.fn();
		const onCommit = vi.fn();
		const { input } = renderSlider({ onChange, onCommit, value: 5 });

		act(() => {
			input.value = "7";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});

		expect(onChange).toHaveBeenCalledWith(7);
		expect(onCommit).toHaveBeenCalledWith(7);
	});

	it("mirrors pointer geometry and fill origin in RTL", () => {
		const onChange = vi.fn();
		const onCommit = vi.fn();
		const { control, indicator, input, thumb } = renderSlider({
			direction: "rtl",
			onChange,
			onCommit,
		});

		expect(thumb.style.left).toBe("100%");
		expect(indicator.style.transformOrigin).toBe("right center");

		act(() => {
			control.dispatchEvent(createPointerEvent("pointerdown", { clientX: 110 }));
			control.dispatchEvent(createPointerEvent("pointermove", { clientX: 10 }));
			animationFrames.shift()?.(16);
		});

		expect(onChange).toHaveBeenCalledWith(10);
		expect(thumb.style.transform).toContain("0px");
		expect(indicator.style.transform).toBe("scaleX(1)");

		act(() => control.dispatchEvent(createPointerEvent("pointerup", { clientX: 10 })));
		act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));

		expect(onChange).toHaveBeenLastCalledWith(9);
		expect(onCommit).toHaveBeenLastCalledWith(9);
	});

	it.each([
		{ label: "maximum", rerender: { max: 5 }, expectedValue: "5" },
		{ label: "disabled state", rerender: { disabled: true }, expectedValue: "8" },
		{ label: "text direction", rerender: { direction: "rtl" as const }, expectedValue: "8" },
	])("aborts an active drag when the $label changes", ({ rerender: nextProps, expectedValue }) => {
		const onChange = vi.fn();
		const onCancel = vi.fn();
		const onCommit = vi.fn();
		const { control, input, releasePointerCapture, rerender } = renderSlider({
			onCancel,
			onChange,
			onCommit,
			value: 8,
		});

		act(() => {
			control.dispatchEvent(createPointerEvent("pointerdown", { clientX: 88 }));
			control.dispatchEvent(createPointerEvent("pointermove", { clientX: 110 }));
			animationFrames.shift()?.(16);
		});
		expect(onChange).toHaveBeenLastCalledWith(10);

		rerender(nextProps);

		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onCommit).not.toHaveBeenCalled();
		expect(releasePointerCapture).toHaveBeenCalledWith(1);
		expect(input.value).toBe(expectedValue);
	});
});
