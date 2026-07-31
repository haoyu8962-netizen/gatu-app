import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { HistoricalOrderPrice } from "@/components/trade/components/historical-order-price";

type HistoricalOrder = HistoricalOrdersResponse[number]["order"];

function createTriggerOrder(overrides: Partial<HistoricalOrder> = {}): HistoricalOrder {
	return {
		children: [],
		cloid: null,
		coin: "xyz:CXMT",
		isPositionTpsl: true,
		isTrigger: true,
		limitPx: "6.66",
		oid: 42,
		orderType: "Stop Market",
		origSz: "0",
		reduceOnly: true,
		side: "A",
		sz: "0",
		tif: null,
		timestamp: 1000,
		triggerCondition: "Price below 7.4",
		triggerPx: "7.4",
		...overrides,
	};
}

function renderPrice(order: HistoricalOrder): string {
	return renderToStaticMarkup(
		<I18nProvider i18n={i18n}>
			<HistoricalOrderPrice order={order} />
		</I18nProvider>,
	);
}

describe("HistoricalOrderPrice", () => {
	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("renders a completed trigger order without presenting a cleared trigger as zero", () => {
		const markup = renderPrice(createTriggerOrder({ isTrigger: false, triggerPx: "0.0" }));

		expect(markup).not.toContain("Trigger");
		expect(markup).not.toContain("0.00");
		expect(markup).not.toContain(">-\u003c");
		expect(markup).toContain("Execution");
		expect(markup).toContain("Market");
		expect(markup).toContain("Limit Price");
		expect(markup).toContain("6.66");
	});

	it("renders an active trigger and market execution without exposing the protection price", () => {
		const markup = renderPrice(createTriggerOrder());

		expect(markup).toContain("7.40");
		expect(markup).toContain("Execution");
		expect(markup).toContain("Market");
		expect(markup).not.toContain("6.66");
	});

	it("renders the trigger and execution prices for a trigger-limit order", () => {
		const markup = renderPrice(createTriggerOrder({ orderType: "Stop Limit" }));

		expect(markup).toContain("7.40");
		expect(markup).toContain("6.66");
	});
});
