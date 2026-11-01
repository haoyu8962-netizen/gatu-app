// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useBookSizeModeRequest } from "@/hooks/trade/use-book-size-mode-request";
import type { SizeMode } from "@/lib/trade/types";
import { useOrderEntryActions, useOrderSize, useSizeMode } from "@/stores/use-order-entry-store";
import {
	getOrderbookActionsStore,
	type RequestedOrderbookSizeMode,
	useSizeModeRequest,
} from "@/stores/use-orderbook-actions-store";

const PRICE = 100;

const form = {
	actions: null as ReturnType<typeof useOrderEntryActions> | null,
	request: null as RequestedOrderbookSizeMode | null,
	size: "",
	sizeMode: "base" as SizeMode,
	toggles: 0,
};

function OrderForm({ marketName }: { marketName: string }) {
	const actions = useOrderEntryActions();
	const size = useOrderSize();
	const sizeMode = useSizeMode();
	function toggleSizeDenomination() {
		form.toggles += 1;
		const next = sizeMode === "base" ? "quote" : "base";
		actions.setSizeMode(next);
		actions.setSize(String(next === "quote" ? Number(size) * PRICE : Number(size) / PRICE));
	}
	useBookSizeModeRequest(marketName, sizeMode, toggleSizeDenomination);
	form.actions = actions;
	form.request = useSizeModeRequest();
	form.size = size;
	form.sizeMode = sizeMode;
	return null;
}

function actions() {
	if (!form.actions) throw new Error("the order form did not render");
	return form.actions;
}

describe("order book size unit requests with the real stores", () => {
	let root: Root;
	let revision = 0;

	function start(sizeMode: SizeMode, size: string) {
		act(() => {
			actions().resetFormForMarket(`book-unit:${++revision}`);
			actions().setSizeMode(sizeMode);
			actions().setSize(size);
		});
		form.toggles = 0;
	}

	function pick(marketName: string, mode: SizeMode) {
		act(() => getOrderbookActionsStore().actions.requestSizeMode(marketName, mode));
	}

	beforeEach(() => {
		root = createRoot(document.createElement("div"));
		act(() => root.render(createElement(OrderForm, { marketName: "BTC" })));
	});

	afterEach(() => {
		act(() => root.unmount());
		act(() => getOrderbookActionsStore().actions.clearSizeModeRequest());
		act(() => actions().setSizeMode("base"));
	});

	it("converts the entered size once through the form's toggle and does not apply the pick again", () => {
		start("base", "2");
		pick("BTC", "quote");

		expect(form).toMatchObject({ request: null, size: "200", sizeMode: "quote", toggles: 1 });

		act(() => actions().setSizeMode("base"));
		act(() => actions().setSize("3"));
		act(() => root.render(createElement(OrderForm, { marketName: "BTC" })));
		expect(form).toMatchObject({ request: null, size: "3", sizeMode: "base", toggles: 1 });
	});

	it("applies a pick made before the form mounts once, even when StrictMode runs the effect twice", () => {
		start("base", "2");
		act(() => root.unmount());
		pick("BTC", "quote");
		root = createRoot(document.createElement("div"));
		act(() => root.render(createElement(StrictMode, null, createElement(OrderForm, { marketName: "BTC" }))));

		expect(form).toMatchObject({ request: null, size: "200", sizeMode: "quote", toggles: 1 });
	});

	it("clears a pick of the unit already in use without converting the size", () => {
		start("quote", "250");
		pick("BTC", "quote");

		expect(form).toMatchObject({ request: null, size: "250", sizeMode: "quote", toggles: 0 });
	});

	it("discards a pick made in another market's book", () => {
		start("base", "2");
		pick("ETH", "quote");

		expect(form).toMatchObject({ request: null, size: "2", sizeMode: "base", toggles: 0 });
	});
});

describe("taking an order book size unit request", () => {
	afterEach(() => {
		getOrderbookActionsStore().actions.clearSizeModeRequest();
	});

	it("takes only the request it was handed, so an older effect cannot take a newer pick", () => {
		const { actions } = getOrderbookActionsStore();
		actions.requestSizeMode("BTC", "quote");
		const first = getOrderbookActionsStore().sizeModeRequest;
		actions.requestSizeMode("BTC", "quote");
		const second = getOrderbookActionsStore().sizeModeRequest;
		if (!first || !second) throw new Error("the picks were not stored");

		expect(second).not.toBe(first);
		expect(actions.takeSizeModeRequest(first)).toBe(false);
		expect(getOrderbookActionsStore().sizeModeRequest).toBe(second);
		expect(actions.takeSizeModeRequest(second)).toBe(true);
		expect(getOrderbookActionsStore().sizeModeRequest).toBeNull();
		expect(actions.takeSizeModeRequest(second)).toBe(false);
	});
});
