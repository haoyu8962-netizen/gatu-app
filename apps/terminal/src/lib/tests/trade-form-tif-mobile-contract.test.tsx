/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TradeFormTif } from "@/components/trade/tradebox/trade-form-tif";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("TradeFormTif mobile contract", () => {
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

	it("keeps an accessible TIF name when the narrow-screen visual label is hidden", () => {
		act(() => root.render(<TradeFormTif orderType="limit" disabled={false} tradingPanel />));

		expect(container.querySelector('[aria-label="TIF: GTC"]')).not.toBeNull();
		const visibleLabel = [...container.querySelectorAll("span")].find((element) => element.textContent === "TIF");
		expect(visibleLabel?.className).toContain("max-[339px]:hidden");
	});
});
