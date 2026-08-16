/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Skeleton, SkeletonValue } from "@/components/ui/skeleton";

class MockResizeObserver {
	observe = vi.fn();
	disconnect = vi.fn();
	unobserve = vi.fn();
}

describe("Skeleton wrapper without registered bones", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.stubGlobal("ResizeObserver", MockResizeObserver);
		vi.stubGlobal("matchMedia", () => ({
			matches: false,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		}));
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});

	it("shows a visible placeholder instead of an empty surface while loading", () => {
		act(() =>
			root.render(
				<Skeleton name="unregistered-tab" loading>
					<span>positions</span>
				</Skeleton>,
			),
		);

		expect(container.textContent).not.toContain("positions");
		expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
	});

	it("renders the real content once loading ends", () => {
		act(() =>
			root.render(
				<Skeleton name="unregistered-tab" loading={false}>
					<span>positions</span>
				</Skeleton>,
			),
		);

		expect(container.textContent).toContain("positions");
		expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
	});

	it("uses the caller's fallback when one is provided", () => {
		act(() =>
			root.render(
				<Skeleton name="unregistered-metric" loading fallback={<SkeletonValue className="w-20" />}>
					<span>1,234</span>
				</Skeleton>,
			),
		);

		expect(container.textContent).not.toContain("1,234");
		expect(container.querySelector(".w-20")).not.toBeNull();
	});
});
