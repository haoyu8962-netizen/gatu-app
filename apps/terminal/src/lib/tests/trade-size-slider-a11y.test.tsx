/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeSizeSlider } from "@/components/trade/components/trade-size-slider";

describe("TradeSizeSlider accessibility", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("labels the focusable Base UI range input and announces percentage values", () => {
		act(() => {
			root.render(
				<TradeSizeSlider
					value={50}
					onPercentChange={vi.fn()}
					ariaLabel="Close percentage"
					ariaValueText="50% requested; 46.6% after size precision"
				/>,
			);
		});

		const input = container.querySelector<HTMLInputElement>('input[type="range"]');
		const labelledBy = input?.getAttribute("aria-labelledby");
		expect(labelledBy).toBeTruthy();
		expect(container.querySelector(`#${labelledBy}`)?.textContent).toBe("Close percentage");
		expect(input?.getAttribute("aria-valuetext")).toBe("50% requested; 46.6% after size precision");
	});
});
