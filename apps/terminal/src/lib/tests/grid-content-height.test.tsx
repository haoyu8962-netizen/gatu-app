// @vitest-environment jsdom

import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ResponsiveLayouts } from "react-grid-layout";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGridContentHeight } from "@/components/trade/layout/use-grid-content-height";
import { DEFAULT_DESKTOP_GRID_LAYOUTS, type DesktopGridBreakpoint } from "@/config/desktop-grid-layout";

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
	const [, setLayouts] = useState<ResponsiveLayouts<DesktopGridBreakpoint>>(() => ({
		lg: DEFAULT_DESKTOP_GRID_LAYOUTS.lg?.map((item) => ({ ...item })),
		md: DEFAULT_DESKTOP_GRID_LAYOUTS.md?.map((item) => ({ ...item })),
	}));
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
	onLayouts: (layouts: ResponsiveLayouts<DesktopGridBreakpoint>) => void;
}) {
	const [layouts, setLayouts] = useState<ResponsiveLayouts<DesktopGridBreakpoint>>(() => ({
		lg: DEFAULT_DESKTOP_GRID_LAYOUTS.lg?.map((item) => ({ ...item })),
		md: DEFAULT_DESKTOP_GRID_LAYOUTS.md?.map((item) => ({ ...item })),
	}));
	const ref = useGridContentHeight(mounted, breakpoint, "tradingInterface", setLayouts);

	useEffect(() => onLayouts(layouts), [layouts, onLayouts]);

	return <div ref={ref} />;
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

		const observedMd = onLayouts.mock.lastCall?.[0] as ResponsiveLayouts<DesktopGridBreakpoint>;
		expect(observedMd.md?.find((item) => item.i === "tradingInterface")?.h).toBe(25.85);
		expect(observedMd.lg?.find((item) => item.i === "tradingInterface")?.h).toBe(20.4);

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

		const observed = onLayouts.mock.lastCall?.[0] as ResponsiveLayouts<DesktopGridBreakpoint>;
		expect(observed.md?.find((item) => item.i === "tradingInterface")?.h).toBe(5.13);
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

		const observed = onLayouts.mock.lastCall?.[0] as ResponsiveLayouts<DesktopGridBreakpoint>;
		expect(observed.md?.find((item) => item.i === "tradingInterface")?.h).toBe(25.85);
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
});
