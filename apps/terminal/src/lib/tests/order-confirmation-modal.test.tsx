/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { act, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderConfirmationModal } from "@/components/trade/tradebox/order-confirmation-modal";
import type { OrderConfirmationDraft } from "@/domain/trade/order-confirmation";
import { buildOrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import { createI18nRoot } from "./harness/react";

const numberFormatSetting = vi.hoisted(() => ({ locale: "en-US" }));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => numberFormatSetting.locale,
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({
		children,
		disabled,
		onClick,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick: () => void;
	}) => (
		<button type="button" data-testid="confirm" disabled={disabled} onClick={onClick}>
			{children}
		</button>
	),
}));

const draft: OrderConfirmationDraft = {
	assetId: 0,
	marketLabel: "HYPE-USDC",
	marketKind: "perp",
	isLeveraged: true,
	side: "buy",
	orderType: "market",
	tif: "Gtc",
	baseToken: "HYPE",
	szDecimals: 2,
	sizeValue: 1,
	orderValue: 110,
	limitPrice: null,
	triggerPrice: null,
	scaleStartPrice: null,
	scaleEndPrice: null,
	scaleLevels: null,
	scaleSkew: null,
	twapMinutes: null,
	twapRandomize: false,
	twapTriggerPrice: null,
	twapStopPrice: null,
	tpSlEnabled: false,
	tpPrice: null,
	slPrice: null,
	reduceOnly: false,
	leverage: 5,
	marginMode: "cross",
	marginRequired: 22,
	feeQuote: buildOrderFeeQuote({
		orderValue: 110,
		protocolRate: "0.00045",
		builderFeeTenthsBps: 0,
		marketKind: "perp",
		side: "buy",
		execution: "order",
	}),
	liqPrice: null,
	liqWarning: false,
	slippagePercent: 2.5,
};

describe("order confirmation modal", () => {
	let container: HTMLDivElement;
	let root: Root;
	const onConfirm = vi.fn();
	const onOpenChange = vi.fn();

	beforeEach(() => {
		numberFormatSetting.locale = "en-US";
		i18n.loadAndActivate({ locale: "en", messages: {} });
		vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		onConfirm.mockReset();
		onOpenChange.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});

	function render(open: boolean, renderedDraft: OrderConfirmationDraft = draft) {
		act(() =>
			root.render(
				<OrderConfirmationModal
					open={open}
					draft={renderedDraft}
					dontShowAgain={false}
					onDontShowAgainChange={() => {}}
					onConfirm={onConfirm}
					onOpenChange={onOpenChange}
				/>,
			),
		);
	}

	function getConfirm(): HTMLButtonElement {
		const button = document.querySelector<HTMLButtonElement>('[data-testid="confirm"]');
		if (!button) throw new Error("Expected the confirm button");
		return button;
	}

	it("offers one action named with the side, no Cancel button and no submitting state", () => {
		render(true);
		expect(getConfirm().textContent).toBe("Buy / Long");
		expect(getConfirm().disabled).toBe(false);
		expect([...document.querySelectorAll("button")].some((button) => button.textContent === "Cancel")).toBe(false);
		expect(document.body.textContent).not.toContain("Submitting");
		expect(document.querySelector('button[aria-label="Close order confirmation"]')).not.toBeNull();

		act(() => getConfirm().click());
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it("treats the closing dialog as cancelled", () => {
		render(true);
		const confirm = getConfirm();
		render(false);
		expect(confirm.disabled).toBe(true);
		act(() => confirm.click());
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("rewrites the reviewed values in place when the number format changes", () => {
		const limitDraft: OrderConfirmationDraft = {
			...draft,
			orderType: "limit",
			limitPrice: 1234.5,
			sizeValue: 1234.5,
			orderValue: 1_523_948.25,
		};
		render(true, limitDraft);
		const rows = document.querySelector('[data-testid="order-confirmation-rows"]');
		expect(rows?.textContent).toContain("$1,234.5");
		expect(rows?.textContent).toContain("1,234.50 HYPE");

		numberFormatSetting.locale = "de-DE";
		act(() => notifyNumberFormatChange());

		expect(document.querySelector('[data-testid="order-confirmation-rows"]')).toBe(rows);
		expect(rows?.textContent).toContain("$1.234,5");
		expect(rows?.textContent).toContain("1.234,50 HYPE");
		expect(rows?.textContent).not.toContain("1,234.50");
	});
});
