/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeSlider } from "@/components/trade/components/trade-slider";

function Fixture({ onCommit }: { onCommit: (value: number) => void }) {
	const [value, setValue] = useState(25);
	return (
		<>
			<TradeSlider
				value={value}
				min={0}
				max={100}
				ariaLabel="Size (%)"
				onPreview={setValue}
				onCancel={setValue}
				onCommit={(nextValue) => {
					onCommit(nextValue);
					setValue(nextValue);
				}}
			/>
			<output>{value}</output>
		</>
	);
}

function pointer(type: string, clientX: number, pointerId = 1): MouseEvent {
	const event = new MouseEvent(type, { bubbles: true, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX });
	Object.defineProperties(event, {
		pointerId: { value: pointerId },
		pointerType: { value: "mouse" },
		isPrimary: { value: true },
	});
	return event;
}

describe("TradeSlider synchronous commit isolation", () => {
	let container: HTMLDivElement;
	let root: Root;
	let mounted: boolean;
	let frames: Map<number, FrameRequestCallback>;
	let frameId: number;

	beforeEach(() => {
		vi.useFakeTimers();
		frames = new Map();
		frameId = 0;
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			const id = ++frameId;
			frames.set(id, callback);
			return id;
		});
		vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mounted = true;
	});

	afterEach(() => {
		if (mounted) act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	function render() {
		const onCommit = vi.fn();
		act(() => root.render(<Fixture onCommit={onCommit} />));
		const control = container.querySelector<HTMLDivElement>("[data-trade-slider-control]");
		const thumb = container.querySelector<HTMLDivElement>("[data-trade-slider-thumb]");
		if (!control || !thumb) throw new Error("Expected slider controls");
		Object.defineProperty(control, "getBoundingClientRect", {
			configurable: true,
			value: () => ({ left: 10, width: 100, height: 33, x: 10, y: 0, top: 0, right: 110, bottom: 33 }),
		});
		return { control, thumb, onCommit };
	}

	it("does not let a subsequent canceled interaction erase a completed commit", () => {
		const slider = render();
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 35)));
		act(() => slider.control.dispatchEvent(pointer("pointermove", 100)));
		act(() => document.dispatchEvent(pointer("pointerup", 100)));
		expect(slider.onCommit).toHaveBeenCalledExactlyOnceWith(90);
		expect(container.querySelector("output")?.textContent).toBe("90");
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 100, 2)));
		act(() => slider.control.dispatchEvent(pointer("pointermove", 30, 2)));
		act(() => vi.advanceTimersByTime(15));
		expect(container.querySelector("output")?.textContent).toBe("20");
		act(() => document.dispatchEvent(pointer("pointercancel", 30, 2)));
		expect(container.querySelector("output")?.textContent).toBe("90");
		act(() => vi.advanceTimersByTime(100));
		expect(slider.onCommit).toHaveBeenCalledTimes(1);
		expect(frames.size).toBe(0);
	});

	it("finishes the commit before an immediate unmount without leaving delayed work", () => {
		const slider = render();
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 35)));
		act(() => slider.control.dispatchEvent(pointer("pointermove", 80)));
		act(() => {
			document.dispatchEvent(pointer("pointerup", 80));
			root.unmount();
		});
		mounted = false;
		expect(slider.onCommit).toHaveBeenCalledExactlyOnceWith(70);
		expect(frames.size).toBe(0);
		act(() => vi.advanceTimersByTime(100));
		expect(slider.onCommit).toHaveBeenCalledTimes(1);
	});
});
