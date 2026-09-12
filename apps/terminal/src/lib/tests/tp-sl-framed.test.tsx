// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TpSlSection } from "@/components/trade/tradebox/tp-sl-section";
import { createI18nRoot } from "./harness/react";

function linkedReturnInputs(overrides?: {
	onUnitToggle?: () => void;
	onTpChange?: (value: string) => void;
	tpError?: string;
}) {
	return {
		unitLabel: "%",
		onUnitToggle: overrides?.onUnitToggle ?? vi.fn(),
		tp: {
			ariaLabel: "Take profit return",
			error: overrides?.tpError,
			placeholder: "Profit",
			value: "",
			onChange: overrides?.onTpChange ?? vi.fn(),
		},
		sl: {
			ariaLabel: "Stop loss return",
			placeholder: "Loss",
			value: "",
			onChange: vi.fn(),
		},
	};
}

describe("TpSlSection framed order-panel card", () => {
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

	it("renders paired price and return inputs without percent shortcuts or risk/reward card", () => {
		act(() => {
			root.render(
				createElement(TpSlSection, {
					framed: true,
					linkedReturnInputs: linkedReturnInputs(),
					onSlPriceChange: vi.fn(),
					onTpPriceChange: vi.fn(),
					referencePrice: 100,
					side: "buy",
					size: 1,
					slPrice: "95",
					szDecimals: 2,
					tpPrice: "110",
				}),
			);
		});

		expect(container.querySelector('input[aria-label="Take Profit"]')).not.toBeNull();
		expect(container.querySelector('input[aria-label="Stop Loss"]')).not.toBeNull();
		expect(container.querySelector('input[aria-label="Take profit return"]')).not.toBeNull();
		expect(container.querySelector('input[aria-label="Stop loss return"]')).not.toBeNull();
		expect(container.querySelector('button[aria-label="Set to 25%"]')).toBeNull();
		expect(container.textContent).not.toContain("Risk/Reward");
		const estimates = container.querySelectorAll('[data-slot="trade-tpsl-pnl"]');
		expect(estimates).toHaveLength(2);
		expect(estimates[0].textContent).toBe("Estimated PnL after trigger: ≈ +$10.00");
		expect(estimates[1].textContent).toBe("Estimated PnL after trigger: ≈ -$5.00");
		expect(estimates[0].getAttribute("title")).toBe("Estimated PnL after trigger");
	});

	it("keeps permanent field labels and equal compact frames on desktop and mobile", () => {
		for (const mobileTouchSafe of [false, true]) {
			act(() => {
				root.render(
					createElement(TpSlSection, {
						framed: true,
						linkedReturnInputs: linkedReturnInputs(),
						mobileTouchSafe,
						onSlPriceChange: vi.fn(),
						onTpPriceChange: vi.fn(),
						referencePrice: 100,
						side: "buy",
						size: 1,
						slPrice: "95",
						tpPrice: "110",
					}),
				);
			});
			const labels = [
				["Take Profit", "TP Price"],
				["Stop Loss", "SL Price"],
				["Take profit return", "Profit"],
				["Stop loss return", "Loss"],
			];
			for (const [ariaLabel, label] of labels) {
				const input = container.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`);
				expect(input).not.toBeNull();
				expect(container.querySelector(`label[for="${input?.id}"]`)?.textContent).toBe(label);
				expect(input?.parentElement?.className).toContain("h-8.25");
				expect(input?.parentElement?.className).not.toContain("h-11");
				expect(input?.className).not.toContain("h-11");
				if (mobileTouchSafe) expect(input?.className).toContain("max-[1000px]:text-base");
			}
			const unitTriggers = container.querySelectorAll<HTMLButtonElement>('[role="combobox"]');
			expect(unitTriggers).toHaveLength(2);
			for (const trigger of unitTriggers) {
				expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
				expect(trigger.className).not.toMatch(/before:|after:|h-11/);
			}
		}
	});

	it("shows direction errors instead of the estimated PnL line", () => {
		act(() => {
			root.render(
				createElement(TpSlSection, {
					framed: true,
					linkedReturnInputs: linkedReturnInputs(),
					onSlPriceChange: vi.fn(),
					onTpPriceChange: vi.fn(),
					referencePrice: 100,
					side: "buy",
					size: 1,
					slPrice: "",
					szDecimals: 2,
					tpError: "Take profit trigger must be above mark",
					tpPrice: "90",
				}),
			);
		});

		expect(container.textContent).toContain("Take profit trigger must be above mark");
	});

	it("associates a linked amount error only with the return input", () => {
		act(() => {
			root.render(
				createElement(TpSlSection, {
					framed: true,
					linkedReturnInputs: linkedReturnInputs({ tpError: "Invalid amount" }),
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

		const priceInput = container.querySelector<HTMLInputElement>('input[aria-label="Take Profit"]');
		const returnInput = container.querySelector<HTMLInputElement>('input[aria-label="Take profit return"]');
		expect(priceInput?.getAttribute("aria-invalid")).toBe("false");
		expect(priceInput?.getAttribute("aria-describedby")).toBeNull();
		expect(returnInput?.getAttribute("aria-invalid")).toBe("true");
		expect(returnInput?.getAttribute("aria-describedby")).toBeTruthy();
		expect(returnInput?.parentElement?.className).toContain("border-trading-panel-error");
		expect(container.querySelector('[role="alert"]')?.textContent).toBe("Invalid amount");
	});

	it("opens a real unit menu and changes units only after selecting another option", async () => {
		const onUnitToggle = vi.fn();
		act(() => {
			root.render(
				createElement(TpSlSection, {
					framed: true,
					linkedReturnInputs: linkedReturnInputs({ onUnitToggle }),
					onSlPriceChange: vi.fn(),
					onTpPriceChange: vi.fn(),
					referencePrice: 100,
					side: "buy",
					size: 1,
					slPrice: "95",
					tpPrice: "110",
				}),
			);
		});
		const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Take profit return unit"]');
		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		await act(async () => {
			trigger?.click();
			await Promise.resolve();
		});
		expect(onUnitToggle).not.toHaveBeenCalled();
		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		const options = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]'));
		expect(options.map((option) => option.textContent)).toEqual(["%", "$"]);
		const dollars = options.find((option) => option.textContent === "$");
		await act(async () => {
			dollars?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
			await Promise.resolve();
			dollars?.click();
			await Promise.resolve();
		});
		expect(onUnitToggle).toHaveBeenCalledOnce();
		expect(container.querySelector<HTMLInputElement>('[aria-label="Take Profit"]')?.value).toBe("110");
		expect(container.querySelector<HTMLInputElement>('[aria-label="Stop Loss"]')?.value).toBe("95");
	});
});
