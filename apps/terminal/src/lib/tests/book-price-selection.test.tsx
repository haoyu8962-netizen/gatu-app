// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OrderType } from "@/config/trade";
import { useBookPriceSelection } from "@/hooks/trade/use-book-price-selection";
import { useLimitPrice, useOrderEntryActions, useOrderType, useTriggerPrice } from "@/stores/use-order-entry-store";
import {
	getOrderbookActionsStore,
	type SelectedOrderbookPrice,
	useSelectedPrice,
} from "@/stores/use-orderbook-actions-store";

const form = {
	actions: null as ReturnType<typeof useOrderEntryActions> | null,
	limitPrice: "",
	orderType: "market" as OrderType,
	selectedPrice: null as SelectedOrderbookPrice | null,
	triggerPrice: "",
};

function OrderForm({ marketName, assetId, szDecimals }: { marketName: string; assetId?: number; szDecimals?: number }) {
	useBookPriceSelection(marketName, assetId, szDecimals);
	form.actions = useOrderEntryActions();
	form.limitPrice = useLimitPrice();
	form.orderType = useOrderType();
	form.selectedPrice = useSelectedPrice();
	form.triggerPrice = useTriggerPrice();
	return null;
}

function actions() {
	if (!form.actions) throw new Error("the order form did not render");
	return form.actions;
}

describe("order book price clicks with the real stores", () => {
	let root: Root;
	let revision = 0;

	function start(orderType: OrderType, limitPrice = "", triggerPrice = "") {
		act(() => {
			actions().resetFormForMarket(`book-click:${++revision}`);
			actions().setOrderType(orderType);
			actions().setLimitPriceFromUser(`BTC|${orderType}`, limitPrice);
			actions().setTriggerPrice(triggerPrice);
		});
	}

	function click(marketName: string, price: string) {
		act(() => getOrderbookActionsStore().actions.setSelectedPrice(marketName, price));
	}

	beforeEach(() => {
		root = createRoot(document.createElement("div"));
		act(() => root.render(createElement(OrderForm, { marketName: "BTC" })));
	});

	afterEach(() => {
		act(() => root.unmount());
		act(() => getOrderbookActionsStore().actions.clearSelectedPrice());
	});

	it("applies a click once, so changing the order type afterwards does not apply it again", () => {
		start("stopMarket", "", "100");
		click("BTC", "98.5");

		expect(form).toMatchObject({ orderType: "stopLimit", limitPrice: "98.5", triggerPrice: "100" });
		expect(form.selectedPrice).toBeNull();

		act(() => actions().setOrderType("market"));
		act(() => actions().setLimitPrice("97"));
		act(() => root.render(createElement(OrderForm, { marketName: "BTC" })));
		expect(form).toMatchObject({ orderType: "market", limitPrice: "97", triggerPrice: "100" });
	});

	it("writes the clicked price at the market's decimals once, and later market metadata does not apply it again", () => {
		start("limit");
		act(() => root.render(createElement(OrderForm, { marketName: "BTC", assetId: 0, szDecimals: 3 })));
		click("BTC", "98.5");
		expect(form.limitPrice).toBe("98.500");
		expect(form.selectedPrice).toBeNull();

		act(() => actions().setLimitPrice("97"));
		act(() => root.render(createElement(OrderForm, { marketName: "BTC", assetId: 0, szDecimals: 2 })));
		expect(form.limitPrice).toBe("97");
	});

	it("keeps a click made before the market metadata arrives as clicked", () => {
		start("limit");
		click("BTC", "98.5");
		expect(form.limitPrice).toBe("98.5");

		act(() => root.render(createElement(OrderForm, { marketName: "BTC", assetId: 0, szDecimals: 3 })));
		expect(form.limitPrice).toBe("98.5");
	});

	it.each([
		["market", "limit"],
		["limit", "limit"],
		["stopMarket", "stopLimit"],
		["stopLimit", "stopLimit"],
		["takeProfitLimit", "takeProfitLimit"],
	] as const)("turns a %s order into a %s order at the clicked price", (orderType, expected) => {
		start(orderType, "90", "100");
		click("BTC", "98.5");

		expect(form).toMatchObject({ orderType: expected, limitPrice: "98.5", triggerPrice: "100" });
		expect(form.selectedPrice).toBeNull();
	});

	it.each(["takeProfitMarket", "scale", "twap"] as const)(
		"consumes a click without changing a %s order, so switching to a limit order later does not apply it",
		(orderType) => {
			start(orderType, "90", "100");
			click("BTC", "98.5");

			expect(form).toMatchObject({ orderType, limitPrice: "90", triggerPrice: "100" });
			expect(form.selectedPrice).toBeNull();

			act(() => actions().setOrderType("limit"));
			expect(form).toMatchObject({ orderType: "limit", limitPrice: "90" });
		},
	);

	it("discards a click in another market's book", () => {
		start("market");
		click("ETH", "2500");

		expect(form).toMatchObject({ orderType: "market", limitPrice: "" });
		expect(form.selectedPrice).toBeNull();
	});
});
