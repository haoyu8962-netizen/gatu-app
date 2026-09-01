// @vitest-environment jsdom

import { Table } from "@gatu/ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let resizeCallback: ResizeObserverCallback | null = null;

class ResizeObserverMock implements ResizeObserver {
	constructor(callback: ResizeObserverCallback) {
		resizeCallback = callback;
	}
	disconnect() {}
	observe() {}
	unobserve() {}
}

describe("Table scroll region", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		resizeCallback = null;
		vi.stubGlobal("ResizeObserver", ResizeObserverMock);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});

	it("is keyboard focusable only while the table actually overflows", () => {
		act(() => {
			root.render(
				<Table scrollableRegionLabel="Vault depositors">
					<tbody>
						<tr>
							<td>Depositor</td>
						</tr>
					</tbody>
				</Table>,
			);
		});
		const scrollContainer = container.querySelector<HTMLDivElement>('[data-slot="table-scroll-container"]');
		if (!scrollContainer || !resizeCallback) throw new Error("Table ResizeObserver was not initialized");

		Object.defineProperties(scrollContainer, {
			clientWidth: { configurable: true, value: 320 },
			scrollWidth: { configurable: true, value: 640 },
		});
		act(() => resizeCallback?.([], {} as ResizeObserver));

		expect(scrollContainer.getAttribute("role")).toBe("region");
		expect(scrollContainer.getAttribute("aria-label")).toBe("Vault depositors");
		expect(scrollContainer.getAttribute("tabindex")).toBe("0");

		Object.defineProperty(scrollContainer, "scrollWidth", { configurable: true, value: 320 });
		act(() => resizeCallback?.([], {} as ResizeObserver));

		expect(scrollContainer.hasAttribute("role")).toBe(false);
		expect(scrollContainer.hasAttribute("aria-label")).toBe(false);
		expect(scrollContainer.hasAttribute("tabindex")).toBe(false);
	});
});
