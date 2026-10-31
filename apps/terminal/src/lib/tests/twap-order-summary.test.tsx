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
	totalSize: "6.1",
	referencePx: 100,
	baseToken: "BTC",
} as const;

function getRowValue(container: HTMLElement, label: string): string | undefined {
	const row = [...container.querySelectorAll("span.truncate")].find(
		(node) => node.textContent === label,
	)?.parentElement;
	return row?.lastElementChild?.textContent ?? undefined;
}

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
		expect(labels).toEqual(["Runtime", "Size per Suborder", "Fees"]);
		expect(container.textContent).not.toContain("Every 30 seconds");
		expect(container.textContent).toContain("0.0450% ($0.05)");
		expect(container.textContent).not.toContain("Hyperliquid fee");
		expect(container.textContent).not.toMatch(/\b(?:gatu|sairn)\s+fee\b/i);
	});

	it("splits the size over one suborder per 30 seconds of runtime plus the first", () => {
		act(() => root.render(<TwapOrderSummary {...baseProps} totalSize="61" />));

		expect(getRowValue(container, "Size per Suborder")).toBe("~1.00000 BTC");
	});

	it("raises each suborder to the $10 minimum at the reference price, so a small order runs fewer suborders", () => {
		act(() => root.render(<TwapOrderSummary {...baseProps} totalSize="3" />));

		expect(getRowValue(container, "Size per Suborder")).toBe("~0.10000 BTC");
	});

	it("never shows a suborder larger than the whole order", () => {
		act(() => root.render(<TwapOrderSummary {...baseProps} totalSize="0.05" />));

		expect(getRowValue(container, "Size per Suborder")).toBe("~0.05000 BTC");
	});

	it("shows a placeholder until a size and runtime are entered", () => {
		act(() => root.render(<TwapOrderSummary {...baseProps} totalSize="" />));
		expect(getRowValue(container, "Size per Suborder")).toBe("-");

		act(() => root.render(<TwapOrderSummary {...baseProps} twapMinutesNum={null} />));
		expect(getRowValue(container, "Size per Suborder")).toBe("-");
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
