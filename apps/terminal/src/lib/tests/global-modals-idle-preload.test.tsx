/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	preloadLazyComponents: vi.fn<(components: { exportName: string }[]) => Promise<void>>(() => Promise.resolve()),
}));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: (_importer: unknown, exportName: string) => ({ exportName }),
	preloadLazyComponents: mocks.preloadLazyComponents,
}));

import { useIdleGlobalModalPreload } from "@/components/trade/components/lazy-global-modals";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe({ includePositionMarketClose }: { includePositionMarketClose: boolean }) {
	useIdleGlobalModalPreload(includePositionMarketClose);
	return null;
}

describe("useIdleGlobalModalPreload", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		mocks.preloadLazyComponents.mockClear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	it("warms every lazy global modal except deposit once the surface is idle", () => {
		act(() => root.render(<Probe includePositionMarketClose />));
		expect(mocks.preloadLazyComponents).not.toHaveBeenCalled();

		act(() => {
			vi.advanceTimersByTime(1_000);
		});

		expect(mocks.preloadLazyComponents).toHaveBeenCalledOnce();
		const names = mocks.preloadLazyComponents.mock.calls[0]?.[0].map((component) => component.exportName);
		expect(names).toEqual([
			"GlobalSettingsModal",
			"SpotSwapModal",
			"CommandMenu",
			"TransferModal",
			"SendModal",
			"PositionMarketCloseModal",
		]);
	});

	it("skips the market close modal where that flow is disabled and cancels on unmount", () => {
		act(() => root.render(<Probe includePositionMarketClose={false} />));
		act(() => root.unmount());
		act(() => {
			vi.advanceTimersByTime(1_000);
		});
		expect(mocks.preloadLazyComponents).not.toHaveBeenCalled();

		root = createRoot(container);
		act(() => root.render(<Probe includePositionMarketClose={false} />));
		act(() => {
			vi.advanceTimersByTime(1_000);
		});
		const names = mocks.preloadLazyComponents.mock.calls[0]?.[0].map((component) => component.exportName);
		expect(names).not.toContain("PositionMarketCloseModal");
	});
});
