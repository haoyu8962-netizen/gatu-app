// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usesLimitPrice } from "@/lib/trade/order-types";
import { useLimitPrice, useOrderEntryActions, useOrderType } from "@/stores/use-order-entry-store";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const DESKTOP_FIELDS = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/tradebox/trade-form-fields.tsx"),
	"utf8",
);
const MOBILE_VIEW = readFileSync(resolve(TEST_DIR, "../..", "components/trade/mobile/mobile-trade-view.tsx"), "utf8");

describe("limit price prefill contract", () => {
	let root: Root;
	let container: HTMLDivElement;
	let actions: ReturnType<typeof useOrderEntryActions>;
	let price = "";
	let marketRevision = 0;

	function Surface({ active = true, mid = "100" }: { active?: boolean; mid?: string }) {
		actions = useOrderEntryActions();
		price = useLimitPrice();
		const orderType = useOrderType();
		useEffect(() => {
			if (active && usesLimitPrice(orderType)) actions.setLimitPriceFromPrefill(`BTC|${orderType}`, mid);
		}, [active, mid, orderType]);
		return null;
	}

	function render(active = true, mid = "100") {
		act(() => root.render(createElement(Surface, { active, mid })));
	}

	beforeEach(() => {
		container = document.createElement("div");
		root = createRoot(container);
		render(false);
		act(() => {
			actions.resetFormForMarket(`prefill-test:${++marketRevision}`);
			actions.setOrderType("limit");
		});
	});

	afterEach(() => act(() => root.unmount()));

	it("uses shared prefill provenance on both order-entry surfaces", () => {
		for (const source of [DESKTOP_FIELDS, MOBILE_VIEW]) {
			expect(source).toContain("const limitPriceInput = useLimitPrice();");
			expect(source).toMatch(/setLimitPriceFromPrefill\(limitPrefillIdentity, formattedMid(ForPrefill)?\)/);
			expect(source).toContain("setLimitPriceFromUser(limitPrefillIdentity,");
		}
	});

	it("prefills once, preserves manual clearing through visibility changes and remounts, and retains typed prices", () => {
		render();
		expect(price).toBe("100");
		act(() => actions.setLimitPriceFromUser("BTC|limit", ""));
		render(false, "101");
		render(true, "102");
		expect(price).toBe("");
		act(() => root.render(null));
		render(true, "103");
		expect(price).toBe("");
		act(() => actions.setLimitPriceFromUser("BTC|limit", "99"));
		render(true, "104");
		expect(price).toBe("99");
	});

	it("rearms one prefill after an explicit order-type round trip without overwriting a typed price", () => {
		render();
		act(() => actions.setLimitPriceFromUser("BTC|limit", ""));
		act(() => actions.setOrderType("market"));
		act(() => actions.setOrderType("limit"));
		expect(price).toBe("100");
		act(() => actions.setLimitPriceFromUser("BTC|limit", "99"));
		act(() => actions.setOrderType("market"));
		act(() => actions.setOrderType("limit"));
		expect(price).toBe("99");
	});

	it("lets the reduce-only checkbox follow user input for trigger orders on both surfaces", () => {
		for (const source of [DESKTOP_FIELDS, MOBILE_VIEW]) {
			expect(source).toMatch(/checked: reduceOnly(Checked)?,/);
			expect(source).not.toMatch(/checked: (isTriggerOrder|triggerOrder) \|\| reduceOnly/);
			expect(source).not.toMatch(/disabled: isFormDisabled \|\| (isTriggerOrder|triggerOrder)/);
		}
	});
});
