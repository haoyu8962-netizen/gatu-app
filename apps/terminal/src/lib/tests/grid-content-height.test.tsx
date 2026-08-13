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
		vi.stubGlobal("ResizeObserver", MockResizeObserver);
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
		});

		const observed = onLayouts.mock.lastCall?.[0] as ResponsiveLayouts<DesktopGridBreakpoint>;
		expect(observed.md?.find((item) => item.i === "tradingInterface")?.h).toBe(5.13);
	});
});
