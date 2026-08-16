/** @vitest-environment jsdom */

import { TextInput } from "@gatu/ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("TextInput mobile-safe typography", () => {
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

	it("keeps the default desktop size and raises text only at the mobile breakpoint", () => {
		act(() => root.render(<TextInput label="Amount" mobileSafe />));

		const input = container.querySelector<HTMLInputElement>("input");
		expect(input?.className).toContain("text-xs");
		expect(input?.className).toContain("max-[1000px]:text-base");
		expect(input?.className).toContain("max-[1000px]:leading-5");
		expect(input?.hasAttribute("mobileSafe")).toBe(false);
	});

	it("does not change existing inputs unless mobileSafe is requested", () => {
		act(() => root.render(<TextInput label="Amount" />));

		const input = container.querySelector<HTMLInputElement>("input");
		expect(input?.className).toContain("text-xs");
		expect(input?.className).not.toContain("max-[1000px]:text-base");
	});
});
