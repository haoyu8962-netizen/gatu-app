// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TradeFormTpSl } from "@/components/trade/tradebox/trade-form-tp-sl";
import { createI18nRoot } from "./harness/react";

function findInput(container: HTMLElement, ariaLabel: string): HTMLInputElement {
	const input = container.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`);
	if (!input) throw new Error(`Expected input labelled ${ariaLabel}`);
	return input;
}

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	act(() => {
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

describe("TradeFormTpSl linked return inputs", () => {
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

	function renderForm(overrides?: Partial<Parameters<typeof TradeFormTpSl>[0]>) {
		act(() => {
			root.render(
				createElement(TradeFormTpSl, {
					referencePrice: 100,
					size: 2,
					szDecimals: 4,
					disabled: false,
					leverage: 10,
					...overrides,
				}),
			);
		});
	}

	function resetPrices() {
		renderForm();
		changeInput(findInput(container, "Take Profit"), "");
		changeInput(findInput(container, "Stop Loss"), "");
	}

	it("converts ROE percent to a take-profit price using leverage", () => {
		resetPrices();
		changeInput(findInput(container, "Take profit return"), "50");
		expect(findInput(container, "Take Profit").value).toBe("105.00");
	});

	it("keeps an existing price when a return conversion cannot resolve", () => {
		renderForm({ size: 0 });
		const tpPrice = findInput(container, "Take Profit");
		changeInput(tpPrice, "105");
		const tpReturn = findInput(container, "Take profit return");
		expect(tpReturn.disabled).toBe(false);
		const toggle = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Switch unit"]')[0];
		act(() => toggle?.click());
		expect(findInput(container, "Take profit return").disabled).toBe(true);
		expect(findInput(container, "Take Profit").value).toBe("105");
	});

	it("shows an empty return for a wrong-direction price and a direction error", () => {
		resetPrices();
		const tpPrice = findInput(container, "Take Profit");
		changeInput(tpPrice, "90");
		expect(findInput(container, "Take profit return").value).toBe("");
		expect(container.textContent).toContain("TP must be above entry");
		changeInput(tpPrice, "");
	});

	it("uses separate units per row", () => {
		resetPrices();
		const toggles = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Switch unit"]');
		expect(toggles.length).toBe(2);
		act(() => toggles[0]?.click());
		const unitLabels = Array.from(toggles).map((toggle) => toggle.textContent);
		expect(unitLabels[0]).toBe("$");
		expect(unitLabels[1]).toBe("%");
		act(() => toggles[0]?.click());
	});
});
