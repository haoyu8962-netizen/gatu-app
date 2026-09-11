// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TpSlSection } from "@/components/trade/tradebox/tp-sl-section";
import { createI18nRoot } from "./harness/react";

describe("TpSlSection position ROE shortcuts", () => {
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

	it("keeps ROE based on entry price while disabling targets invalid against the live mark", () => {
		const onTpPriceChange = vi.fn();
		act(() => {
			root.render(
				createElement(TpSlSection, {
					leverage: 20,
					onSlPriceChange: vi.fn(),
					onTpPriceChange,
					quickPercentMode: "roe",
					referencePrice: 100,
					side: "buy",
					size: 1,
					slPrice: "",
					szDecimals: 2,
					tpPrice: "",
					triggerValidationPrice: 102,
				}),
			);
		});

		const buttons = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Set to 25%"]');
		expect(buttons[0]?.disabled).toBe(true);

		const fiftyPercentButtons = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Set to 50%"]');
		expect(fiftyPercentButtons[0]?.disabled).toBe(false);
		act(() => fiftyPercentButtons[0]?.click());
		expect(onTpPriceChange).toHaveBeenCalledWith("102.5000");
	});

	it("provides 44px input and shortcut targets when embedded in a mobile sheet", () => {
		act(() => {
			root.render(
				createElement(TpSlSection, {
					mobileTouchSafe: true,
					onSlPriceChange: vi.fn(),
					onTpPriceChange: vi.fn(),
					referencePrice: 100,
					side: "buy",
					size: 1,
					slPrice: "",
					tpPrice: "",
				}),
			);
		});

		const inputs = container.querySelectorAll<HTMLInputElement>('input[placeholder="Price"]');
		expect(inputs).toHaveLength(2);
		for (const input of inputs) expect(input.className).toContain("max-[1000px]:h-11");

		const shortcutButtons = container.querySelectorAll<HTMLButtonElement>('button[aria-label^="Set to"]');
		expect(shortcutButtons.length).toBeGreaterThan(0);
		for (const button of shortcutButtons) {
			expect(button.className).toContain("max-[1000px]:min-h-11");
			expect(button.className).toContain("max-[1000px]:min-w-11");
		}
	});

	it("preserves exact string prices in the position-dialog precision mode", () => {
		const onTpPriceChange = vi.fn();
		act(() => {
			root.render(
				createElement(TpSlSection, {
					leverage: 20,
					onSlPriceChange: vi.fn(),
					onTpPriceChange,
					preserveFinancialPrecision: true,
					quickPercentMode: "roe",
					referencePrice: "9007199254740993",
					side: "buy",
					size: "0.123456789012345678",
					slPrice: "",
					szDecimals: 2,
					tpPrice: "",
				}),
			);
		});

		const buttons = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Set to 25%"]');
		act(() => buttons[0]?.click());
		expect(onTpPriceChange).toHaveBeenCalledWith("9119789245425255.4125");
	});

	it("renders linked PnL inputs with an accessible unit toggle", () => {
		const onUnitToggle = vi.fn();
		act(() => {
			root.render(
				createElement(TpSlSection, {
					linkedReturnInputs: {
						onUnitToggle,
						sl: {
							ariaLabel: "Stop loss amount",
							onChange: vi.fn(),
							placeholder: "Loss",
							value: "5",
						},
						tp: {
							ariaLabel: "Take profit amount",
							onChange: vi.fn(),
							placeholder: "Profit",
							value: "10",
						},
						unitLabel: "%",
					},
					mobileTouchSafe: true,
					onSlPriceChange: vi.fn(),
					onTpPriceChange: vi.fn(),
					referencePrice: 100,
					side: "buy",
					size: 1,
					slPrice: "95",
					tpPrice: "105",
					tpError: "Invalid take profit",
				}),
			);
		});

		const tpPriceInput = container.querySelector<HTMLInputElement>('input[aria-label="Take Profit"]');
		const tpReturnInput = container.querySelector<HTMLInputElement>('input[aria-label="Take profit amount"]');
		expect(tpReturnInput?.value).toBe("10");
		expect(tpPriceInput?.inputMode).toBe("decimal");
		expect(tpPriceInput?.getAttribute("aria-invalid")).toBe("true");
		expect(tpReturnInput?.getAttribute("aria-invalid")).toBe("true");
		expect(tpPriceInput?.getAttribute("aria-describedby")).toBeTruthy();
		expect(container.querySelector(`label[for="${tpPriceInput?.id}"]`)?.textContent).toBe("Take Profit");
		expect(container.querySelector('[role="alert"]')?.textContent).toBe("Invalid take profit");
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Stop loss amount"]')?.value).toBe("5");
		const toggles = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Toggle profit and loss unit"]');
		expect(toggles).toHaveLength(2);
		for (const toggle of toggles) {
			expect(toggle.className).toContain("max-[1000px]:min-h-11");
			expect(toggle.textContent).toBe("%");
			expect(toggle.getAttribute("aria-pressed")).toBe("true");
		}
		act(() => toggles[0]?.click());
		expect(onUnitToggle).toHaveBeenCalledOnce();
	});

	it("keeps framed order fields compact with iOS-safe text on mobile", () => {
		act(() => {
			root.render(
				createElement(TpSlSection, {
					framed: true,
					linkedReturnInputs: {
						onUnitToggle: vi.fn(),
						sl: { ariaLabel: "Stop loss return", onChange: vi.fn(), placeholder: "Loss", value: "" },
						tp: { ariaLabel: "Take profit return", onChange: vi.fn(), placeholder: "Profit", value: "" },
						unitLabel: "%",
					},
					mobileTouchSafe: true,
					onSlPriceChange: vi.fn(),
					onTpPriceChange: vi.fn(),
					referencePrice: 100,
					side: "buy",
					size: 1,
					slPrice: "",
					tpError: "Invalid take profit",
					tpPrice: "100",
				}),
			);
		});

		const priceInput = container.querySelector<HTMLInputElement>('input[aria-label="Take Profit"]');
		const returnInput = container.querySelector<HTMLInputElement>('input[aria-label="Take profit return"]');
		const toggles = container.querySelectorAll<HTMLButtonElement>('button[role="combobox"][aria-label$="return unit"]');
		expect(priceInput?.parentElement?.className).toContain("h-8.25");
		expect(returnInput?.parentElement?.className).toContain("h-8.25");
		expect(priceInput?.parentElement?.className).not.toContain("max-[1000px]:h-11");
		expect(returnInput?.parentElement?.className).not.toContain("max-[1000px]:h-11");
		expect(priceInput?.className).toContain("text-xs");
		expect(returnInput?.className).toContain("text-xs");
		expect(priceInput?.className).not.toContain("max-[1000px]:h-11");
		expect(returnInput?.className).not.toContain("max-[1000px]:h-11");
		expect(priceInput?.className).toContain("max-[1000px]:text-base");
		expect(returnInput?.className).toContain("max-[1000px]:text-base");
		expect(priceInput?.getAttribute("aria-invalid")).toBe("true");
		expect(returnInput?.getAttribute("aria-invalid")).toBe("false");
		expect(returnInput?.getAttribute("aria-describedby")).toBeNull();
		expect(container.querySelector('[role="alert"]')?.textContent).toBe("Invalid take profit");
		expect(toggles).toHaveLength(2);
		for (const toggle of toggles) {
			expect(toggle.getAttribute("aria-haspopup")).toBe("listbox");
			expect(toggle.className).not.toMatch(/before:|after:|h-11/);
		}
	});

	it("formats TP/SL PnL with the verified non-default quote token", () => {
		act(() => {
			root.render(
				createElement(TpSlSection, {
					onSlPriceChange: vi.fn(),
					onTpPriceChange: vi.fn(),
					preserveFinancialPrecision: true,
					quoteSymbol: "USDT0",
					referencePrice: "100",
					side: "buy",
					size: "2",
					slPrice: "95",
					tpPrice: "110",
				}),
			);
		});

		expect(container.textContent).toContain("+20.00 USDT0");
		expect(container.textContent).toContain("-10.00 USDT0");
		expect(container.textContent).not.toContain("$");
	});
});
