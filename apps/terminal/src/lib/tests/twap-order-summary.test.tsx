/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TwapOrderSummary } from "@/components/trade/tradebox/twap-order-summary";
import { buildOrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const baseProps = {
	twapMinutesNum: 30,
	twapTriggerPriceNum: null,
	twapStopPriceNum: null,
	side: "buy",
	feeQuote: buildOrderFeeQuote({
		orderValue: 100,
		protocolRate: 0.00045,
		builderFeeTenthsBps: 10,
		marketKind: "perp",
		side: "buy",
		execution: "twap",
	}),
	szDecimals: 5,
} as const;

function getRowLabels(container: HTMLElement): string[] {
	return [...container.querySelectorAll("span.truncate")].map((node) => node.textContent ?? "");
}

describe("TwapOrderSummary trigger and stop rows", () => {
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

	it("hides the trigger and stop rows when neither price is set", () => {
		act(() => root.render(<TwapOrderSummary {...baseProps} />));

		const labels = getRowLabels(container);
		expect(container.textContent).toContain("Every 30 seconds");
		expect(labels).toContain("Frequency");
		expect(labels).toContain("Runtime");
		expect(labels).not.toContain("Number of Orders");
		expect(labels).not.toContain("Size per Suborder");
		expect(labels).not.toContain("Trigger Price");
		expect(labels).not.toContain("Max Price");
		expect(labels).not.toContain("Min Price");
		expect(container.textContent).toContain("0.0450% ($0.05)");
		expect(container.textContent).not.toContain("Hyperliquid fee");
		expect(container.textContent).not.toMatch(/\b(?:gatu|sairn)\s+fee\b/i);
	});

	it("keeps the documented 30-second cadence for a multi-day order", () => {
		act(() => root.render(<TwapOrderSummary {...baseProps} twapMinutesNum={4 * 24 * 60} />));

		expect(container.textContent).toContain("Every 30 seconds");
	});

	it("shows the trigger row and labels the stop as max price for a buy TWAP", () => {
		act(() => root.render(<TwapOrderSummary {...baseProps} twapTriggerPriceNum={105.5} twapStopPriceNum={110} />));

		const labels = getRowLabels(container);
		expect(labels).toContain("Trigger Price");
		expect(labels).toContain("Max Price");
		expect(labels).not.toContain("Min Price");
		expect(container.textContent).toContain("105.5");
		expect(container.textContent).toContain("110");
	});

	it("labels the stop as min price for a sell TWAP and skips a non-positive trigger", () => {
		act(() =>
			root.render(<TwapOrderSummary {...baseProps} side="sell" twapTriggerPriceNum={0} twapStopPriceNum={90} />),
		);

		const labels = getRowLabels(container);
		expect(labels).not.toContain("Trigger Price");
		expect(labels).toContain("Min Price");
		expect(labels).not.toContain("Max Price");
	});

	it("preserves spot precision for low-priced TWAP trigger and stop values", () => {
		act(() =>
			root.render(
				<TwapOrderSummary
					{...baseProps}
					compact
					marketKind="spot"
					twapTriggerPriceNum={0.123}
					twapStopPriceNum={0.456}
				/>,
			),
		);

		const labels = [...container.querySelectorAll("span.truncate")];
		const triggerRow = labels.find((label) => label.textContent === "Trigger Price")?.parentElement;
		const stopRow = labels.find((label) => label.textContent === "Max Price")?.parentElement;
		expect(triggerRow?.lastElementChild?.textContent).toBe("$0.123");
		expect(stopRow?.lastElementChild?.textContent).toBe("$0.456");
	});
});
