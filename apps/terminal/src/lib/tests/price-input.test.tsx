/** @vitest-environment jsdom */

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFormattedMidPrice, PriceInput } from "@/components/ui/price-input";
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
		expect(onMidClick).toHaveBeenCalledWith("12345678901234567890");
	});
});

describe("getFormattedMidPrice", () => {
	it("shows the official price decimals when no asset is known", () => {
		expect(getFormattedMidPrice("55.8925", 2, "perp")).toBe("55.893");
		expect(getFormattedMidPrice("55.9", 2, "perp")).toBe("55.900");
	});

	it("rounds the mid to a protocol-legal tick when the asset is known", () => {
		expect(getFormattedMidPrice("55.8925", 2, "perp", 0)).toBe("55.893");
		expect(getFormattedMidPrice("55.95", 2, "perp", 0)).toBe("55.950");
		expect(getFormattedMidPrice("77559.5", 5, "perp", 0)).toBe("77560");
	});
});
