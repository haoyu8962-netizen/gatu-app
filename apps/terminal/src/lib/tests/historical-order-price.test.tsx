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

function renderPrice(order: HistoricalOrder, market?: { kind?: string; szDecimals?: number }): string {
	return renderToStaticMarkup(
		<I18nProvider i18n={i18n}>
			<HistoricalOrderPrice market={market} order={order} />
		</I18nProvider>,
	);
}

function createLimitOrder(limitPx: string): HistoricalOrder {
	return createTriggerOrder({
		isPositionTpsl: false,
		isTrigger: false,
		limitPx,
		orderType: "Limit",
		reduceOnly: false,
		tif: "Gtc",
		triggerCondition: "N/A",
		triggerPx: "0.0",
	});
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
		expect(markup).toContain("Protection price");
		expect(markup).not.toContain("Limit Price");
		expect(markup).toContain("6.66");
	});

	it("labels a regular market order protection price instead of presenting it as a fill", () => {
		const markup = renderPrice(
			createTriggerOrder({
				isPositionTpsl: false,
				isTrigger: false,
				orderType: "Market",
				triggerPx: "0.0",
			}),
		);

		expect(markup).toContain("Execution");
		expect(markup).toContain("Market");
		expect(markup).toContain("Protection price");
		expect(markup).not.toContain("Limit Price");
		expect(markup).toContain("6.66");
	});

	it("renders an active trigger and market execution without exposing the protection price", () => {
		const markup = renderPrice(createTriggerOrder());

		expect(markup).toContain("$7.4<");
		expect(markup).toContain("Execution");
		expect(markup).toContain("Market");
		expect(markup).not.toContain("6.66");
	});

	it("renders the trigger and execution prices for a trigger-limit order", () => {
		const markup = renderPrice(createTriggerOrder({ orderType: "Stop Limit" }));

		expect(markup).toContain("6.66");
		expect(markup).toMatch(/<bdi dir="ltr">[^<]*7\.4<\/bdi>/u);
		expect(markup).toMatch(/<bdi dir="ltr">[^<]*6\.66<\/bdi>/u);
	});

	it("keeps every protocol price digit the market allows instead of cutting to cents", () => {
		expect(renderPrice(createLimitOrder("0.18342"), { kind: "perp", szDecimals: 0 })).toContain(">$0.18342<");
		expect(renderPrice(createLimitOrder("0.000123"), { kind: "spot", szDecimals: 2 })).toContain(">$0.000123<");
		expect(renderPrice(createLimitOrder("9500.5"), { kind: "perp", szDecimals: 5 })).toContain(">$9,500.5<");
		expect(renderPrice(createLimitOrder("0.1834"), { kind: "perp", szDecimals: 0 })).toContain(">$0.18340<");
		expect(renderPrice(createLimitOrder("95001.5"), { kind: "perp", szDecimals: 5 })).toContain(">$95,002<");
	});
});
