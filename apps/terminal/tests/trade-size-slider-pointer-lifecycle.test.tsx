/** @vitest-environment jsdom */

import { act, type ComponentProps, type ComponentType, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeSizeSlider } from "@/components/trade/components/trade-size-slider";

interface CommitDetails {
	reason: string;
}

type LifecycleTradeSizeSliderProps = ComponentProps<typeof TradeSizeSlider> & {
	onPercentCommit?: (value: number, details: CommitDetails) => void;
};

const LifecycleTradeSizeSlider = TradeSizeSlider as ComponentType<LifecycleTradeSizeSliderProps>;

interface FixtureProps {
	onPercentChange: (value: number) => void;
	onPercentCommit: (value: number, details: CommitDetails) => void;
}

function SliderFixture({ onPercentChange, onPercentCommit }: FixtureProps) {
	const [value, setValue] = useState(25);

	function handlePercentChange(nextValue: number) {
		onPercentChange(nextValue);
		setValue(nextValue);
	}

	return (
		<>
			<LifecycleTradeSizeSlider
				value={value}
				onPercentChange={handlePercentChange}
				onPercentCommit={onPercentCommit}
				ariaLabel="Size percentage"
			/>
			<output data-testid="parent-value">{value}</output>
		</>
	);
}

function createPointerEvent(
	type: string,
	options: { buttons?: number; clientX: number; pointerId?: number },
): MouseEvent {
	const event = new MouseEvent(type, {
		bubbles: true,
		button: 0,
		buttons: options.buttons ?? 0,
		clientX: options.clientX,
	});
	Object.defineProperties(event, {
		pointerId: { value: options.pointerId ?? 1 },
		pointerType: { value: "mouse" },
	});
	return event;
}

function createRect(left: number, width: number, height: number): DOMRect {
	return {
		bottom: height,
		height,
		left,
		right: left + width,
		top: 0,
		width,
		x: left,
		y: 0,
		toJSON: () => ({}),
	} as DOMRect;
}

describe("TradeSizeSlider pointer lifecycle", () => {
	let container: HTMLDivElement;
	let root: Root;
	let pointerCaptureOwners: Map<number, HTMLElement>;
	let pointerCaptureDescriptors: Record<string, PropertyDescriptor | undefined>;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		pointerCaptureOwners = new Map();
		pointerCaptureDescriptors = Object.fromEntries(
			["setPointerCapture", "hasPointerCapture", "releasePointerCapture"].map((name) => [
				name,
				Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
			]),
		);

		Object.defineProperties(HTMLElement.prototype, {
			setPointerCapture: {
				configurable: true,
				value(this: HTMLElement, pointerId: number) {
					const previousOwner = pointerCaptureOwners.get(pointerId);
					if (previousOwner && previousOwner !== this) {
						pointerCaptureOwners.delete(pointerId);
						previousOwner.dispatchEvent(
							createPointerEvent("lostpointercapture", { clientX: 0, pointerId }),
						);
					}
					pointerCaptureOwners.set(pointerId, this);
				},
			},
			hasPointerCapture: {
				configurable: true,
				value(this: HTMLElement, pointerId: number) {
					return pointerCaptureOwners.get(pointerId) === this;
				},
			},
			releasePointerCapture: {
				configurable: true,
				value(this: HTMLElement, pointerId: number) {
					if (pointerCaptureOwners.get(pointerId) !== this) return;
					pointerCaptureOwners.delete(pointerId);
					this.dispatchEvent(createPointerEvent("lostpointercapture", { clientX: 0, pointerId }));
				},
			},
		});
		vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		for (const [name, descriptor] of Object.entries(pointerCaptureDescriptors)) {
			if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
			else Reflect.deleteProperty(HTMLElement.prototype, name);
		}
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function renderSlider() {
		const onPercentChange = vi.fn();
		const onPercentCommit = vi.fn();
		act(() => {
			root.render(
				<SliderFixture onPercentChange={onPercentChange} onPercentCommit={onPercentCommit} />,
			);
		});

		const input = container.querySelector<HTMLInputElement>('input[type="range"]');
		const thumb = input?.parentElement;
		const control = thumb?.parentElement;
		const sliderRoot = container.querySelector<HTMLElement>('[role="group"]');
		const parentValue = container.querySelector<HTMLOutputElement>('[data-testid="parent-value"]');
		if (!input || !thumb || !control || !sliderRoot || !parentValue) {
			throw new Error("Trade size slider DOM is incomplete");
		}

		Object.defineProperty(control, "getBoundingClientRect", {
			configurable: true,
			value: () => createRect(10, 100, 20),
		});
		Object.defineProperty(thumb, "getBoundingClientRect", {
			configurable: true,
			value: () => createRect(27, 16, 16),
		});

		return { control, input, onPercentChange, onPercentCommit, parentValue, sliderRoot, thumb };
	}

	function startDrag(slider: ReturnType<typeof renderSlider>) {
		act(() => {
			slider.thumb.dispatchEvent(createPointerEvent("pointerdown", { buttons: 1, clientX: 35 }));
			document.dispatchEvent(createPointerEvent("pointermove", { buttons: 1, clientX: 90 }));
		});

		expect(slider.onPercentChange).toHaveBeenLastCalledWith(80);
		expect(slider.parentValue.value).toBe("80");
		expect(slider.input.value).toBe("80");
		expect(slider.sliderRoot.hasAttribute("data-dragging")).toBe(true);
		expect(slider.onPercentCommit).not.toHaveBeenCalled();
	}

	it.each(["pointercancel", "lostpointercapture", "hidden document"])(
		"rolls back an active preview without committing on %s",
		(boundary) => {
			const slider = renderSlider();
			startDrag(slider);

			if (boundary === "pointercancel") {
				act(() =>
					document.dispatchEvent(createPointerEvent("pointercancel", { clientX: 90, pointerId: 1 })),
				);
			} else if (boundary === "lostpointercapture") {
				act(() =>
					slider.control.dispatchEvent(
						createPointerEvent("lostpointercapture", { clientX: 90, pointerId: 1 }),
					),
				);
			} else {
				vi.spyOn(document, "hidden", "get").mockReturnValue(true);
				vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
				act(() => document.dispatchEvent(new Event("visibilitychange")));
			}

			expect(slider.onPercentCommit).not.toHaveBeenCalled();
			expect(slider.onPercentChange).toHaveBeenLastCalledWith(25);
			expect(slider.parentValue.value).toBe("25");
			expect(slider.input.value).toBe("25");
			expect(slider.sliderRoot.hasAttribute("data-dragging")).toBe(false);
		},
	);

	it("commits a completed drag only after Base UI reports onValueCommitted", () => {
		const slider = renderSlider();
		startDrag(slider);

		act(() =>
			document.dispatchEvent(
				createPointerEvent("pointerup", { buttons: 0, clientX: 90, pointerId: 1 }),
			),
		);

		expect(slider.onPercentCommit).toHaveBeenCalledTimes(1);
		expect(slider.onPercentCommit).toHaveBeenCalledWith(80, expect.objectContaining({ reason: "drag" }));
		expect(slider.parentValue.value).toBe("80");
		expect(slider.input.value).toBe("80");
		expect(slider.sliderRoot.hasAttribute("data-dragging")).toBe(false);
	});

	it("keeps Base UI Control as the sole pointer-capture owner", () => {
		const slider = renderSlider();

		act(() =>
			slider.thumb.dispatchEvent(createPointerEvent("pointerdown", { buttons: 1, clientX: 35 })),
		);

		expect(pointerCaptureOwners.get(1)).toBe(slider.control);
	});
});
