/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileTradePriceField } from "@/components/trade/mobile/mobile-trade-price-field";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const numberFormatSetting = vi.hoisted(() => ({ locale: "en-US" }));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => numberFormatSetting.locale,
}));

describe("MobileTradePriceField", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		numberFormatSetting.locale = "en-US";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("names the Mid action with the number-format separators and still forwards the protocol price", () => {
		const onMidClick = vi.fn();
		act(() => {
			root.render(
				<MobileTradePriceField
					label="Limit Price"
					marketType="perp"
					midPrice="1234.56789"
					onChange={vi.fn()}
					onMidClick={onMidClick}
					szDecimals={2}
					value=""
				/>,
			);
		});
		const button = container.querySelector<HTMLButtonElement>("button");
		expect(button?.getAttribute("aria-label")).toBe("Use mid price 1,234.6");

		numberFormatSetting.locale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(button?.getAttribute("aria-label")).toBe("Use mid price 1.234,6");
		act(() => button?.click());
		expect(onMidClick).toHaveBeenCalledExactlyOnceWith("1234.6");
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
		expect(onMidClick).toHaveBeenCalledWith("12345678901234567890");
	});

	it("uses the visible field label as the accessible fallback", () => {
		act(() => {
			root.render(<MobileTradePriceField label="Trigger Price" unitLabel="USDC" onChange={vi.fn()} value="" />);
		});

		expect(container.querySelector('input[aria-label="Trigger Price (USDC)"]')).not.toBeNull();
		expect(container.querySelector("button")).toBeNull();
	});

	it.each([undefined, "0", "-1", "invalid"])(
		"keeps the Mid action and input geometry stable while the reference is %s, then restores the action",
		(unavailablePrice) => {
			const onMidClick = vi.fn();
			function render(midPrice: string | undefined) {
				act(() =>
					root.render(
						<MobileTradePriceField
							label="Price"
							marketType="perp"
							midPrice={midPrice}
							onChange={vi.fn()}
							onMidClick={onMidClick}
							szDecimals={2}
							value="105.25"
						/>,
					),
				);
			}
			render("101.25");
			const button = container.querySelector<HTMLButtonElement>("button");
			const input = container.querySelector<HTMLInputElement>("input");
			if (!button || !input) throw new Error("Expected price input and Mid action");
			const buttonClasses = button.className;
			const inputClasses = input.className;
			const frame = button.parentElement;
			const frameClasses = frame?.className;
			expect(button.disabled).toBe(false);
			expect(button.getAttribute("aria-label")).toBe("Use mid price 101.25");

			render(unavailablePrice);
			expect(container.querySelector("button")).toBe(button);
			expect(container.querySelector("input")).toBe(input);
			expect(button.className).toBe(buttonClasses);
			expect(input.className).toBe(inputClasses);
			expect(button.parentElement).toBe(frame);
			expect(frame?.className).toBe(frameClasses);
			expect(input.value).toBe("105.25");
			expect(button.disabled).toBe(true);
			expect(button.textContent).toBe("Mid");
			expect(button.getAttribute("aria-label")).toBe("Use mid price");
			act(() => button.click());
			expect(onMidClick).not.toHaveBeenCalled();

			render("102.5");
			expect(container.querySelector("button")).toBe(button);
			expect(button.disabled).toBe(false);
			expect(button.getAttribute("aria-label")).toBe("Use mid price 102.50");
			act(() => button.click());
			expect(onMidClick).toHaveBeenCalledExactlyOnceWith("102.50");
		},
	);
});
