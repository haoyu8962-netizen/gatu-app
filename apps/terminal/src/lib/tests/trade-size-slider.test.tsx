/** @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeSlider } from "@/components/trade/components/trade-slider";

type Props = ComponentProps<typeof TradeSlider>;

function pointer(type: string, clientX: number, pointerId = 1, isPrimary = true): MouseEvent {
	const event = new MouseEvent(type, { bubbles: true, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX });
	Object.defineProperties(event, {
		pointerId: { value: pointerId },
		pointerType: { value: "mouse" },
		isPrimary: { value: isPrimary },
	});
	return event;
}

describe("TradeSlider pointer previews and commits", () => {
	let container: HTMLDivElement;
	let root: Root;
	let props: Props;
	let frames: Map<number, FrameRequestCallback>;
	let nextFrame: number;
	let notifications: string[];

	beforeEach(() => {
		vi.useFakeTimers();
		frames = new Map();
		nextFrame = 0;
		notifications = [];
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			const id = ++nextFrame;
			frames.set(id, callback);
			return id;
		});
		vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		props = {
			value: 25,
			min: 0,
			max: 100,
			ariaLabel: "Size (%)",
			onPreview: vi.fn(() => notifications.push("preview")),
			onCommit: vi.fn(() => notifications.push("commit")),
			onCancel: vi.fn(() => notifications.push("cancel")),
			onInteractionEnd: vi.fn(() => notifications.push("end")),
			onInteractionStart: vi.fn(),
			interactionIdentity: "mainnet:owner-a:HYPE:buy:base",
		};
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function render(overrides: Partial<Props> = {}) {
		props = { ...props, ...overrides };
		act(() => root.render(<TradeSlider {...props} />));
		const control = container.querySelector<HTMLDivElement>("[data-trade-slider-control]");
		const thumb = container.querySelector<HTMLDivElement>("[data-trade-slider-thumb]");
		const input = container.querySelector<HTMLInputElement>('input[type="range"]');
		if (!control || !thumb || !input) throw new Error("Expected native slider controls");
		Object.defineProperty(control, "getBoundingClientRect", {
			configurable: true,
			value: () => ({ left: 10, width: 100, top: 0, right: 110, bottom: 33, height: 33, x: 10, y: 0 }),
		});
		return { control, thumb, input };
	}

	function advance(ms: number) {
		act(() => vi.advanceTimersByTime(ms));
	}

	function paintFrame() {
		const pending = [...frames.values()];
		frames.clear();
		act(() => {
			for (const callback of pending) callback(performance.now());
		});
	}

	it("paints the continuous pointer position with RAF without publishing a business preview", () => {
		const slider = render();
		act(() => slider.control.dispatchEvent(pointer("pointerdown", 72.5)));
		expect(props.onInteractionStart).toHaveBeenCalledWith(25);
		expect(frames.size).toBe(1);
		paintFrame();
		expect(slider.thumb.style.transform).toContain("62.5px");
		expect(props.onPreview).not.toHaveBeenCalled();
		expect(props.onCommit).not.toHaveBeenCalled();
		advance(15);
		expect(props.onPreview).toHaveBeenCalledExactlyOnceWith(63);
	});

	it("publishes the latest integer value 15 milliseconds after the first unpublished move", () => {
		const slider = render();
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 35)));
		act(() => slider.control.dispatchEvent(pointer("pointermove", 70)));
		advance(14);
		expect(props.onPreview).not.toHaveBeenCalled();
		act(() => slider.control.dispatchEvent(pointer("pointermove", 90)));
		advance(1);
		expect(props.onPreview).toHaveBeenCalledExactlyOnceWith(80);
		advance(100);
		expect(props.onPreview).toHaveBeenCalledTimes(1);
	});

	it("skips the pending preview when the pointer returns to the published value", () => {
		const slider = render();
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 35)));
		act(() => slider.control.dispatchEvent(pointer("pointermove", 90)));
		advance(15);
		expect(props.onPreview).toHaveBeenCalledExactlyOnceWith(80);
		act(() => slider.control.dispatchEvent(pointer("pointermove", 70)));
		act(() => slider.control.dispatchEvent(pointer("pointermove", 90)));
		advance(100);
		expect(props.onPreview).toHaveBeenCalledTimes(1);
	});

	it("keeps publishing during movement faster than the preview interval, never closer than 15 ms apart", () => {
		const slider = render();
		const publishedAt: number[] = [];
		vi.mocked(props.onPreview).mockImplementation(() => publishedAt.push(Date.now()));
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 35)));
		for (let value = 30; value <= 90; value += 10) {
			act(() => slider.control.dispatchEvent(pointer("pointermove", 10 + value)));
			paintFrame();
			advance(10);
		}
		expect(vi.mocked(props.onPreview).mock.calls.map(([value]) => value)).toEqual([40, 60, 80]);
		for (let index = 1; index < publishedAt.length; index++) {
			expect((publishedAt[index] ?? 0) - (publishedAt[index - 1] ?? 0)).toBeGreaterThanOrEqual(15);
		}
		expect(slider.thumb.style.transform).toContain("90px");
		act(() => document.dispatchEvent(pointer("pointerup", 100)));
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(90, expect.objectContaining({ reason: "drag" }));
		expect(props.onPreview).toHaveBeenCalledTimes(3);
		advance(100);
		expect(props.onCommit).toHaveBeenCalledTimes(1);
		expect(frames.size).toBe(0);
	});

	it("commits a track click immediately on release without a duplicate preview", () => {
		const slider = render();
		act(() => slider.control.dispatchEvent(pointer("pointerdown", 72.5)));
		act(() => slider.control.dispatchEvent(pointer("pointerup", 72.5)));
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(63, expect.objectContaining({ reason: "track-press" }));
		expect(props.onPreview).not.toHaveBeenCalled();
		advance(100);
		paintFrame();
		expect(props.onCommit).toHaveBeenCalledTimes(1);
		expect(props.onPreview).not.toHaveBeenCalled();
		expect(slider.control.hasAttribute("data-dragging")).toBe(false);
		expect(props.onInteractionEnd).toHaveBeenCalledTimes(1);
		expect(notifications).toEqual(["commit", "end"]);
	});

	it.each([
		{ source: "unchanged parent value", value: 50 },
		{ source: "quantity-rounded parent value", value: 17 },
	])("keeps a held track press at its requested position after $source rerenders", ({ value }) => {
		const slider = render({ value: 50 });
		act(() => slider.control.dispatchEvent(pointer("pointerdown", 30)));
		paintFrame();
		advance(15);
		expect(props.onPreview).toHaveBeenCalledExactlyOnceWith(20);

		render({ value });
		expect(slider.thumb.style.transform).toContain("20px");
		expect(slider.input.value).toBe("20");
		expect(props.onCancel).not.toHaveBeenCalled();

		act(() => slider.control.dispatchEvent(pointer("pointerup", 30)));
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(20, expect.objectContaining({ reason: "track-press" }));
		render({ value: 17 });
		expect(slider.input.value).toBe("17");
		expect(slider.control.querySelector<HTMLElement>("div[style]")?.style.transform).toBe("scaleX(0.17)");
		expect(notifications).toEqual(["preview", "commit", "end"]);
	});

	it("restores the starting value when a held track press is canceled after quantity rounding", () => {
		const slider = render({ value: 50 });
		act(() => slider.control.dispatchEvent(pointer("pointerdown", 30)));
		paintFrame();
		advance(15);
		render({ value: 17 });
		expect(slider.thumb.style.transform).toContain("20px");

		act(() => document.dispatchEvent(pointer("pointercancel", 30)));
		expect(props.onCancel).toHaveBeenCalledExactlyOnceWith(50);
		expect(props.onCommit).not.toHaveBeenCalled();
		expect(slider.input.value).toBe("50");
		expect(slider.control.querySelector<HTMLElement>("div[style]")?.style.transform).toBe("scaleX(0.5)");
		expect(notifications).toEqual(["preview", "cancel", "end"]);
		advance(100);
		expect(props.onPreview).toHaveBeenCalledTimes(1);
	});

	it("commits the release coordinate even when no move event delivered it", () => {
		const onCommit = vi.fn((value: number) => root.render(<TradeSlider {...props} value={value} />));
		const slider = render({ onCommit });
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 35)));
		act(() => slider.control.dispatchEvent(pointer("pointermove", 70)));
		act(() => document.dispatchEvent(pointer("pointerup", 105)));
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(95, expect.objectContaining({ reason: "drag" }));
		expect(props.onPreview).not.toHaveBeenCalled();
		expect(slider.input.value).toBe("95");
	});

	it("reconciles a rounded commit even when the parent keeps the same value", () => {
		const slider = render({ value: 100 / 3 });
		act(() => slider.control.dispatchEvent(pointer("pointerdown", 73)));
		paintFrame();
		advance(15);
		expect(slider.input.value).toBe("63");
		act(() => slider.control.dispatchEvent(pointer("pointerup", 73)));
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(63, expect.objectContaining({ reason: "track-press" }));
		expect(slider.input.value).toBe("33");
		expect(slider.control.querySelector<HTMLElement>("div[style]")?.style.transform).toContain("scaleX(0.333333");
		expect(props.onCancel).not.toHaveBeenCalled();
	});

	it("commits the last value after a same-frame reversal back to the starting value", () => {
		const slider = render({ value: 30 });
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 40)));
		act(() => {
			slider.control.dispatchEvent(pointer("pointermove", 100));
			slider.control.dispatchEvent(pointer("pointermove", 40));
			slider.control.dispatchEvent(pointer("pointerup", 40));
		});
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(30, expect.objectContaining({ reason: "drag" }));
		expect(props.onPreview).not.toHaveBeenCalled();
		expect(frames.size).toBe(0);
		advance(100);
		expect(props.onPreview).not.toHaveBeenCalled();
	});

	it("does not resubmit a preview when the final pointer value was already published", () => {
		const slider = render();
		act(() => slider.control.dispatchEvent(pointer("pointerdown", 90)));
		advance(15);
		expect(props.onPreview).toHaveBeenCalledExactlyOnceWith(80);
		act(() => slider.control.dispatchEvent(pointer("pointerup", 90)));
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(80, expect.objectContaining({ reason: "track-press" }));
		expect(props.onPreview).toHaveBeenCalledTimes(1);
		advance(100);
		expect(props.onPreview).toHaveBeenCalledTimes(1);
	});

	it("keeps a stationary thumb press quiet and preserves focus and DOM identity", () => {
		const slider = render();
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 35)));
		advance(30);
		act(() => slider.control.dispatchEvent(pointer("pointerup", 35)));
		expect(props.onPreview).not.toHaveBeenCalled();
		expect(props.onCommit).not.toHaveBeenCalled();
		expect(props.onCancel).not.toHaveBeenCalled();
		expect(props.onInteractionEnd).toHaveBeenCalledTimes(1);
		expect(notifications).toEqual(["end"]);
		expect(document.activeElement).toBe(slider.input);
		expect(container.querySelector('input[type="range"]')).toBe(slider.input);
		expect(slider.input.value).toBe("25");
	});

	it("rejects a second pointer without replacing or finishing the first interaction", () => {
		const slider = render();
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 35)));
		act(() => slider.control.dispatchEvent(pointer("pointermove", 90)));
		act(() => {
			slider.thumb.dispatchEvent(pointer("pointerdown", 20, 2, false));
			slider.control.dispatchEvent(pointer("pointermove", 20, 2, false));
			document.dispatchEvent(pointer("pointerup", 20, 2, false));
			document.dispatchEvent(pointer("pointercancel", 20, 2, false));
		});
		expect(slider.control.hasAttribute("data-dragging")).toBe(true);
		expect(props.onCommit).not.toHaveBeenCalled();
		expect(props.onCancel).not.toHaveBeenCalled();
		act(() => document.dispatchEvent(pointer("pointerup", 90)));
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(80, expect.objectContaining({ reason: "drag" }));
	});

	it("keeps an unmeasured control non-interactive", () => {
		const slider = render();
		Object.defineProperty(slider.control, "getBoundingClientRect", {
			configurable: true,
			value: () => ({ left: 10, width: 0 }),
		});
		act(() => slider.control.dispatchEvent(pointer("pointerdown", 70)));
		act(() => document.dispatchEvent(pointer("pointerup", 70)));
		advance(30);
		expect(props.onInteractionStart).not.toHaveBeenCalled();
		expect(props.onPreview).not.toHaveBeenCalled();
		expect(props.onCommit).not.toHaveBeenCalled();
	});

	it.each([
		{ clientX: -20, expected: 1 },
		{ clientX: 150, expected: 10 },
	])("clamps a leverage-range interaction to $expected", ({ clientX, expected }) => {
		const onCommit = vi.fn((value: number) => root.render(<TradeSlider {...props} value={value} />));
		const slider = render({ value: 5, min: 1, max: 10, onCommit });
		act(() => slider.control.dispatchEvent(pointer("pointerdown", clientX)));
		act(() => document.dispatchEvent(pointer("pointerup", clientX)));
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(
			expected,
			expect.objectContaining({ reason: "track-press" }),
		);
		expect(slider.input.value).toBe(String(expected));
	});

	it("does not publish previews when a stationary external value update rerenders the slider", () => {
		const slider = render();
		render({ value: 75 });
		advance(100);
		expect(slider.input.value).toBe("75");
		expect(props.onPreview).not.toHaveBeenCalled();
		expect(props.onCommit).not.toHaveBeenCalled();
	});

	it("accepts the current percentage after a stationary thumb release", () => {
		const slider = render();
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 35)));
		render({ value: 30 });
		expect(slider.input.value).toBe("25");
		act(() => slider.control.dispatchEvent(pointer("pointerup", 35)));
		expect(slider.input.value).toBe("30");
		expect(props.onPreview).not.toHaveBeenCalled();
		expect(props.onCommit).not.toHaveBeenCalled();
		expect(props.onCancel).not.toHaveBeenCalled();
	});
});
