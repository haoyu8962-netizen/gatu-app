// @vitest-environment jsdom

import { Button, Tooltip } from "@sairn/ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Tooltip trigger stability", () => {
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

	it("preserves the trigger node and focus when content becomes available or unavailable", () => {
		function render(content: string | null) {
			act(() => {
				root.render(
					<Tooltip content={content}>
						<button type="button">Close all</button>
					</Tooltip>,
				);
			});
		}

		render(null);
		const trigger = container.querySelector("button");
		if (!trigger) throw new Error("Tooltip trigger was not rendered");
		act(() => trigger.focus());

		render("Live market data is unavailable");
		expect(container.querySelector("button")).toBe(trigger);
		expect(document.activeElement).toBe(trigger);

		render(null);
		expect(container.querySelector("button")).toBe(trigger);
		expect(document.activeElement).toBe(trigger);
	});

	it("preserves a focusable disabled button while its explanation changes", () => {
		function render(content: string | null) {
			act(() => {
				root.render(
					<Tooltip content={content}>
						<Button disabled focusableWhenDisabled>
							Close all positions
						</Button>
					</Tooltip>,
				);
			});
		}

		render("Live market data is unavailable");
		const trigger = container.querySelector("button");
		if (!trigger) throw new Error("Tooltip trigger was not rendered");
		act(() => trigger.focus());

		render(null);
		expect(container.querySelector("button")).toBe(trigger);
		expect(document.activeElement).toBe(trigger);

		render("Live market data is unavailable");
		expect(container.querySelector("button")).toBe(trigger);
		expect(document.activeElement).toBe(trigger);
	});
});
