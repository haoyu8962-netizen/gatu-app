/** @vitest-environment jsdom */

import { act, type ComponentProps, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeSizeSlider } from "@/components/trade/components/trade-size-slider";

type CommitHandler = ComponentProps<typeof TradeSizeSlider>["onPercentCommit"];

interface FixtureProps {
	initialValue?: number;
	onPercentChange: (value: number) => void;
	onPercentCancel: (value: number) => void;
	onPercentCommit: CommitHandler;
}

function SliderFixture({ initialValue = 25, onPercentChange, onPercentCancel, onPercentCommit }: FixtureProps) {
	const [value, setValue] = useState(initialValue);
	const [disabled, setDisabled] = useState(false);
	const [interactionIdentity, setInteractionIdentity] = useState("account-a:BTC");

	function handlePercentChange(nextValue: number) {
		if (disabled) return;
		onPercentChange(nextValue);
		setValue(nextValue);
	}

	function handlePercentCancel(startValue: number) {
		onPercentCancel(startValue);
		setValue(startValue);
	}

	function handlePercentCommit(
		nextValue: number,
		details: Parameters<CommitHandler>[1],
	) {
		onPercentCommit(nextValue, details);
		setValue(nextValue);
	}

	return (
		<>
			<TradeSizeSlider
				value={value}
				interactionIdentity={interactionIdentity}
				onPercentChange={handlePercentChange}
				onPercentCancel={handlePercentCancel}
				onPercentCommit={handlePercentCommit}
				ariaLabel="Size percentage"
				disabled={disabled}
			/>
			<button type="button" data-testid="toggle-disabled" onClick={() => setDisabled((current) => !current)}>
				Toggle disabled
			</button>
			<button type="button" data-testid="external-value" onClick={() => setValue(50)}>
				Set 50
			</button>
			<button type="button" data-testid="switch-identity" onClick={() => setInteractionIdentity("account-b:BTC")}>
				Switch identity
			</button>
			<output data-testid="parent-value">{value}</output>
		</>
	);
}

interface PointerEventOptions {
	buttons?: number;
	clientX: number;
	isPrimary?: boolean;
	pointerId?: number;
}

function createPointerEvent(type: string, options: PointerEventOptions): MouseEvent {
	const event = new MouseEvent(type, {
		bubbles: true,
		button: 0,
		buttons: options.buttons ?? 0,
		clientX: options.clientX,
	});
	Object.defineProperties(event, {
		isPrimary: { value: options.isPrimary ?? true },
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
	let frameCallbacks: Map<number, FrameRequestCallback>;
	let nextFrameId: number;
	let rootMounted: boolean;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		rootMounted = true;
		pointerCaptureOwners = new Map();
		frameCallbacks = new Map();
		nextFrameId = 1;
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
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			const frameId = nextFrameId;
			nextFrameId += 1;
			frameCallbacks.set(frameId, callback);
			return frameId;
		});
		vi.stubGlobal("cancelAnimationFrame", (frameId: number) => {
			frameCallbacks.delete(frameId);
		});
	});

	afterEach(() => {
		if (rootMounted) act(() => root.unmount());
		container.remove();
		for (const [name, descriptor] of Object.entries(pointerCaptureDescriptors)) {
			if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
			else Reflect.deleteProperty(HTMLElement.prototype, name);
		}
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function flushAnimationFrame() {
		const callbacks = [...frameCallbacks.values()];
		frameCallbacks.clear();
		act(() => {
			for (const callback of callbacks) callback(performance.now());
		});
	}

	function renderSlider(initialValue = 25) {
		const onPercentChange = vi.fn();
		const onPercentCancel = vi.fn();
		const onPercentCommit = vi.fn<CommitHandler>();
		act(() => {
			root.render(
				<SliderFixture
					initialValue={initialValue}
					onPercentChange={onPercentChange}
					onPercentCancel={onPercentCancel}
					onPercentCommit={onPercentCommit}
				/>,
			);
		});

		const input = container.querySelector<HTMLInputElement>('input[type="range"]');
		const thumb = input?.parentElement;
		const control = thumb?.parentElement;
		const sliderRoot = container.querySelector<HTMLElement>('[role="group"]');
		const parentValue = container.querySelector<HTMLOutputElement>('[data-testid="parent-value"]');
		const externalValueButton = container.querySelector<HTMLButtonElement>('[data-testid="external-value"]');
		const switchIdentityButton = container.querySelector<HTMLButtonElement>('[data-testid="switch-identity"]');
		const toggleDisabledButton = container.querySelector<HTMLButtonElement>('[data-testid="toggle-disabled"]');
		if (
			!input ||
			!thumb ||
			!control ||
			!sliderRoot ||
			!parentValue ||
			!externalValueButton ||
			!switchIdentityButton ||
			!toggleDisabledButton
		) {
			throw new Error("Trade size slider DOM is incomplete");
		}

		Object.defineProperty(control, "getBoundingClientRect", {
			configurable: true,
			value: () => createRect(10, 100, 20),
		});
		Object.defineProperty(thumb, "getBoundingClientRect", {
			configurable: true,
			value: () => createRect(2 + Number(input.value), 16, 16),
		});

		return {
			control,
			externalValueButton,
			input,
			onPercentCancel,
			onPercentChange,
			onPercentCommit,
			parentValue,
			sliderRoot,
			switchIdentityButton,
			thumb,
			toggleDisabledButton,
		};
	}

	function startDrag(slider: ReturnType<typeof renderSlider>, targetValue = 80) {
		act(() => slider.input.focus());
		act(() => {
			slider.thumb.dispatchEvent(
				createPointerEvent("pointerdown", {
					buttons: 1,
					clientX: 10 + Number(slider.input.value),
				}),
			);
		});
		act(() => {
			document.dispatchEvent(
				createPointerEvent("pointermove", { buttons: 1, clientX: 10 + targetValue }),
			);
		});

		expect(slider.parentValue.value).toBe("25");
		expect(slider.input.value).toBe(String(targetValue));
		expect(slider.sliderRoot.hasAttribute("data-dragging")).toBe(true);
		expect(slider.onPercentCommit).not.toHaveBeenCalled();
		flushAnimationFrame();
		expect(slider.onPercentChange).toHaveBeenLastCalledWith(targetValue);
		expect(slider.parentValue.value).toBe(String(targetValue));
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
			expect(slider.onPercentCancel).toHaveBeenCalledOnce();
			expect(slider.onPercentCancel).toHaveBeenCalledWith(25);
			expect(slider.onPercentChange).toHaveBeenLastCalledWith(80);
			expect(slider.parentValue.value).toBe("25");
			expect(slider.input.value).toBe("25");
			expect(slider.sliderRoot.hasAttribute("data-dragging")).toBe(false);
		},
	);

	it("commits a completed drag synchronously and exactly once", () => {
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

	it("clears Base UI dragging state when disabled during an active drag", () => {
		const slider = renderSlider();
		startDrag(slider);

		act(() => slider.toggleDisabledButton.click());

		expect(slider.onPercentCommit).not.toHaveBeenCalled();
		expect(slider.onPercentCancel).toHaveBeenCalledOnce();
		expect(slider.onPercentCancel).toHaveBeenCalledWith(25);
		expect(slider.onPercentChange).toHaveBeenLastCalledWith(80);
		expect(slider.parentValue.value).toBe("25");
		expect(slider.input.value).toBe("25");
		expect(slider.sliderRoot.hasAttribute("data-dragging")).toBe(false);

		act(() => slider.toggleDisabledButton.click());
		startDrag(slider, 60);
		act(() => document.dispatchEvent(createPointerEvent("pointerup", { clientX: 70, pointerId: 1 })));

		expect(slider.onPercentCommit).toHaveBeenCalledTimes(1);
		expect(slider.onPercentCommit).toHaveBeenCalledWith(60, expect.objectContaining({ reason: "drag" }));
		expect(slider.parentValue.value).toBe("60");
		expect(slider.sliderRoot.hasAttribute("data-dragging")).toBe(false);
	});

	it("cancels an active drag when the interaction identity changes", () => {
		const slider = renderSlider();
		startDrag(slider);

		act(() => slider.switchIdentityButton.click());

		expect(slider.onPercentCommit).not.toHaveBeenCalled();
		expect(slider.onPercentCancel).toHaveBeenCalledWith(25);
		expect(slider.parentValue.value).toBe("25");
		expect(slider.sliderRoot.hasAttribute("data-dragging")).toBe(false);
	});

	it("keeps focus and values unchanged when the thumb is pressed without moving", () => {
		const slider = renderSlider();
		act(() => slider.input.focus());
		const originalInput = slider.input;

		act(() => {
			slider.thumb.dispatchEvent(createPointerEvent("pointerdown", { buttons: 1, clientX: 35 }));
			document.dispatchEvent(createPointerEvent("pointerup", { clientX: 35 }));
		});

		expect(slider.onPercentChange).not.toHaveBeenCalled();
		expect(slider.onPercentCancel).not.toHaveBeenCalled();
		expect(slider.onPercentCommit).not.toHaveBeenCalled();
		expect(slider.parentValue.value).toBe("25");
		expect(slider.input).toBe(originalInput);
		expect(document.activeElement).toBe(originalInput);
	});

	it("ignores Base UI's previous commit after an external value update and a stationary press", () => {
		const slider = renderSlider();
		startDrag(slider);
		act(() =>
			document.dispatchEvent(createPointerEvent("pointerup", { clientX: 90, pointerId: 1 })),
		);
		act(() => slider.externalValueButton.click());
		slider.onPercentChange.mockClear();
		slider.onPercentCommit.mockClear();
		act(() => slider.input.focus());
		const originalInput = slider.input;

		act(() => {
			slider.thumb.dispatchEvent(createPointerEvent("pointerdown", { buttons: 1, clientX: 60 }));
			document.dispatchEvent(createPointerEvent("pointerup", { clientX: 60 }));
		});

		expect(slider.onPercentChange).not.toHaveBeenCalled();
		expect(slider.onPercentCommit).not.toHaveBeenCalled();
		expect(slider.parentValue.value).toBe("50");
		expect(slider.input.value).toBe("50");
		expect(slider.input).toBe(originalInput);
		expect(document.activeElement).toBe(originalInput);
	});

	it("commits the local draft when movement returns to the controlled start value within one frame", () => {
		const slider = renderSlider(30);
		act(() => slider.input.focus());
		act(() =>
			slider.thumb.dispatchEvent(createPointerEvent("pointerdown", { buttons: 1, clientX: 40 })),
		);
		act(() =>
			document.dispatchEvent(createPointerEvent("pointermove", { buttons: 1, clientX: 45 })),
		);
		expect(slider.input.value).toBe("35");
		act(() =>
			document.dispatchEvent(createPointerEvent("pointermove", { buttons: 1, clientX: 40 })),
		);
		expect(slider.input.value).toBe("30");

		act(() => document.dispatchEvent(createPointerEvent("pointerup", { clientX: 40 })));

		expect(slider.onPercentCommit).toHaveBeenCalledTimes(1);
		expect(slider.onPercentCommit).toHaveBeenCalledWith(30, expect.objectContaining({ reason: "drag" }));
		expect(slider.onPercentChange).not.toHaveBeenCalled();
		expect(slider.parentValue.value).toBe("30");
		expect(frameCallbacks).toHaveLength(0);
	});

	it("rejects a second pointer without replacing or ending the primary session", () => {
		const slider = renderSlider();
		startDrag(slider);

		act(() => {
			slider.thumb.dispatchEvent(
				createPointerEvent("pointerdown", {
					buttons: 1,
					clientX: 30,
					isPrimary: false,
					pointerId: 2,
				}),
			);
			document.dispatchEvent(
				createPointerEvent("pointermove", {
					buttons: 1,
					clientX: 20,
					isPrimary: false,
					pointerId: 2,
				}),
			);
			document.dispatchEvent(
				createPointerEvent("pointerup", { clientX: 20, isPrimary: false, pointerId: 2 }),
			);
		});

		expect(pointerCaptureOwners.has(2)).toBe(false);
		expect(slider.input.value).toBe("80");
		expect(slider.onPercentCommit).not.toHaveBeenCalled();

		act(() => document.dispatchEvent(createPointerEvent("pointerup", { clientX: 90, pointerId: 1 })));
		expect(slider.onPercentCommit).toHaveBeenCalledTimes(1);
		expect(slider.onPercentCommit).toHaveBeenCalledWith(80, expect.objectContaining({ reason: "drag" }));
	});

	it("does not let a later canceled interaction erase an already completed commit", () => {
		const slider = renderSlider();
		startDrag(slider);
		act(() => document.dispatchEvent(createPointerEvent("pointerup", { clientX: 90, pointerId: 1 })));

		act(() =>
			slider.thumb.dispatchEvent(
				createPointerEvent("pointerdown", { buttons: 1, clientX: 90, pointerId: 2 }),
			),
		);
		act(() =>
			document.dispatchEvent(
				createPointerEvent("pointermove", { buttons: 1, clientX: 30, pointerId: 2 }),
			),
		);
		act(() =>
			document.dispatchEvent(createPointerEvent("pointercancel", { clientX: 30, pointerId: 2 })),
		);

		expect(slider.onPercentCommit).toHaveBeenCalledTimes(1);
		expect(slider.onPercentCommit).toHaveBeenCalledWith(80, expect.objectContaining({ reason: "drag" }));
		expect(slider.parentValue.value).toBe("80");
		expect(slider.input.value).toBe("80");
	});

	it("does not leave commit work behind when unmounted after release", () => {
		const slider = renderSlider();
		startDrag(slider);
		act(() => document.dispatchEvent(createPointerEvent("pointerup", { clientX: 90, pointerId: 1 })));

		expect(slider.onPercentCommit).toHaveBeenCalledTimes(1);
		act(() => root.unmount());
		rootMounted = false;

		expect(slider.onPercentCommit).toHaveBeenCalledTimes(1);
		expect(slider.onPercentCommit).toHaveBeenCalledWith(80, expect.objectContaining({ reason: "drag" }));
		expect(frameCallbacks).toHaveLength(0);
	});

	it("keeps Base UI Control as the sole pointer-capture owner", () => {
		const slider = renderSlider();

		act(() =>
			slider.thumb.dispatchEvent(createPointerEvent("pointerdown", { buttons: 1, clientX: 35 })),
		);

		expect(pointerCaptureOwners.get(1)).toBe(slider.control);
	});
});
