// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeRow } from "@/components/trade/orderbook/trade-row";
import { formatNumber } from "@/lib/format";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import type { ProcessedTrade } from "@/lib/trade/trades";
import { getResolvedFormatLocale } from "@/stores/use-global-settings-store";

const mocks = vi.hoisted(() => ({ formatLocale: "en-US", lastRevision: 0, renderCount: 0 }));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTxUrl: (hash: string, isTestnet: boolean) =>
		`https://${isTestnet ? "testnet." : ""}example.test/tx/${hash}`,
}));

vi.mock("@/lib/number-format-reactivity", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/number-format-reactivity")>();
	return {
		...actual,
		useNumberFormatRevision: () => {
			mocks.renderCount += 1;
			mocks.lastRevision = actual.useNumberFormatRevision();
			return mocks.lastRevision;
		},
	};
});

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => mocks.formatLocale,
}));

const baseTrade: ProcessedTrade = {
	id: "1721649600000:HYPE:42",
	hash: "0xabc",
	time: "12:00:00",
	price: "64.50",
	size: "1.25",
	side: "buy",
};

const baseProps: ComponentProps<typeof TradeRow> = {
	trade: baseTrade,
	priceDecimals: 2,
	szDecimals: 2,
	showInQuote: false,
	isTestnet: false,
	compact: false,
	initial: false,
};

describe("TradeRow", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.formatLocale = "en-US";
		mocks.lastRevision = 0;
		mocks.renderCount = 0;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("does not rerender for an equal cloned trade", () => {
		renderRow(baseProps);
		renderRow({ ...baseProps, trade: { ...baseTrade } });

		expect(mocks.renderCount).toBe(1);
		const row = container.querySelector("a.recent-trade-row");
		expect(row).not.toBeNull();
		expect(row?.classList).toContain("h-6");
	});

	it("rerenders for a number-format notification despite equal props", () => {
		renderRow(baseProps);
		renderRow({ ...baseProps, trade: { ...baseTrade } });
		expect(mocks.renderCount).toBe(1);
		expect(container.textContent).toContain("64.50");

		mocks.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());

		expect(mocks.renderCount).toBe(2);
		expect(mocks.lastRevision).toBeGreaterThan(0);
		expect(getResolvedFormatLocale()).toBe("de-DE");
		expect(formatNumber("64.50", 2)).toBe("64,50");
		expect(container.textContent).toContain("64,50");
	});

	it.each([
		["trade id", { trade: { ...baseTrade, id: "1721649600000:HYPE:43" } }],
		["trade hash", { trade: { ...baseTrade, hash: "0xdef" } }],
		["trade time", { trade: { ...baseTrade, time: "12:00:01" } }],
		["trade price", { trade: { ...baseTrade, price: "64.51" } }],
		["trade size", { trade: { ...baseTrade, size: "1.26" } }],
		["trade side", { trade: { ...baseTrade, side: "sell" as const } }],
		["price decimals", { priceDecimals: 3 }],
		["size decimals", { szDecimals: 3 }],
		["quote display", { showInQuote: true }],
		["network", { isTestnet: true }],
		["compact layout", { compact: true }],
		["initial snapshot", { initial: true }],
	] satisfies Array<[string, Partial<ComponentProps<typeof TradeRow>>]>)(
		"rerenders when %s changes",
		(_name, changedProps) => {
			renderRow(baseProps);
			renderRow({ ...baseProps, ...changedProps });

			expect(mocks.renderCount).toBe(2);
		},
	);

	function renderRow(props: ComponentProps<typeof TradeRow>) {
		act(() => root.render(<TradeRow {...props} />));
	}
});

describe("TradeRow containment", () => {
	it("keeps every row in the DOM while allowing offscreen rendering work to be skipped", () => {
		const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

		expect(styles).toMatch(
			/\.recent-trade-row\s*\{\s*content-visibility:\s*auto;\s*contain-intrinsic-block-size:\s*24px;\s*}/,
		);
	});
});
