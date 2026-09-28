/** @vitest-environment jsdom */

import { DirectionProvider } from "@base-ui/react/direction-provider";
import { act, type ComponentProps, StrictMode, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeSlider } from "@/components/trade/components/trade-slider";

type Props = ComponentProps<typeof TradeSlider>;

function pointer(type: string, clientX: number, pointerId = 1): MouseEvent {
	const event = new MouseEvent(type, { bubbles: true, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX });
	Object.defineProperties(event, {
		pointerId: { value: pointerId },
		pointerType: { value: "mouse" },
		isPrimary: { value: true },
	});
	return event;
}

describe("TradeSlider lifecycle isolation", () => {
	let container: HTMLDivElement;
	let root: Root;
	let mounted: boolean;
	let props: Props;
	let direction: "ltr" | "rtl";
	let frames: Map<number, FrameRequestCallback>;
	let frameId: number;
	let captures: Set<number>;
	let resizeCallbacks: ResizeObserverCallback[];
	let observerDisconnect: () => void;
	let notifications: string[];

	beforeEach(() => {
		vi.useFakeTimers();
		frames = new Map();
		frameId = 0;
		captures = new Set();
		resizeCallbacks = [];
		observerDisconnect = vi.fn();
		notifications = [];
		vi.stubGlobal(
			"ResizeObserver",
			class {
				constructor(callback: ResizeObserverCallback) {
					resizeCallbacks.push(callback);
				}
				observe() {}
				unobserve() {}
				disconnect() {
					observerDisconnect();
				}
			},
		);
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
		direction = "ltr";
		props = {
			value: 25,
			min: 0,
			max: 100,
			ariaLabel: "Size (%)",
			interactionIdentity: "mainnet:owner-a:HYPE:buy:base",
			onPreview: vi.fn(() => notifications.push("preview")),
			onCommit: vi.fn(() => notifications.push("commit")),
			onCancel: vi.fn(() => notifications.push("cancel")),
			onInteractionEnd: vi.fn(() => notifications.push("end")),
			onInteractionStart: vi.fn(),
		};
	});

	afterEach(() => {
		if (mounted) act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function render(overrides: Partial<Props> = {}, nextDirection = direction, strict = false) {
		props = { ...props, ...overrides };
		direction = nextDirection;
		const slider = (
			<DirectionProvider direction={direction}>
				<TradeSlider {...props} />
			</DirectionProvider>
		);
		act(() => root.render(strict ? <StrictMode>{slider}</StrictMode> : slider));
		const control = container.querySelector<HTMLDivElement>("[data-trade-slider-control]");
		const thumb = container.querySelector<HTMLDivElement>("[data-trade-slider-thumb]");
		const input = container.querySelector<HTMLInputElement>('input[type="range"]');
		if (!control || !thumb || !input) throw new Error("Expected native slider controls");
		Object.defineProperties(control, {
			getBoundingClientRect: {
				configurable: true,
				value: () => ({ left: 10, width: 100, height: 33, top: 0, bottom: 33, right: 110, x: 10, y: 0 }),
			},
			setPointerCapture: { configurable: true, value: (id: number) => captures.add(id) },
			hasPointerCapture: { configurable: true, value: (id: number) => captures.has(id) },
			releasePointerCapture: {
				configurable: true,
				value: (id: number) => {
					if (!captures.delete(id)) return;
					control.dispatchEvent(pointer("lostpointercapture", 0, id));
				},
			},
		});
		return { control, thumb, input };
	}

	function advance(ms: number) {
		act(() => vi.advanceTimersByTime(ms));
	}

	function drag(publish = false) {
		const slider = render();
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 35)));
		act(() => slider.control.dispatchEvent(pointer("pointermove", 90)));
		if (publish) {
			advance(15);
			expect(props.onPreview).toHaveBeenCalledExactlyOnceWith(80);
		}
		return slider;
	}

	function expectEnded(control: HTMLElement, previews: number) {
		expect(props.onCommit).not.toHaveBeenCalled();
		expect(props.onCancel).toHaveBeenCalledExactlyOnceWith(25);
		expect(control.hasAttribute("data-dragging")).toBe(false);
		expect(captures.size).toBe(0);
		expect(frames.size).toBe(0);
		advance(100);
		act(() => document.dispatchEvent(pointer("pointerup", 110)));
		expect(props.onPreview).toHaveBeenCalledTimes(previews);
		expect(props.onCommit).not.toHaveBeenCalled();
		expect(props.onCancel).toHaveBeenCalledTimes(1);
		expect(props.onInteractionEnd).toHaveBeenCalledTimes(1);
		expect(notifications.slice(-2)).toEqual(["cancel", "end"]);
	}

	it.each([
		["pointercancel", "cancel:pointer-cancel"],
		["window blur", "cancel:window-blur"],
		["input blur", "cancel:input-blur"],
		["hidden document", "cancel:document-hidden"],
		["window resize", "cancel:window-resize"],
		["Escape", "cancel:escape"],
	])("cancels an unpublished preview on %s, records %s and leaves no asynchronous writes", (boundary, outcome) => {
		const slider = drag();
		expect(slider.control.hasAttribute("data-gesture-end")).toBe(false);
		act(() => {
			if (boundary === "pointercancel") document.dispatchEvent(pointer("pointercancel", 90));
			else if (boundary === "window blur") window.dispatchEvent(new Event("blur"));
			else if (boundary === "input blur") slider.input.blur();
			else if (boundary === "window resize") window.dispatchEvent(new Event("resize"));
			else if (boundary === "Escape")
				slider.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			else {
				vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
				document.dispatchEvent(new Event("visibilitychange"));
			}
		});
		expect(slider.input.value).toBe("25");
		expect(slider.control.dataset.gestureEnd).toBe(outcome);
		expectEnded(slider.control, 0);
	});

	it("commits when the browser reports lost pointer capture just before the release", () => {
		const slider = drag();
		act(() => slider.control.dispatchEvent(pointer("lostpointercapture", 90)));
		expect(slider.control.dataset.dragging).toBe("true");
		expect(props.onCancel).not.toHaveBeenCalled();

		act(() => document.dispatchEvent(pointer("pointerup", 90)));
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(80, expect.objectContaining({ reason: "drag" }));
		expect(props.onCancel).not.toHaveBeenCalled();
		expect(slider.control.dataset.gestureEnd).toBe("commit");
		expect(notifications.slice(-2)).toEqual(["commit", "end"]);
	});

	it("keeps following the pointer from the document after pointer capture is lost", () => {
		const slider = drag();
		act(() => slider.control.dispatchEvent(pointer("lostpointercapture", 90)));
		act(() => document.dispatchEvent(pointer("pointermove", 60)));
		advance(15);
		expect(props.onPreview).toHaveBeenLastCalledWith(50);
		act(() => document.dispatchEvent(pointer("pointerup", 60)));
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(50, expect.objectContaining({ reason: "drag" }));
	});

	it("commits the held draft when the release was missed after a capture loss", () => {
		const slider = drag();
		act(() => slider.control.dispatchEvent(pointer("lostpointercapture", 90)));
		const buttonless = pointer("pointermove", 10);
		Object.defineProperty(buttonless, "buttons", { value: 0 });
		act(() => document.dispatchEvent(buttonless));
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(80, expect.objectContaining({ reason: "drag" }));
		expect(props.onCancel).not.toHaveBeenCalled();
		expect(slider.control.hasAttribute("data-dragging")).toBe(false);
		expect(slider.control.dataset.gestureEnd).toBe("commit");
	});

	it("does not read a buttonless move as a release while pointer capture is intact", () => {
		const slider = drag();
		const buttonless = pointer("pointermove", 60);
		Object.defineProperty(buttonless, "buttons", { value: 0 });
		act(() => slider.control.dispatchEvent(buttonless));
		expect(props.onCommit).not.toHaveBeenCalled();
		expect(slider.control.dataset.dragging).toBe("true");
		act(() => document.dispatchEvent(pointer("pointerup", 60)));
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(50, expect.objectContaining({ reason: "drag" }));
	});

	it("records how the last gesture ended and clears the record when the next one starts", () => {
		const slider = drag();
		act(() => document.dispatchEvent(pointer("pointerup", 90)));
		expect(slider.control.dataset.gestureEnd).toBe("commit");

		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 90, 2)));
		expect(slider.control.hasAttribute("data-gesture-end")).toBe(false);
		act(() => document.dispatchEvent(pointer("pointerup", 90, 2)));
		expect(slider.control.dataset.gestureEnd).toBe("unchanged");

		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 90, 3)));
		render({ interactionIdentity: "mainnet:owner-a:BTC:buy:base" });
		expect(slider.control.dataset.gestureEnd).toBe("cancel:context-change");
	});

	it("restores the starting value and cancels exactly once after publishing a preview", () => {
		const slider = drag(true);
		act(() => slider.control.dispatchEvent(pointer("pointermove", 100)));
		act(() => document.dispatchEvent(pointer("pointercancel", 100)));
		expect(slider.input.value).toBe("25");
		expectEnded(slider.control, 1);
	});

	it.each([
		{ name: "disabled", overrides: { disabled: true } },
		{ name: "identity", overrides: { interactionIdentity: "mainnet:owner-b:HYPE:buy:base", value: 40 } },
		{ name: "minimum", overrides: { min: 10 } },
		{ name: "maximum", overrides: { max: 50 } },
	])("cancels when $name changes without writing a stale preview", ({ overrides }) => {
		const slider = drag();
		render(overrides);
		expect(slider.input.value).toBe(String(overrides.value ?? 25));
		expectEnded(slider.control, 0);
	});

	it("cancels on a direction change and paints the current logical value", () => {
		const slider = drag();
		render({}, "rtl");
		expect(slider.input.value).toBe("25");
		expect(slider.control.querySelector<HTMLElement>("div[style]")?.style.transformOrigin).toBe("right center");
		expectEnded(slider.control, 0);
	});

	it("cancels an active session on unmount and ignores the later physical release", () => {
		const slider = drag(true);
		act(() => slider.control.dispatchEvent(pointer("pointermove", 100)));
		act(() => root.unmount());
		mounted = false;
		expect(slider.control.isConnected).toBe(false);
		expect(props.onInteractionEnd).toHaveBeenCalledTimes(1);
		expect(notifications.slice(-2)).toEqual(["cancel", "end"]);
		expect(props.onCancel).toHaveBeenCalledExactlyOnceWith(25);
		expect(frames.size).toBe(0);
		advance(100);
		act(() => document.dispatchEvent(pointer("pointerup", 110)));
		expect(props.onPreview).toHaveBeenCalledTimes(1);
		expect(props.onCommit).not.toHaveBeenCalled();
	});

	it("clears pending work before the replacement form's layout effects run", () => {
		drag();
		const onReplacementLayout = vi.fn(() => {
			vi.advanceTimersByTime(15);
			for (const callback of frames.values()) callback(16);
			expect(props.onPreview).not.toHaveBeenCalled();
			expect(props.onCancel).toHaveBeenCalledExactlyOnceWith(25);
			expect(props.onInteractionEnd).toHaveBeenCalledTimes(1);
			expect(frames.size).toBe(0);
			expect(captures.size).toBe(0);
		});
		function Replacement() {
			useLayoutEffect(onReplacementLayout, []);
			return <output>New market form</output>;
		}
		act(() => root.render(<Replacement />));
		expect(onReplacementLayout).toHaveBeenCalledOnce();
	});

	it("keeps one active gesture after StrictMode replays the initial effects", () => {
		const slider = render({}, "ltr", true);
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 35)));
		act(() => slider.control.dispatchEvent(pointer("pointermove", 90)));
		advance(15);
		act(() => document.dispatchEvent(pointer("pointerup", 90)));
		expect(props.onPreview).toHaveBeenCalledExactlyOnceWith(80);
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(80, expect.objectContaining({ reason: "drag" }));
		expect(props.onInteractionStart).toHaveBeenCalledExactlyOnceWith(25);
		expect(props.onInteractionEnd).toHaveBeenCalledOnce();
		expect(props.onCancel).not.toHaveBeenCalled();
		expect(frames.size).toBe(0);
		expect(captures.size).toBe(0);
	});

	it("ignores unchanged observed width and cancels when the actual control width changes", () => {
		const slider = drag();
		const notify = resizeCallbacks[0];
		if (!notify) throw new Error("Expected a control ResizeObserver");
		act(() => notify([{ contentRect: { width: 100 } } as ResizeObserverEntry], {} as ResizeObserver));
		expect(props.onCancel).not.toHaveBeenCalled();
		act(() => notify([{ contentRect: { width: 80 } } as ResizeObserverEntry], {} as ResizeObserver));
		expectEnded(slider.control, 0);
		expect(observerDisconnect).toHaveBeenCalledTimes(1);
		act(() => notify([{ contentRect: { width: 60 } } as ResizeObserverEntry], {} as ResizeObserver));
		expect(props.onCancel).toHaveBeenCalledTimes(1);
	});

	it("keeps the gesture when an ancestor transform makes the visual width differ from the layout width", () => {
		const slider = render();
		Object.defineProperty(slider.control, "getBoundingClientRect", {
			configurable: true,
			value: () => ({ left: 12.5, width: 95, height: 31.35, top: 0, bottom: 31.35, right: 107.5, x: 12.5, y: 0 }),
		});
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 36.25)));
		const notify = resizeCallbacks[0];
		if (!notify) throw new Error("Expected a control ResizeObserver");

		act(() => notify([{ contentRect: { width: 100 } } as ResizeObserverEntry], {} as ResizeObserver));
		act(() => notify([{ contentRect: { width: 100 } } as ResizeObserverEntry], {} as ResizeObserver));
		expect(props.onCancel).not.toHaveBeenCalled();
		expect(slider.control.dataset.dragging).toBe("true");

		act(() => notify([{ contentRect: { width: 80 } } as ResizeObserverEntry], {} as ResizeObserver));
		expect(props.onCancel).toHaveBeenCalledTimes(1);
		expect(slider.control.dataset.dragging).toBeUndefined();
	});

	it("uses the latest callback after a same-identity rerender", () => {
		const slider = drag();
		const previousPreview = props.onPreview;
		const latestPreview = vi.fn();
		render({ onPreview: latestPreview });
		advance(15);
		expect(previousPreview).not.toHaveBeenCalled();
		expect(latestPreview).toHaveBeenCalledExactlyOnceWith(80);
		act(() => document.dispatchEvent(pointer("pointerup", 90)));
		expect(props.onCommit).toHaveBeenCalledTimes(1);
		expect(slider.control.hasAttribute("data-dragging")).toBe(false);
	});

	it("keeps a gesture alive while paused, publishes nothing, and cancels if released while paused", () => {
		const slider = drag();
		render({ paused: true });
		expect(slider.control.dataset.dragging).toBe("true");
		expect(props.onCancel).not.toHaveBeenCalled();
		expect(slider.input.disabled).toBe(false);
		expect(slider.input.getAttribute("aria-disabled")).toBe("true");

		advance(100);
		act(() => slider.control.dispatchEvent(pointer("pointermove", 60)));
		advance(100);
		expect(props.onPreview).not.toHaveBeenCalled();
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 35, 2)));
		expect(props.onInteractionStart).toHaveBeenCalledTimes(1);

		act(() => document.dispatchEvent(pointer("pointerup", 60)));
		expect(slider.control.dataset.gestureEnd).toBe("cancel:paused");
		expect(props.onCommit).not.toHaveBeenCalled();
		expect(props.onCancel).toHaveBeenCalledExactlyOnceWith(25);
		expect(props.onInteractionEnd).toHaveBeenCalledTimes(1);
		expect(slider.control.hasAttribute("data-dragging")).toBe(false);
		expect(slider.input.disabled).toBe(true);
		expect(slider.input.hasAttribute("aria-disabled")).toBe(false);
	});

	it("never disables the focused input, even for an instant, when paused mid-gesture", () => {
		const slider = drag();
		const observer = new MutationObserver(() => {});
		observer.observe(slider.input, { attributes: true, attributeFilter: ["disabled"], attributeOldValue: true });
		const records: MutationRecord[] = [];

		render({ paused: true });
		records.push(...observer.takeRecords());
		render({ paused: false });
		records.push(...observer.takeRecords());
		observer.disconnect();

		expect(records).toEqual([]);
		expect(slider.input.disabled).toBe(false);
	});

	it("drops a pending preview when paused and republishes the held value once it resumes", () => {
		const slider = drag();
		render({ paused: true });
		advance(100);
		expect(props.onPreview).not.toHaveBeenCalled();

		render({ paused: false });
		expect(props.onPreview).not.toHaveBeenCalled();
		advance(15);
		expect(props.onPreview).toHaveBeenCalledExactlyOnceWith(80);
		advance(100);
		expect(props.onPreview).toHaveBeenCalledTimes(1);

		act(() => document.dispatchEvent(pointer("pointerup", 90)));
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(80, expect.objectContaining({ reason: "drag" }));
		expect(props.onCancel).not.toHaveBeenCalled();
		expect(slider.control.hasAttribute("data-dragging")).toBe(false);
	});

	it("cancels the pending preview timer on pause, so a short pause restarts the preview interval", () => {
		drag();
		advance(5);
		render({ paused: true });
		advance(4);
		render({ paused: false });

		advance(14);
		expect(props.onPreview).not.toHaveBeenCalled();
		advance(1);
		expect(props.onPreview).toHaveBeenCalledExactlyOnceWith(80);
	});

	it("republishes an already published value after a pause, because the same percent may mean a new size", () => {
		drag(true);
		render({ paused: true });
		render({ paused: false });
		advance(15);
		expect(props.onPreview).toHaveBeenCalledTimes(2);
		expect(props.onPreview).toHaveBeenLastCalledWith(80);
	});

	it("does not publish after a pause when the thumb was only pressed", () => {
		const slider = render();
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 35)));
		render({ paused: true });
		render({ paused: false });
		advance(100);
		expect(props.onPreview).not.toHaveBeenCalled();
		act(() => document.dispatchEvent(pointer("pointerup", 35)));
		expect(props.onCommit).not.toHaveBeenCalled();
	});

	it("commits once and publishes no late preview when released right after a pause ends", () => {
		const slider = drag();
		render({ paused: true });
		render({ paused: false });
		advance(14);
		act(() => document.dispatchEvent(pointer("pointerup", 90)));
		advance(100);
		expect(props.onPreview).not.toHaveBeenCalled();
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(80, expect.objectContaining({ reason: "drag" }));
		expect(notifications).toEqual(["commit", "end"]);
		expect(slider.input.disabled).toBe(false);
	});

	it.each(["input blur", "Escape", "disabled flip"])("still cancels a paused gesture on %s", (boundary) => {
		const slider = drag();
		render({ paused: true });
		if (boundary === "disabled flip") {
			render({ paused: true, disabled: true });
			expect(slider.control.dataset.gestureEnd).toBe("cancel:disabled");
		}
		else
			act(() => {
				if (boundary === "input blur") slider.input.blur();
				else slider.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			});
		expectEnded(slider.control, 0);
		expect(slider.input.disabled).toBe(true);
		expect(slider.input.hasAttribute("aria-disabled")).toBe(false);
	});

	it("does not start a gesture or accept keyboard and native input while paused and idle", () => {
		const slider = render({ paused: true });
		expect(slider.input.disabled).toBe(true);
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 35)));
		expect(props.onInteractionStart).not.toHaveBeenCalled();
		expect(slider.control.hasAttribute("data-dragging")).toBe(false);
		act(() => {
			slider.input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		});
		act(() => {
			slider.input.value = "60";
			slider.input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(props.onCommit).not.toHaveBeenCalled();
	});

	it("can start a fresh interaction after a disabled session recovers", () => {
		const slider = drag();
		render({ disabled: true });
		render({ disabled: false });
		act(() => slider.thumb.dispatchEvent(pointer("pointerdown", 35, 2)));
		act(() => slider.control.dispatchEvent(pointer("pointermove", 70, 2)));
		act(() => document.dispatchEvent(pointer("pointerup", 70, 2)));
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(60, expect.objectContaining({ reason: "drag" }));
		expect(props.onCancel).toHaveBeenCalledExactlyOnceWith(25);
	});

	it("maps an RTL pointer position to the logical value and keeps capture on the control", () => {
		const slider = render({}, "rtl");
		act(() => slider.control.dispatchEvent(pointer("pointerdown", 30)));
		expect(captures.has(1)).toBe(true);
		advance(15);
		expect(props.onPreview).toHaveBeenCalledExactlyOnceWith(80);
		act(() => document.dispatchEvent(pointer("pointerup", 30)));
		expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(80, expect.objectContaining({ reason: "track-press" }));
		expect(captures.size).toBe(0);
	});
});
