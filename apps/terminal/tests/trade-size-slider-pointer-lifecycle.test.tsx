/** @vitest-environment jsdom */

import { DirectionProvider } from "@base-ui/react/direction-provider";
import { act, type ComponentProps } from "react";
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

	function render(overrides: Partial<Props> = {}, nextDirection = direction) {
		props = { ...props, ...overrides };
		direction = nextDirection;
		act(() =>
			root.render(
				<DirectionProvider direction={direction}>
					<TradeSlider {...props} />
				</DirectionProvider>,
			),
		);
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
		"pointercancel",
		"lostpointercapture",
		"window blur",
		"input blur",
		"hidden document",
		"window resize",
		"Escape",
	])("cancels an unpublished preview on %s and leaves no asynchronous writes", (boundary) => {
		const slider = drag();
		act(() => {
			if (boundary === "pointercancel") document.dispatchEvent(pointer("pointercancel", 90));
			else if (boundary === "lostpointercapture") slider.control.dispatchEvent(pointer("lostpointercapture", 90));
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
		expectEnded(slider.control, 0);
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
