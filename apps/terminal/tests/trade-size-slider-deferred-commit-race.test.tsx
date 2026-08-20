/** @vitest-environment jsdom */

import { act, type ComponentProps, type ReactNode, type Ref, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface SliderEventDetails {
	event: Event;
	reason: string;
}

interface SliderDoubleProps {
	children?: ReactNode;
	onLostPointerCapture?: (event: { pointerId: number }) => void;
	onPointerDownCapture?: (event: {
		button: number;
		clientX: number;
		clientY: number;
		isPrimary: boolean;
		pointerId: number;
		preventDefault: () => void;
		stopPropagation: () => void;
	}) => void;
	onValueChange?: (value: number, details: SliderEventDetails) => void;
	onValueCommitted?: (value: number, details: SliderEventDetails) => void;
	ref?: Ref<HTMLDivElement>;
	value?: number;
}

let sliderProps: SliderDoubleProps = {};

vi.mock("@gatu/ui", () => ({
	Slider: (props: SliderDoubleProps) => {
		sliderProps = props;
		return (
			<div
				ref={props.ref}
				role="group"
				onPointerDownCapture={props.onPointerDownCapture}
				onLostPointerCapture={props.onLostPointerCapture}
			>
				<input type="range" value={props.value} readOnly />
			</div>
		);
	},
}));

import { TradeSizeSlider } from "@/components/trade/components/trade-size-slider";

type CommitHandler = ComponentProps<typeof TradeSizeSlider>["onPercentCommit"];

function SliderFixture({ onCommit }: { onCommit: (value: number) => void }) {
	const [value, setValue] = useState(25);

	function handleCommit(committedValue: number, _details: Parameters<CommitHandler>[1]) {
		onCommit(committedValue);
		setValue(committedValue);
	}

	return (
		<>
			<TradeSizeSlider
				value={value}
				onPercentChange={setValue}
				onPercentCancel={setValue}
				onPercentCommit={handleCommit}
				ariaLabel="Size percentage"
			/>
			<output data-testid="parent-value">{value}</output>
		</>
	);
}

function createPointerEvent(type: string, pointerId: number): MouseEvent {
	const event = new MouseEvent(type, { bubbles: true, button: 0, buttons: type === "pointerup" ? 0 : 1 });
	Object.defineProperties(event, {
		isPrimary: { value: true },
		pointerId: { value: pointerId },
		pointerType: { value: "mouse" },
	});
	return event;
}

function eventDetails(reason: string, event: Event): SliderEventDetails {
	return { event, reason };
}

describe("TradeSizeSlider synchronous commit isolation", () => {
	let container: HTMLDivElement;
	let root: Root;
	let frameCallbacks: Map<number, FrameRequestCallback>;
	let nextFrameId: number;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		frameCallbacks = new Map();
		nextFrameId = 1;
		sliderProps = {};
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
		if (container.isConnected) {
			act(() => root.unmount());
			container.remove();
		}
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function renderSlider(onCommit: (value: number) => void) {
		act(() => root.render(<SliderFixture onCommit={onCommit} />));
		const slider = container.querySelector<HTMLElement>('[role="group"]');
		if (!slider) throw new Error("Missing slider root");
		return slider;
	}

	function beginPointer(slider: HTMLElement, pointerId: number) {
		act(() => slider.dispatchEvent(createPointerEvent("pointerdown", pointerId)));
	}

	function changePointer(value: number, pointerId: number) {
		const pointerMove = createPointerEvent("pointermove", pointerId);
		act(() => sliderProps.onValueChange?.(value, eventDetails("drag", pointerMove)));
	}

	function commitPointer(value: number, pointerId: number) {
		const pointerUp = createPointerEvent("pointerup", pointerId);
		act(() => sliderProps.onValueCommitted?.(value, eventDetails("drag", pointerUp)));
	}

	it("commits before a subsequent canceled interaction can invalidate the result", () => {
		const onCommit = vi.fn();
		const slider = renderSlider(onCommit);
		beginPointer(slider, 1);
		changePointer(90, 1);
		commitPointer(90, 1);

		expect(onCommit).toHaveBeenCalledTimes(1);
		expect(onCommit).toHaveBeenCalledWith(90);
		expect(frameCallbacks).toHaveLength(0);

		beginPointer(slider, 2);
		changePointer(20, 2);
		act(() => document.dispatchEvent(createPointerEvent("pointercancel", 2)));

		expect(onCommit).toHaveBeenCalledTimes(1);
		expect(container.querySelector<HTMLOutputElement>('[data-testid="parent-value"]')?.value).toBe("90");
	});

	it("does not lose a completed commit when the slider unmounts immediately", () => {
		const onCommit = vi.fn();
		const slider = renderSlider(onCommit);
		beginPointer(slider, 1);
		changePointer(70, 1);

		act(() => {
			sliderProps.onValueCommitted?.(
				70,
				eventDetails("drag", createPointerEvent("pointerup", 1)),
			);
			root.unmount();
		});
		container.remove();

		expect(onCommit).toHaveBeenCalledTimes(1);
		expect(onCommit).toHaveBeenCalledWith(70);
		expect(frameCallbacks).toHaveLength(0);
	});
});
