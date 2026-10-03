// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderToast } from "@/components/trade/tradebox/order-toast";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import type { OrderQueueItem } from "@/stores/use-order-queue-store";
import { createI18nRoot } from "./harness/react";

const numberFormatSetting = vi.hoisted(() => ({ locale: "en-US" }));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => numberFormatSetting.locale,
}));

const FILLED_ORDER: OrderQueueItem = {
	id: "filled-order",
	owner: "0x1111111111111111111111111111111111111111",
	env: "Mainnet",
	createdAt: 0,
	status: "success",
	operation: "order",
	outcome: "filled",
	market: "HYPE",
	side: "buy",
	size: "1234.5",
	price: "40",
	quoteToken: "USDC",
	execution: {
		evidence: "exchange-response",
		filledSize: "1234.5",
		requestedSize: "1234.5",
		averagePrice: "40.5",
		orderIds: [1],
		completeness: "full",
	},
};

const CLOSE_ALL: OrderQueueItem = {
	id: "close-all",
	owner: "0x1111111111111111111111111111111111111111",
	env: "Mainnet",
	createdAt: 0,
	status: "partial",
	operation: "close-all",
	children: [
		{ assetId: 0, market: "BTC", size: "2000.25", filledSize: "1234.5", status: "partial" },
		{ assetId: 1, market: "ETH", size: "1500.75", status: "accepted" },
	],
};

describe("OrderToast number format", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		numberFormatSetting.locale = "en-US";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function text(): string {
		return (container.textContent ?? "").replace(/[⁦-⁩]/g, "");
	}

	it("writes the filled size of a notification with the number-format separators", () => {
		act(() => root.render(<OrderToast order={FILLED_ORDER} onDismiss={vi.fn()} />));
		expect(text()).toContain("Bought 1,234.5 HYPE");

		numberFormatSetting.locale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(text()).toContain("Bought 1.234,5 HYPE");
		expect(text()).toContain("Avg. $40,5");
	});

	it("writes the filled and requested sizes of each child order with the number-format separators", () => {
		act(() => root.render(<OrderToast order={CLOSE_ALL} onDismiss={vi.fn()} />));
		expect(text()).toContain("Filled: 1,234.5 / 2,000.25");
		expect(text()).toContain("Size: 1,500.75");

		numberFormatSetting.locale = "fr-FR";
		act(() => notifyNumberFormatChange());
		expect(text()).toContain("Filled: 1 234,5 / 2 000,25");
		expect(text()).toContain("Size: 1 500,75");
	});
});
