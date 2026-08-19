/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderSummary } from "@/components/trade/tradebox/order-summary";
import { ScaleOrderSummary } from "@/components/trade/tradebox/scale-order-summary";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const baseProps = {
	orderValue: 150_000,
	marginRequired: 12_000,
	takerFeePercent: "0.0090%",
	makerFeePercent: "0.0030%",
	slippagePercent: 1.4,
	onSlippageClick: vi.fn(),
} as const;

function getRowLabels(container: HTMLElement): string[] {
	return [...container.querySelectorAll("span.truncate")].map((node) => node.textContent ?? "");
}

describe("OrderSummary information rows", () => {
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
		vi.clearAllMocks();
	});

	it("keeps only order value, margin, editable slippage, and fees for market orders", () => {
		const onSlippageClick = vi.fn();
		act(() => root.render(<OrderSummary {...baseProps} orderType="market" onSlippageClick={onSlippageClick} />));

		expect(getRowLabels(container)).toEqual(["Order Value", "Margin Req.", "Slippage", "Fees"]);
		expect(container.textContent).toContain("1.4%");
		expect(container.textContent).toContain("0.0090% / 0.0030%");
		expect(container.textContent).not.toContain("Liq. Price");
		expect(container.textContent).not.toContain("Est. Slippage");
		expect(container.textContent).not.toContain("Builder Fee");

		act(() => container.querySelector<HTMLButtonElement>("button")?.click());
		expect(onSlippageClick).toHaveBeenCalledTimes(1);
	});

	it("keeps only order value, margin, and fees for limit orders", () => {
		act(() => root.render(<OrderSummary {...baseProps} orderType="limit" />));

		expect(getRowLabels(container)).toEqual(["Order Value", "Margin Req.", "Fees"]);
		expect(container.querySelector("button")).toBeNull();
		expect(container.textContent).toContain("0.0090% / 0.0030%");
	});

	it("removes the builder fee row from the desktop scale summary", () => {
		act(() =>
			root.render(
				<ScaleOrderSummary
					scaleStart={95}
					scaleEnd={105}
					scaleLevels={4}
					scaleSkew={1}
					orderValue={400}
					marginRequired={40}
					estimatedFee={0.036}
					feeRatePercent="0.0090%"
					szDecimals={2}
				/>,
			),
		);

		expect(getRowLabels(container)).not.toContain("Builder Fee");
		expect(container.textContent).toContain("0.0090%");
	});
});
