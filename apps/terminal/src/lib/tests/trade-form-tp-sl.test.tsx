// @vitest-environment jsdom

import { act, createElement, Fragment } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TradeFormTpSl } from "@/components/trade/tradebox/trade-form-tp-sl";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
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
	let orderActions!: ReturnType<typeof useOrderEntryActions>;

	function ActionsProbe() {
		orderActions = useOrderEntryActions();
		return null;
	}

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
				createElement(
					Fragment,
					null,
					createElement(ActionsProbe),
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
				),
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

	it("preserves and marks a return that rounds to the entry reference as invalid", () => {
		resetPrices({ referencePrice: 80 });
		const tpReturn = findInput(container, "Take profit return");
		changeInput(tpReturn, "50");
		expect(findInput(container, "Take Profit").value).toBe("84.00");

		changeInput(tpReturn, "0.01");
		expect(findInput(container, "Take Profit").value).toBe("");
		expect(findInput(container, "Take Profit").getAttribute("aria-invalid")).toBe("false");
		expect(tpReturn.value).toBe("0.01");
		expect(tpReturn.getAttribute("aria-invalid")).toBe("true");
		expect(container.textContent).toContain("Invalid amount");

		act(() => tpReturn.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
		expect(tpReturn.value).toBe("0.01");
	});

	it("normalizes the entry and return target to the same protocol price rules", () => {
		resetPrices({ assetId: 0, referencePrice: 0.012345678, leverage: 2, szDecimals: 0 });
		changeInput(findInput(container, "Take profit return"), "0.01");
		expect(findInput(container, "Take Profit").value).toBe("0.012347");
	});

	it("revalidates an active return when protocol precision metadata changes", () => {
		resetPrices({ assetId: 0, referencePrice: 0.012345678, leverage: 2, szDecimals: 0 });
		const tpReturn = findInput(container, "Take profit return");
		changeInput(tpReturn, "0.01");
		expect(findInput(container, "Take Profit").value).toBe("0.012347");

		renderForm({ assetId: 0, referencePrice: 0.012345678, leverage: 2, szDecimals: 2 });
		expect(findInput(container, "Take Profit").value).toBe("");
		expect(tpReturn.value).toBe("0.01");
		expect(container.textContent).toContain("Invalid amount");
	});

	it("clears a stale take-profit price when the return draft is incomplete", () => {
		resetPrices({ referencePrice: 80 });
		const tpReturn = findInput(container, "Take profit return");
		changeInput(tpReturn, "50");
		expect(findInput(container, "Take Profit").value).toBe("84.00");

		changeInput(tpReturn, ".");
		expect(tpReturn.value).toBe(".");
		expect(findInput(container, "Take Profit").value).toBe("");
		expect(container.textContent).toContain("Invalid amount");
	});

	it("keeps the typed return as the source and re-derives the price when the entry reference moves", () => {
		resetPrices({ referencePrice: 80 });
		changeInput(findInput(container, "Take profit return"), "50");
		expect(findInput(container, "Take Profit").value).toBe("84.00");

		renderForm({ referencePrice: 82 });
		expect(findInput(container, "Take profit return").value).toBe("50");
		expect(findInput(container, "Take Profit").value).toBe("86.10");
	});

	it("lets the user finish typing a multi-digit return while the reference price ticks", () => {
		resetPrices({ referencePrice: 80 });
		const returnInput = findInput(container, "Take profit return");
		changeInput(returnInput, "10");
		renderForm({ referencePrice: 80.5 });
		changeInput(returnInput, "105");
		expect(returnInput.value).toBe("105");
		expect(findInput(container, "Take Profit").value).toBe("88.95");
	});

	it("returns to price-as-source once the return field blurs", () => {
		resetPrices({ referencePrice: 80 });
		const returnInput = findInput(container, "Take profit return");
		changeInput(returnInput, "50");
		act(() => returnInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
		renderForm({ referencePrice: 82 });
		expect(findInput(container, "Take Profit").value).toBe("84.00");
		expect(returnInput.value).toBe("24.39");
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

	it("re-derives a collateral target when size changes", () => {
		resetPrices({ referencePrice: 100, size: 2 });
		const toggle = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Toggle profit and loss unit"]')[0];
		act(() => toggle?.click());
		const tpReturn = findInput(container, "Take profit return");
		changeInput(tpReturn, "10");
		expect(findInput(container, "Take Profit").value).toBe("105.00");

		renderForm({ referencePrice: 100, size: 4 });
		expect(tpReturn.value).toBe("10");
		expect(findInput(container, "Take Profit").value).toBe("102.50");
	});

	it("keeps an unrepresentable collateral amount invalid until it is corrected or cleared", () => {
		resetPrices({ referencePrice: 100, size: 2 });
		changeInput(findInput(container, "Stop Loss"), "95");
		const toggle = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Toggle profit and loss unit"]')[0];
		act(() => toggle?.click());
		const tpReturn = findInput(container, "Take profit return");

		changeInput(tpReturn, "0.001");
		expect(tpReturn.value).toBe("0.001");
		expect(tpReturn.getAttribute("aria-invalid")).toBe("true");
		expect(findInput(container, "Take Profit").value).toBe("");
		expect(container.textContent).toContain("Invalid amount");

		changeInput(tpReturn, "2");
		expect(findInput(container, "Take Profit").value).toBe("101.00");
		expect(tpReturn.getAttribute("aria-invalid")).toBe("false");
		expect(container.textContent).not.toContain("Invalid amount");

		changeInput(tpReturn, "");
		expect(findInput(container, "Take Profit").value).toBe("");
		expect(tpReturn.getAttribute("aria-invalid")).toBe("false");
		expect(findInput(container, "Stop Loss").value).toBe("95");
	});

	it("keeps a positive sub-cent collateral return distinguishable from zero", () => {
		resetPrices({ referencePrice: 100, size: 0.00001, szDecimals: 5 });
		changeInput(findInput(container, "Take Profit"), "101");
		const toggle = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Toggle profit and loss unit"]')[0];
		act(() => toggle?.click());

		expect(findInput(container, "Take profit return").value).toBe("0.00001");
	});

	it("resets collateral mode safely when quote metadata disappears", () => {
		resetPrices({ quoteSymbol: "USDC" });
		let toggle = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Toggle profit and loss unit"]')[0];
		act(() => toggle?.click());
		changeInput(findInput(container, "Take profit return"), "10");
		expect(toggle?.textContent).toBe("$");

		renderForm({ quoteSymbol: null });
		toggle = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Toggle profit and loss unit"]')[0];
		expect(toggle?.textContent).toBe("%");
		expect(toggle?.disabled).toBe(true);
		expect(findInput(container, "Take profit return").disabled).toBe(false);
		expect(findInput(container, "Take profit return").value).not.toBe("10");
	});

	it("preserves the selected unit when the order side changes", () => {
		resetPrices();
		let toggle = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Toggle profit and loss unit"]')[0];
		act(() => toggle?.click());
		expect(toggle?.textContent).toBe("$");

		act(() => orderActions.setSide("sell"));
		toggle = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Toggle profit and loss unit"]')[0];
		expect(toggle?.textContent).toBe("$");

		act(() => orderActions.setSide("buy"));
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
