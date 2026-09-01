/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileTradePriceField } from "@/components/trade/mobile/mobile-trade-price-field";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MobileTradePriceField", () => {
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

	it("keeps an explicit accessible name and forwards the exact formatted midpoint", () => {
		const onMidClick = vi.fn();
		act(() => {
			root.render(
				<MobileTradePriceField
					aria-label="Limit price"
					label="Limit Price"
					marketType="perp"
					midPrice="12345678901234567890.1234"
					onChange={vi.fn()}
					onMidClick={onMidClick}
					szDecimals={4}
					unitLabel="USDC"
					value=""
				/>,
			);
		});

		const input = container.querySelector<HTMLInputElement>('input[aria-label="Limit price"]');
		expect(input).not.toBeNull();
		expect(input?.className).toContain("max-[1000px]:text-base");
		expect(input?.className).not.toContain("pr-20");
		expect(container.textContent).toContain("Limit Price (USDC)");

		const midButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Mid",
		);
		if (!midButton) throw new Error("Expected midpoint action");
		expect(midButton.className).toContain("min-w-11");
		expect(midButton.className).toContain("after:inset-0");
		expect(midButton.className).not.toContain("after:size-11");
		act(() => midButton.click());
		expect(onMidClick).toHaveBeenCalledWith("12345678901234567890.12");
	});

	it("uses the visible field label as the accessible fallback", () => {
		act(() => {
			root.render(<MobileTradePriceField label="Trigger Price" unitLabel="USDC" onChange={vi.fn()} value="" />);
		});

		expect(container.querySelector('input[aria-label="Trigger Price (USDC)"]')).not.toBeNull();
	});
});
