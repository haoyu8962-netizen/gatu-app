/** @vitest-environment jsdom */

import { Slider } from "@sairn/ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Slider slot classes", () => {
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

	it("composes optional slot classes without replacing defaults", () => {
		act(() => {
			root.render(
				<Slider
					controlClassName="custom-control"
					indicatorClassName="custom-indicator"
					label="Size percentage"
					labelHidden
					thumbClassName="custom-thumb"
					trackClassName="custom-track"
					value={50}
				/>,
			);
		});

		const control = container.querySelector(".custom-control");
		const track = container.querySelector(".custom-track");
		const indicator = container.querySelector(".custom-indicator");
		const thumb = container.querySelector(".custom-thumb");

		expect(control?.classList.contains("relative")).toBe(true);
		expect(track?.classList.contains("bg-fill-weak")).toBe(true);
		expect(indicator?.classList.contains("bg-fill-selected")).toBe(true);
		expect(thumb?.classList.contains("bg-surface")).toBe(true);
		expect(thumb?.classList.contains("border-stroke-action")).toBe(true);
	});
});
