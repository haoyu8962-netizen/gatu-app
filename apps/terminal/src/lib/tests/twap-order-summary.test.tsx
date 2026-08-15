/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TwapOrderSummary } from "@/components/trade/tradebox/twap-order-summary";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const baseProps = {
	twapMinutesNum: 30,
	twapTriggerPriceNum: null,
	twapStopPriceNum: null,
	side: "buy",
	sizeValue: 1,
	orderValue: 100,
	estimatedFee: 0.045,
	feeRatePercent: "0.0450%",
	baseToken: "BTC",
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
		expect(labels).not.toContain("Trigger Price");
		expect(labels).not.toContain("Max Price");
		expect(labels).not.toContain("Min Price");
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
});
