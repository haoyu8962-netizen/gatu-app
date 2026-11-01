/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderSummary } from "@/components/trade/tradebox/order-summary";
import { ScaleOrderSummary } from "@/components/trade/tradebox/scale-order-summary";
import { buildOrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const numberFormatSetting = vi.hoisted(() => ({ locale: "en-US" }));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => numberFormatSetting.locale,
}));

const baseProps = {
	liqPrice: 65,
	liqWarning: false,
	orderValue: 150_000,
	marginRequired: 12_000,
	takerFeeQuote: buildOrderFeeQuote({
		orderValue: 150_000,
		protocolRate: 0.00009,
		builderFeeTenthsBps: 10,
		marketKind: "perp",
		side: "buy",
		execution: "order",
	}),
	makerFeeQuote: buildOrderFeeQuote({
		orderValue: 150_000,
		protocolRate: 0.00003,
		builderFeeTenthsBps: 10,
		marketKind: "perp",
		side: "buy",
		execution: "order",
	}),
	slippagePercent: 1.4,
	estimatedSlippage: { avgPx: 100.37, exceedsVisibleDepth: false, refPx: 100, slippageBps: 37 },
	szDecimals: 2,
	onSlippageClick: vi.fn(),
} as const;

function getRowLabels(container: HTMLElement): string[] {
	return [...container.querySelectorAll("span.truncate")].map((node) => node.textContent ?? "");
}

function getRowValue(container: HTMLElement, label: string): string | null {
	const labelNode = [...container.querySelectorAll("span.truncate")].find((node) => node.textContent === label);
	return labelNode?.parentElement?.lastElementChild?.textContent ?? null;
}

describe("OrderSummary information rows", () => {
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
		vi.clearAllMocks();
	});

	it("shows liquidation, estimated slippage, and the total fee pair for market orders", () => {
		const onSlippageClick = vi.fn();
		act(() => root.render(<OrderSummary {...baseProps} orderType="market" onSlippageClick={onSlippageClick} />));

		expect(getRowLabels(container)).toEqual([
			"Liq. Price",
			"Order Value",
			"Margin Req.",
			"Est. Slippage",
			"Slippage",
			"Fees",
		]);
		expect(getRowValue(container, "Liq. Price")).toBe("$65");
		expect(getRowValue(container, "Est. Slippage")).toBe("0.37%");
		expect(container.textContent).toContain("1.4%");
		const slippageValue = [...container.querySelectorAll("button span")].find((span) => span.textContent === "1.4%");
		expect(slippageValue?.className).toContain("text-signal");
		expect(slippageValue?.className).not.toContain("error");
		expect(getRowValue(container, "Fees")).toBe("0.0190% / 0.0130%");
		expect(container.textContent).not.toContain("Hyperliquid fee");
		expect(container.textContent).not.toMatch(/\b(?:gatu|sairn)\s+fee\b/i);

		act(() => container.querySelector<HTMLButtonElement>("button")?.click());
		expect(onSlippageClick).toHaveBeenCalledTimes(1);
	});

	it("restores liquidation but keeps estimated slippage market-only for limit orders", () => {
		act(() => root.render(<OrderSummary {...baseProps} orderType="limit" />));

		expect(getRowLabels(container)).toEqual(["Liq. Price", "Order Value", "Margin Req.", "Fees"]);
		expect(container.textContent).not.toContain("Est. Slippage");
		expect(container.querySelector("button")).toBeNull();
		expect(getRowValue(container, "Fees")).toBe("0.0190% / 0.0130%");
	});

	it("shows estimated slippage without liquidation or margin rows for spot market orders", () => {
		const spotFeeInput = {
			orderValue: 150_000,
			builderFeeTenthsBps: 10,
			marketKind: "spot",
			side: "buy",
			execution: "order",
		} as const;
		act(() =>
			root.render(
				<OrderSummary
					{...baseProps}
					marketKind="spot"
					orderType="market"
					takerFeeQuote={buildOrderFeeQuote({ ...spotFeeInput, protocolRate: 0.00009 })}
					makerFeeQuote={buildOrderFeeQuote({ ...spotFeeInput, protocolRate: 0.00003 })}
				/>,
			),
		);

		expect(getRowLabels(container)).toEqual(["Order Value", "Est. Slippage", "Slippage", "Fees"]);
		expect(getRowValue(container, "Est. Slippage")).toBe("0.37%");
		expect(container.textContent).not.toContain("Liq. Price");
		expect(container.textContent).not.toContain("Margin Req.");
		expect(getRowValue(container, "Fees")).toBe("0.0090% / 0.0030%");
		expect(container.textContent).not.toMatch(/\b(?:gatu|sairn)\s+fee\b/i);
	});

	it("includes the builder amount in the desktop scale fee", () => {
		act(() =>
			root.render(
				<ScaleOrderSummary
					scaleStart={95}
					scaleEnd={105}
					scaleLevels={4}
					scaleSkew={1}
					orderValue={400}
					marginRequired={40}
					feeQuote={buildOrderFeeQuote({
						orderValue: 400,
						protocolRate: 0.00009,
						builderFeeTenthsBps: 10,
						marketKind: "perp",
						side: "buy",
						execution: "order",
					})}
					szDecimals={2}
				/>,
			),
		);

		expect(container.textContent).toContain("0.0190% ($0.08)");
		expect(container.textContent).not.toContain("Hyperliquid fee");
		expect(container.textContent).not.toMatch(/\b(?:gatu|sairn)\s+fee\b/i);
	});

	it("preserves low-priced spot scale boundaries without showing a margin requirement", () => {
		act(() =>
			root.render(
				<ScaleOrderSummary
					compact
					marketKind="spot"
					scaleStart={0.123}
					scaleEnd={0.456}
					scaleLevels={4}
					scaleSkew={1}
					orderValue={400}
					marginRequired={0}
					feeQuote={buildOrderFeeQuote({
						orderValue: 400,
						protocolRate: 0.00009,
						builderFeeTenthsBps: 10,
						marketKind: "spot",
						side: "buy",
						execution: "order",
					})}
					szDecimals={5}
				/>,
			),
		);

		expect(getRowValue(container, "Start Price")).toBe("$0.123");
		expect(getRowValue(container, "End Price")).toBe("$0.456");
		expect(getRowLabels(container)).not.toContain("Margin Req.");
	});

	it("writes the editable maximum slippage and the scale size skew with the number-format separators", () => {
		act(() => root.render(<OrderSummary {...baseProps} orderType="market" />));
		numberFormatSetting.locale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(container.querySelector("button")?.textContent).toBe("1,4%");

		act(() =>
			root.render(
				<ScaleOrderSummary
					scaleStart={95}
					scaleEnd={105}
					scaleLevels={4}
					scaleSkew={1.2345}
					orderValue={400}
					marginRequired={40}
					feeQuote={baseProps.takerFeeQuote}
					szDecimals={2}
				/>,
			),
		);
		expect(getRowValue(container, "Size Skew")).toBe("1,2345");
	});

	it("writes fee rates with the number-format separators used by the converted amount", () => {
		act(() => root.render(<OrderSummary {...baseProps} orderType="limit" />));
		expect(getRowValue(container, "Fees")).toBe("0.0190% / 0.0130%");

		numberFormatSetting.locale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(getRowValue(container, "Fees")).toBe("0,0190% / 0,0130%");

		act(() =>
			root.render(
				<ScaleOrderSummary
					scaleStart={95}
					scaleEnd={105}
					scaleLevels={4}
					scaleSkew={1}
					orderValue={10_000_000}
					marginRequired={40}
					feeQuote={buildOrderFeeQuote({
						orderValue: 10_000_000,
						protocolRate: 0.00009,
						builderFeeTenthsBps: 10,
						marketKind: "perp",
						side: "buy",
						execution: "order",
					})}
					szDecimals={2}
				/>,
			),
		);
		expect(getRowValue(container, "Est. Fee")).toBe("0,0190% ($1.900,00)");

		numberFormatSetting.locale = "fr-FR";
		act(() => notifyNumberFormatChange());
		expect(getRowValue(container, "Est. Fee")).toBe("0,0190% ($1 900,00)");
	});
});
