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
					assetId: 0,
					marketId: "BTC",
					referencePrice: 100,
					size: 2,
					szDecimals: 4,
					disabled: false,
					quoteSymbol: "USDC",
					leverage: 10,
					...overrides,
				}),
			);
		});
	}

	function resetPrices(overrides?: Partial<Parameters<typeof TradeFormTpSl>[0]>) {
		renderForm(overrides);
		changeInput(findInput(container, "Take Profit"), "");
		changeInput(findInput(container, "Stop Loss"), "");
	}

	it("uses the limit entry reference when converting ROE to a take-profit price", () => {
		resetPrices({ referencePrice: 80 });
		changeInput(findInput(container, "Take profit return"), "50");
		expect(findInput(container, "Take Profit").value).toBe("84.00");
	});

	it("clears a stale take-profit price when the converted target rounds to the entry reference", () => {
		resetPrices({ referencePrice: 80 });
		const tpReturn = findInput(container, "Take profit return");
		changeInput(tpReturn, "50");
		expect(findInput(container, "Take Profit").value).toBe("84.00");

		changeInput(tpReturn, "0.01");
		expect(findInput(container, "Take Profit").value).toBe("");
	});

	it("normalizes the entry and return target to the same protocol price rules", () => {
		resetPrices({ assetId: 0, referencePrice: 0.012345678, leverage: 2, szDecimals: 0 });
		changeInput(findInput(container, "Take profit return"), "0.01");
		expect(findInput(container, "Take Profit").value).toBe("0.012347");
	});

	it("clears a target that collapses onto the entry after protocol rounding", () => {
		resetPrices({ assetId: 0, referencePrice: 12345, leverage: 10, szDecimals: 0 });
		changeInput(findInput(container, "Take profit return"), "0.01");
		expect(findInput(container, "Take Profit").value).toBe("");
	});

	it("clears a stale take-profit price when the return draft is incomplete", () => {
		resetPrices({ referencePrice: 80 });
		const tpReturn = findInput(container, "Take profit return");
		changeInput(tpReturn, "50");
		expect(findInput(container, "Take Profit").value).toBe("84.00");

		changeInput(tpReturn, ".");
		expect(tpReturn.value).toBe(".");
		expect(findInput(container, "Take Profit").value).toBe("");
	});

	it("invalidates the return draft when its entry-price context changes", () => {
		resetPrices({ referencePrice: 80 });
		changeInput(findInput(container, "Take profit return"), "50");
		expect(findInput(container, "Take Profit").value).toBe("84.00");

		renderForm({ referencePrice: 82 });
		expect(findInput(container, "Take Profit").value).toBe("84.00");
		expect(findInput(container, "Take profit return").value).toBe("24.4");
	});

	it("keeps an existing price when a return conversion cannot resolve", () => {
		renderForm({ size: 0 });
		const tpPrice = findInput(container, "Take Profit");
		changeInput(tpPrice, "105");
		const tpReturn = findInput(container, "Take profit return");
		expect(tpReturn.disabled).toBe(false);
		const toggle = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Toggle profit and loss unit"]')[0];
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
		const toggles = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Toggle profit and loss unit"]');
		expect(toggles.length).toBe(2);
		act(() => toggles[0]?.click());
		const unitLabels = Array.from(toggles).map((toggle) => toggle.textContent);
		expect(unitLabels[0]).toBe("$");
		expect(unitLabels[1]).toBe("%");
		act(() => toggles[0]?.click());
	});

	it("labels collateral return with the builder market quote token", () => {
		resetPrices({ quoteSymbol: "USDH" });
		const toggles = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Toggle profit and loss unit"]');
		act(() => toggles[0]?.click());

		expect(toggles[0]?.textContent).toBe("USDH");
		changeInput(findInput(container, "Take profit return"), "10");
		expect(findInput(container, "Take Profit").value).toBe("105.00");
	});

	it("fails closed when builder collateral metadata is missing", () => {
		resetPrices({ quoteSymbol: null });
		const tpReturn = findInput(container, "Take profit return");
		const toggle = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Toggle profit and loss unit"]')[0];

		expect(tpReturn.disabled).toBe(false);
		expect(toggle?.disabled).toBe(true);
		changeInput(findInput(container, "Take Profit"), "105");
		expect(container.textContent).not.toContain("Estimated PnL after trigger");
	});
});
