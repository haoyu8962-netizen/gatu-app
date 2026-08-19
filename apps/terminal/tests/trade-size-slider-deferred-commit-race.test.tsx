/** @vitest-environment jsdom */

import { act, type ComponentProps, type ReactNode, type Ref, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface SliderDoubleProps {
	children?: ReactNode;
	onPointerDownCapture?: (event: { button: number; pointerId: number }) => void;
	onValueChange?: (value: number, details: { reason: string }) => void;
	onValueCommitted?: (value: number, details: { reason: string }) => void;
	ref?: Ref<HTMLDivElement>;
	value?: number;
}

let sliderProps: SliderDoubleProps = {};

vi.mock("@gatu/ui", () => ({
	Slider: (props: SliderDoubleProps) => {
		sliderProps = props;
		return (
			<div ref={props.ref} role="group">
				<input type="range" value={props.value} readOnly />
			</div>
		);
	},
}));

import { TradeSizeSlider } from "@/components/trade/components/trade-size-slider";

type CommitDetails = Parameters<
	NonNullable<ComponentProps<typeof TradeSizeSlider>["onPercentCommit"]>
>[1];

function SliderFixture({ onCommit }: { onCommit: (value: number) => void }) {
	const [value, setValue] = useState(25);

	return (
		<>
			<TradeSizeSlider
				value={value}
				onPercentChange={setValue}
				onPercentCommit={(committedValue: number, _details: CommitDetails) => {
					onCommit(committedValue);
					setValue(committedValue);
				}}
				ariaLabel="Size percentage"
			/>
			<output data-testid="parent-value">{value}</output>
		</>
	);
}

function pointerCancel(pointerId: number): Event {
	const event = new Event("pointercancel");
	Object.defineProperty(event, "pointerId", { value: pointerId });
	return event;
}

describe("TradeSizeSlider deferred commit isolation", () => {
	let container: HTMLDivElement;
	let root: Root;
	let nextFrameId: number;
	let frameCallbacks: Map<number, FrameRequestCallback>;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		nextFrameId = 1;
		frameCallbacks = new Map();
		sliderProps = {};
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			const frameId = nextFrameId++;
			frameCallbacks.set(frameId, callback);
			return frameId;
		});
		vi.stubGlobal("cancelAnimationFrame", (frameId: number) => {
			frameCallbacks.delete(frameId);
		});
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function flushFrame() {
		const callbacks = [...frameCallbacks.values()];
		frameCallbacks.clear();
		act(() => {
			for (const callback of callbacks) callback(performance.now());
		});
	}

	function parentValue() {
		const output = container.querySelector<HTMLOutputElement>('[data-testid="parent-value"]');
		if (!output) throw new Error("Missing parent value output");
		return Number(output.value);
	}

	it("does not let a prior deferred commit overwrite a canceled next drag", () => {
		const onCommit = vi.fn();
		act(() => root.render(<SliderFixture onCommit={onCommit} />));
		const dragDetails = { reason: "drag" };

		act(() => {
			sliderProps.onPointerDownCapture?.({ button: 0, pointerId: 1 });
			sliderProps.onValueChange?.(70, dragDetails);
			sliderProps.onValueChange?.(80, dragDetails);
		});
		flushFrame();
		flushFrame();

		act(() => {
			sliderProps.onValueChange?.(90, dragDetails);
			sliderProps.onValueCommitted?.(90, dragDetails);
		});
		expect(parentValue()).toBe(80);

		const secondStart = parentValue();
		act(() => {
			sliderProps.onPointerDownCapture?.({ button: 0, pointerId: 2 });
			sliderProps.onValueChange?.(20, dragDetails);
			document.dispatchEvent(pointerCancel(2));
		});
		expect(parentValue()).toBe(secondStart);

		flushFrame();

		expect(parentValue()).toBe(secondStart);
		expect(container.querySelector<HTMLInputElement>('input[type="range"]')?.value).toBe(
			String(secondStart),
		);
		expect(onCommit).not.toHaveBeenCalled();
	});
});
