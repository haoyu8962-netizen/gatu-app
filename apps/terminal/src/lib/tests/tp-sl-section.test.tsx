// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TpSlSection } from "@/components/trade/tradebox/tp-sl-section";
import { createI18nRoot } from "./harness/react";

describe("TpSlSection position ROE shortcuts", () => {
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

	it("keeps ROE based on entry price while disabling targets invalid against the live mark", () => {
		const onTpPriceChange = vi.fn();
		act(() => {
			root.render(
				createElement(TpSlSection, {
					leverage: 20,
					onSlPriceChange: vi.fn(),
					onTpPriceChange,
					quickPercentMode: "roe",
					referencePrice: 100,
					side: "buy",
					size: 1,
					slPrice: "",
					szDecimals: 2,
					tpPrice: "",
					triggerValidationPrice: 102,
				}),
			);
		});

		const buttons = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Set to 25%"]');
		expect(buttons[0]?.disabled).toBe(true);

		const fiftyPercentButtons = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Set to 50%"]');
		expect(fiftyPercentButtons[0]?.disabled).toBe(false);
		act(() => fiftyPercentButtons[0]?.click());
		expect(onTpPriceChange).toHaveBeenCalledWith("102.5000");
	});
});
