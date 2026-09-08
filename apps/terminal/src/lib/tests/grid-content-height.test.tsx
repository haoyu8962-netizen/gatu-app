// @vitest-environment jsdom

import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGridContentHeight } from "@/components/trade/layout/use-grid-content-height";
import type { DesktopGridBreakpoint, DesktopGridContentHeights } from "@/config/desktop-grid-layout";

interface ObserverInstance {
	callback: ResizeObserverCallback;
	observe: ReturnType<typeof vi.fn>;
	disconnect: ReturnType<typeof vi.fn>;
}

const observers: ObserverInstance[] = [];
const animationFrames = new Map<number, FrameRequestCallback>();
let nextAnimationFrameId = 1;

class MockResizeObserver {
	callback: ResizeObserverCallback;
	observe = vi.fn();
	disconnect = vi.fn();
	unobserve = vi.fn();

	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
		observers.push(this);
	}
}

function flushAnimationFrames() {
	const pendingFrames = [...animationFrames.values()];
	animationFrames.clear();
	for (const callback of pendingFrames) callback(performance.now());
}

function SuspenseSwapHarness({ contentReady }: { contentReady: boolean }) {
	const [, setLayouts] = useState<DesktopGridContentHeights>({});
	const ref = useGridContentHeight(true, "lg", "tradingInterface", setLayouts);

	if (!contentReady) return <div className="h-[41rem] w-full" />;

	return (
		<div ref={ref}>
			<div />
		</div>
	);
}

function GridContentHeightHarness({
	mounted,
	breakpoint,
	onLayouts,
}: {
	mounted: boolean;
	breakpoint: DesktopGridBreakpoint;
	onLayouts: (layouts: DesktopGridContentHeights) => void;
}) {
	const [layouts, setLayouts] = useState<DesktopGridContentHeights>({});
	const ref = useGridContentHeight(mounted, breakpoint, "tradingInterface", setLayouts);

	useEffect(() => onLayouts(layouts), [layouts, onLayouts]);

	return <div ref={ref} />;
}

function AccountPartsHarness({ onHeights }: { onHeights: (heights: DesktopGridContentHeights) => void }) {
	const [heights, setHeights] = useState<DesktopGridContentHeights>({});
	const ref = useGridContentHeight(true, "lg", "accountInfo", setHeights);
	useEffect(() => onHeights(heights), [heights, onHeights]);
	return (
		<div ref={ref} style={{ height: 900 }}>
			<div data-grid-content-part>Header</div>
			<div style={{ height: "100%" }}>
				<div data-grid-content-part>Natural account content</div>
			</div>
		</div>
	);
}

describe("grid content height observer", () => {
	let container: HTMLDivElement;
	let root: Root | null;

	beforeEach(() => {
		observers.length = 0;
		animationFrames.clear();
		nextAnimationFrameId = 1;
		vi.stubGlobal("ResizeObserver", MockResizeObserver);
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn((callback: FrameRequestCallback) => {
				const animationFrameId = nextAnimationFrameId;
				nextAnimationFrameId += 1;
				animationFrames.set(animationFrameId, callback);
				return animationFrameId;
			}),
		);
		vi.stubGlobal(
			"cancelAnimationFrame",
			vi.fn((animationFrameId: number) => animationFrames.delete(animationFrameId)),
		);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		if (root) act(() => root?.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});

	it("prefers border-box height and disconnects on breakpoint changes and unmount", () => {
		const onLayouts = vi.fn();
		act(() => root?.render(<GridContentHeightHarness mounted breakpoint="md" onLayouts={onLayouts} />));
		const mdObserver = observers[0];
		expect(mdObserver?.observe).toHaveBeenCalledTimes(1);

		act(() => {
			mdObserver?.callback(
				[
					{
						borderBoxSize: [{ blockSize: 850 }],
						contentRect: { height: 100 },
					} as unknown as ResizeObserverEntry,
				],
				mdObserver as unknown as ResizeObserver,
			);
			flushAnimationFrames();
		});

		const observedMd = onLayouts.mock.lastCall?.[0] as DesktopGridContentHeights;
		expect(observedMd.md?.tradingInterface).toBe(850);
		expect(observedMd.lg).toBeUndefined();

		act(() => root?.render(<GridContentHeightHarness mounted breakpoint="lg" onLayouts={onLayouts} />));
		expect(mdObserver?.disconnect).toHaveBeenCalledTimes(1);
		const lgObserver = observers[1];
		expect(lgObserver?.observe).toHaveBeenCalledTimes(1);

		act(() => root?.unmount());
		root = null;
		expect(lgObserver?.disconnect).toHaveBeenCalledTimes(1);
	});

	it("observes only once the measured node is mounted so Suspense fallbacks never size the grid", () => {
		act(() => root?.render(<SuspenseSwapHarness contentReady={false} />));
		expect(observers).toHaveLength(0);

		act(() => root?.render(<SuspenseSwapHarness contentReady />));
		expect(observers).toHaveLength(1);
		expect(observers[0]?.observe).toHaveBeenCalledTimes(1);

		act(() => root?.render(<SuspenseSwapHarness contentReady={false} />));
		expect(observers[0]?.disconnect).toHaveBeenCalledTimes(1);
		expect(observers).toHaveLength(1);
	});

	it("falls back to contentRect and does not observe before mount", () => {
		const onLayouts = vi.fn();
		act(() => root?.render(<GridContentHeightHarness mounted={false} breakpoint="md" onLayouts={onLayouts} />));
		expect(observers).toHaveLength(0);

		act(() => root?.render(<GridContentHeightHarness mounted breakpoint="md" onLayouts={onLayouts} />));
		const observer = observers[0];
		act(() => {
			observer?.callback(
				[{ borderBoxSize: [], contentRect: { height: 166 } } as unknown as ResizeObserverEntry],
				observer as unknown as ResizeObserver,
			);
			flushAnimationFrames();
		});

		const observed = onLayouts.mock.lastCall?.[0] as DesktopGridContentHeights;
		expect(observed.md?.tradingInterface).toBe(166);
	});

	it("coalesces repeated measurements and cancels pending work on cleanup", () => {
		const onLayouts = vi.fn();
		act(() => root?.render(<GridContentHeightHarness mounted breakpoint="md" onLayouts={onLayouts} />));
		const observer = observers[0];

		act(() => {
			observer?.callback(
				[{ borderBoxSize: [{ blockSize: 166 }], contentRect: { height: 166 } } as unknown as ResizeObserverEntry],
				observer as unknown as ResizeObserver,
			);
			observer?.callback(
				[{ borderBoxSize: [{ blockSize: 850 }], contentRect: { height: 850 } } as unknown as ResizeObserverEntry],
				observer as unknown as ResizeObserver,
			);
			flushAnimationFrames();
		});

		const observed = onLayouts.mock.lastCall?.[0] as DesktopGridContentHeights;
		expect(observed.md?.tradingInterface).toBe(850);
		expect(cancelAnimationFrame).toHaveBeenCalledWith(1);

		act(() => {
			observer?.callback(
				[{ borderBoxSize: [{ blockSize: 166 }], contentRect: { height: 166 } } as unknown as ResizeObserverEntry],
				observer as unknown as ResizeObserver,
			);
			root?.unmount();
		});
		root = null;
		expect(cancelAnimationFrame).toHaveBeenCalledWith(3);
		expect(animationFrames).toHaveLength(0);
	});

	it("measures every natural content part before publishing and ignores stretched wrappers", () => {
		const onHeights = vi.fn();
		act(() => root?.render(<AccountPartsHarness onHeights={onHeights} />));
		const observer = observers[0];
		const parts = [...container.querySelectorAll("[data-grid-content-part]")];
		expect(observer?.observe.mock.calls.map(([node]) => node)).toEqual(parts);
		function measure(index: number, height: number) {
			act(() => {
				observer?.callback(
					[
						{
							target: parts[index],
							borderBoxSize: [{ blockSize: height }],
							contentRect: { height },
						} as unknown as ResizeObserverEntry,
					],
					observer as unknown as ResizeObserver,
				);
				flushAnimationFrames();
			});
		}
		measure(0, 30);
		expect(onHeights.mock.lastCall?.[0]).toEqual({});
		measure(1, 700);
		expect(onHeights.mock.lastCall?.[0]).toEqual({ lg: { accountInfo: 730 } });
		measure(1, 200);
		expect(onHeights.mock.lastCall?.[0]).toEqual({ lg: { accountInfo: 230 } });
	});
});
