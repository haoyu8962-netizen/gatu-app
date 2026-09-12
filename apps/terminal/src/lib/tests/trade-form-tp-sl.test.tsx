// @vitest-environment jsdom

import { act, createElement, Fragment } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TradeFormTpSl } from "@/components/trade/tradebox/trade-form-tp-sl";
import { useOrderEntryActions, useTpReturnInvalid } from "@/stores/use-order-entry-store";
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

async function chooseOtherUnit(container: HTMLElement, index = 0) {
	const trigger = container.querySelectorAll<HTMLButtonElement>('button[role="combobox"][aria-label$="return unit"]')[
		index
	];
	if (!trigger) throw new Error("Missing return unit selector");
	const previousUnit = trigger.textContent;
	await act(async () => {
		trigger.click();
		await Promise.resolve();
	});
	const option = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find(
		(candidate) => candidate.textContent !== previousUnit,
	);
	if (!option) throw new Error("Missing alternate return unit");
	await act(async () => {
		option.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
		await Promise.resolve();
		option.click();
		await Promise.resolve();
	});
}

describe("TradeFormTpSl linked return inputs", () => {
	let container: HTMLDivElement;
	let root: Root;
	let orderActions!: ReturnType<typeof useOrderEntryActions>;
	let tpReturnInvalidState = false;

	function ActionsProbe() {
		orderActions = useOrderEntryActions();
		tpReturnInvalidState = useTpReturnInvalid();
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

	it("keeps an invalid return draft blocked while its passive recovery presentation is quiet", () => {
		resetPrices({ referencePrice: 80 });
		act(() => orderActions.setSide("buy"));
		const tpReturn = findInput(container, "Take profit return");
		changeInput(tpReturn, "0.01");
		expect(tpReturnInvalidState).toBe(true);
		expect(container.textContent).toContain("Invalid amount");

		renderForm({ referencePrice: 80, showValidation: false });
		expect(tpReturnInvalidState).toBe(true);
		expect(tpReturn.value).toBe("0.01");
		expect(tpReturn.getAttribute("aria-invalid")).toBe("false");
		expect(container.textContent).not.toContain("Invalid amount");

		renderForm({ referencePrice: 80, showValidation: true });
		expect(tpReturnInvalidState).toBe(true);
		expect(tpReturn.getAttribute("aria-invalid")).toBe("true");
		expect(container.textContent).toContain("Invalid amount");
		act(() => orderActions.setSide("sell"));
		expect(tpReturnInvalidState).toBe(false);
		expect(container.textContent).not.toContain("Invalid amount");
	});

	it("restores local direction feedback after recovery without replacing the price draft", () => {
		resetPrices({ referencePrice: 80 });
		act(() => orderActions.setSide("buy"));
		const tpPrice = findInput(container, "Take Profit");
		changeInput(tpPrice, "70");
		expect(container.textContent).toContain("TP must be above entry");

		renderForm({ referencePrice: 80, showValidation: false });
		expect(tpPrice.value).toBe("70");
		expect(tpPrice.getAttribute("aria-invalid")).toBe("false");
		expect(container.textContent).not.toContain("TP must be above entry");

		renderForm({ referencePrice: 80, showValidation: true });
		expect(findInput(container, "Take Profit")).toBe(tpPrice);
		expect(tpPrice.value).toBe("70");
		expect(tpPrice.getAttribute("aria-invalid")).toBe("true");
		expect(container.textContent).toContain("TP must be above entry");
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

	it("keeps intermediate return drafts quiet while preventing a stale take-profit price", () => {
		resetPrices({ referencePrice: 80 });
		const tpReturn = findInput(container, "Take profit return");
		changeInput(tpReturn, "50");
		expect(findInput(container, "Take Profit").value).toBe("84.00");

		changeInput(tpReturn, ".");
		expect(tpReturn.value).toBe(".");
		expect(findInput(container, "Take Profit").value).toBe("");
		expect(tpReturnInvalidState).toBe(false);
		expect(tpReturn.getAttribute("aria-invalid")).toBe("false");
		expect(container.textContent).not.toContain("Invalid amount");

		act(() => tpReturn.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
		expect(tpReturnInvalidState).toBe(true);
		expect(tpReturn.getAttribute("aria-invalid")).toBe("true");
		expect(container.textContent).toContain("Invalid amount");
	});

	it("lets the user type zero-prefixed decimal returns without flashing an error", () => {
		resetPrices({ referencePrice: 80 });
		const tpReturn = findInput(container, "Take profit return");

		for (const value of ["0", "0."]) {
			changeInput(tpReturn, value);
			expect(tpReturn.value).toBe(value);
			expect(tpReturnInvalidState).toBe(false);
			expect(tpReturn.getAttribute("aria-invalid")).toBe("false");
			expect(container.textContent).not.toContain("Invalid amount");
			expect(findInput(container, "Take Profit").value).toBe("");
		}

		changeInput(tpReturn, "0.5");
		expect(tpReturnInvalidState).toBe(false);
		expect(tpReturn.getAttribute("aria-invalid")).toBe("false");
		expect(container.textContent).not.toContain("Invalid amount");
		expect(findInput(container, "Take Profit").value).toBe("80.04");
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

	it("keeps an existing price when a return conversion cannot resolve", async () => {
		renderForm({ size: 0 });
		const tpPrice = findInput(container, "Take Profit");
		changeInput(tpPrice, "105");
		const tpReturn = findInput(container, "Take profit return");
		expect(tpReturn.disabled).toBe(false);
		await chooseOtherUnit(container);
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

	it("uses separate units per row", async () => {
		resetPrices();
		changeInput(findInput(container, "Take Profit"), "110");
		changeInput(findInput(container, "Stop Loss"), "95");
		const toggles = container.querySelectorAll<HTMLButtonElement>('button[role="combobox"][aria-label$="return unit"]');
		expect(toggles.length).toBe(2);
		await chooseOtherUnit(container);
		const unitLabels = Array.from(toggles).map((toggle) => toggle.textContent);
		expect(unitLabels[0]).toBe("$");
		expect(unitLabels[1]).toBe("%");
		expect(findInput(container, "Take Profit").value).toBe("110");
		expect(findInput(container, "Stop Loss").value).toBe("95");
		expect(findInput(container, "Take profit return").value).toBe("20");
		expect(findInput(container, "Stop loss return").value).toBe("50");
		await chooseOtherUnit(container);
	});

	it("labels collateral return with the builder market quote token", async () => {
		resetPrices({ quoteSymbol: "USDH" });
		const toggles = container.querySelectorAll<HTMLButtonElement>('button[role="combobox"][aria-label$="return unit"]');
		await chooseOtherUnit(container);

		expect(toggles[0]?.textContent).toBe("USDH");
		changeInput(findInput(container, "Take profit return"), "10");
		expect(findInput(container, "Take Profit").value).toBe("105.00");
	});

	it("re-derives a collateral target when size changes", async () => {
		resetPrices({ referencePrice: 100, size: 2 });
		await chooseOtherUnit(container);
		const tpReturn = findInput(container, "Take profit return");
		changeInput(tpReturn, "10");
		expect(findInput(container, "Take Profit").value).toBe("105.00");

		renderForm({ referencePrice: 100, size: 4 });
		expect(tpReturn.value).toBe("10");
		expect(findInput(container, "Take Profit").value).toBe("102.50");
	});

	it("keeps an unrepresentable collateral amount invalid until it is corrected or cleared", async () => {
		resetPrices({ referencePrice: 100, size: 2 });
		changeInput(findInput(container, "Stop Loss"), "95");
		await chooseOtherUnit(container);
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

	it("keeps a positive sub-cent collateral return distinguishable from zero", async () => {
		resetPrices({ referencePrice: 100, size: 0.00001, szDecimals: 5 });
		changeInput(findInput(container, "Take Profit"), "101");
		await chooseOtherUnit(container);

		expect(findInput(container, "Take profit return").value).toBe("0.00001");
	});

	it("resets collateral mode safely when quote metadata disappears", async () => {
		resetPrices({ quoteSymbol: "USDC" });
		let toggle = container.querySelectorAll<HTMLButtonElement>('button[role="combobox"][aria-label$="return unit"]')[0];
		await chooseOtherUnit(container);
		changeInput(findInput(container, "Take profit return"), "10");
		expect(toggle?.textContent).toBe("$");

		renderForm({ quoteSymbol: null });
		toggle = container.querySelectorAll<HTMLButtonElement>('button[role="combobox"][aria-label$="return unit"]')[0];
		expect(toggle?.textContent).toBe("%");
		expect(toggle?.disabled).toBe(true);
		expect(findInput(container, "Take profit return").disabled).toBe(false);
		expect(findInput(container, "Take profit return").value).not.toBe("10");
	});

	it("preserves the selected unit when the order side changes", async () => {
		resetPrices();
		let toggle = container.querySelectorAll<HTMLButtonElement>('button[role="combobox"][aria-label$="return unit"]')[0];
		await chooseOtherUnit(container);
		expect(toggle?.textContent).toBe("$");

		act(() => orderActions.setSide("sell"));
		toggle = container.querySelectorAll<HTMLButtonElement>('button[role="combobox"][aria-label$="return unit"]')[0];
		expect(toggle?.textContent).toBe("$");

		act(() => orderActions.setSide("buy"));
	});

	it("fails closed when builder collateral metadata is missing", () => {
		resetPrices({ quoteSymbol: null });
		const tpReturn = findInput(container, "Take profit return");
		const toggle = container.querySelectorAll<HTMLButtonElement>(
			'button[role="combobox"][aria-label$="return unit"]',
		)[0];

		expect(tpReturn.disabled).toBe(false);
		expect(toggle?.disabled).toBe(true);
		changeInput(findInput(container, "Take Profit"), "105");
		expect(container.querySelector('[data-slot="trade-tpsl-pnl"]')).toBeNull();
	});
});
