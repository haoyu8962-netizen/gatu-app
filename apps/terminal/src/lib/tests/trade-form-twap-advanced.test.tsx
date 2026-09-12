/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TradeFormTwap } from "@/components/trade/tradebox/trade-form-twap";
import { useOrderEntryActions, useReduceOnly } from "@/stores/use-order-entry-store";
import { createI18nRoot } from "./harness/react";

describe("TWAP advanced controls with the real draft store", () => {
	let container: HTMLDivElement;
	let root: Root;
	let actions: ReturnType<typeof useOrderEntryActions>;

	function Form({ disabled = false, spot = false, mobile = false }) {
		actions = useOrderEntryActions();
		const reduceOnly = useReduceOnly();
		return (
			<TradeFormTwap
				disabled={disabled}
				side="buy"
				quoteToken="USDC"
				markPx={100}
				assetId={spot ? 10_000 : 0}
				szDecimals={2}
				desktop={!mobile}
				compact={mobile}
				mobileSafe={mobile}
				reduceOnly={spot ? undefined : { checked: reduceOnly, onCheckedChange: actions.setReduceOnly }}
			/>
		);
	}

	function checkbox(name: string) {
		const label = [...container.querySelectorAll("label")].find((node) => node.textContent === name);
		const control = label?.querySelector<HTMLElement>('[role="checkbox"]');
		if (!control) throw new Error(`Missing checkbox ${name}`);
		return control;
	}

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(<Form />));
		act(() => actions.resetForm());
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it.each([false, true])("retains mounted drafts through advanced toggles on mobile=%s", (mobile) => {
		act(() => root.render(<Form mobile={mobile} />));
		const advanced = checkbox("Advanced Settings");
		const fields = container.querySelector<HTMLElement>('[data-slot="trade-twap-advanced"]');
		const trigger = container.querySelector<HTMLInputElement>('input[aria-label="Trigger Price (USDC)"]');
		expect(advanced.getAttribute("aria-checked")).toBe("false");
		expect(advanced.getAttribute("aria-controls")).toBe(fields?.id);
		expect(fields?.hidden).toBe(true);
		expect(trigger?.disabled).toBe(true);
		act(() => advanced.click());
		expect(fields?.hidden).toBe(false);
		expect(trigger?.disabled).toBe(false);
		act(() => {
			actions.setTwapTriggerPrice("105");
			actions.setTwapStopPrice("110");
		});
		act(() => advanced.click());
		expect(fields?.hidden).toBe(true);
		expect(trigger?.value).toBe("105");
		expect(trigger?.disabled).toBe(true);
		act(() => advanced.click());
		expect(container.querySelector('input[aria-label="Trigger Price (USDC)"]')).toBe(trigger);
		expect(trigger?.value).toBe("105");
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Max Price (USDC)"]')?.value).toBe("110");
		expect(advanced.getAttribute("aria-expanded")).toBe("true");
	});

	it("groups randomization and reduce-only without coupling their state", () => {
		const randomize = checkbox("Randomize timing");
		const reduceOnly = checkbox("Reduce Only");
		const group = container.querySelector('[data-slot="trade-twap-options"]');
		expect(group?.contains(randomize)).toBe(true);
		expect(group?.contains(reduceOnly)).toBe(true);
		act(() => reduceOnly.click());
		expect(reduceOnly.getAttribute("aria-checked")).toBe("true");
		expect(randomize.getAttribute("aria-checked")).toBe("true");
		act(() => randomize.click());
		expect(randomize.getAttribute("aria-checked")).toBe("false");
		expect(reduceOnly.getAttribute("aria-checked")).toBe("true");
		act(() => checkbox("Advanced Settings").click());
		expect(randomize.getAttribute("aria-checked")).toBe("false");
		expect(reduceOnly.getAttribute("aria-checked")).toBe("true");
	});

	it("keeps trading fields disabled while allowing advanced preview and omits reduce-only for spot", () => {
		act(() => root.render(<Form disabled />));
		for (const name of ["Randomize timing", "Reduce Only"]) {
			expect(checkbox(name).hasAttribute("data-disabled")).toBe(true);
		}
		const advanced = checkbox("Advanced Settings");
		expect(advanced.hasAttribute("data-disabled")).toBe(false);
		act(() => advanced.click());
		expect(container.querySelector<HTMLElement>('[data-slot="trade-twap-advanced"]')?.hidden).toBe(false);
		for (const input of container.querySelectorAll<HTMLInputElement>('[data-slot="trade-twap-advanced"] input')) {
			expect(input.disabled).toBe(true);
		}
		act(() => root.render(<Form spot />));
		expect(container.textContent).not.toContain("Reduce Only");
		expect(checkbox("Advanced Settings").hasAttribute("data-disabled")).toBe(false);
	});
});
