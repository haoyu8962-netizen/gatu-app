/** @vitest-environment jsdom */

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PriceInput } from "@/components/ui/price-input";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("PriceInput", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("formats an exact string midpoint without converting it to a floating-point number", () => {
		const onMidClick = vi.fn();
		act(() => {
			root.render(
				createElement(PriceInput, {
					value: "",
					onChange: vi.fn(),
					midPrice: "12345678901234567890.1234",
					szDecimals: 4,
					onMidClick,
				}),
			);
		});

		const midButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Mid",
		);
		if (!midButton) throw new Error("Expected midpoint action");

		act(() => midButton.click());
		expect(onMidClick).toHaveBeenCalledWith("12345678901234567890.12");
	});
});
