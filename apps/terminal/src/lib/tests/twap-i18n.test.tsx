/** @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { i18n, type Messages } from "@lingui/core";
import { act, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderConfirmationModal } from "@/components/trade/tradebox/order-confirmation-modal";
import { TradeFormTwap } from "@/components/trade/tradebox/trade-form-twap";
import { TwapOrderSummary } from "@/components/trade/tradebox/twap-order-summary";
import type { OrderConfirmationDraft } from "@/domain/trade/order-confirmation";
import { buildOrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	setTwapMinutes: vi.fn(),
	setTwapRandomize: vi.fn(),
	setTwapTriggerPrice: vi.fn(),
	setTwapStopPrice: vi.fn(),
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => mocks,
	useTwapMinutes: () => 30,
	useTwapAdvancedEnabled: () => true,
	useTwapRandomize: () => true,
	useTwapTriggerPrice: () => "105",
	useTwapStopPrice: () => "110",
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
}));

const stopLabels = [
	{ side: "buy", english: "Max Price", chinese: "最高价" },
	{ side: "sell", english: "Min Price", chinese: "最低价" },
] as const;
const zhCatalog = readFileSync(resolve(process.cwd(), "src/locales/zh/messages.po"), "utf8");
const zhMessages: Messages = Object.fromEntries(
	stopLabels.map(({ english, chinese }) => [
		createHash("sha256").update(`${english}\x1f`).digest("base64").slice(0, 6),
		chinese,
	]),
);

function activateLocale(locale: "en" | "zh") {
	i18n.loadAndActivate({ locale, messages: locale === "zh" ? zhMessages : {} });
}

const feeQuote = buildOrderFeeQuote({
	orderValue: 110,
	protocolRate: 0.00045,
	builderFeeTenthsBps: 10,
	marketKind: "perp",
	side: "buy",
	execution: "twap",
});

const baseDraft: OrderConfirmationDraft = {
	assetId: 0,
	marketLabel: "HYPE-USDC",
	marketKind: "perp",
	isLeveraged: false,
	side: "buy",
	orderType: "twap",
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
	twapMinutes: 30,
	twapRandomize: true,
	twapTriggerPrice: 105,
	twapStopPrice: 110,
	tpSlEnabled: false,
	tpPrice: null,
	slPrice: null,
	reduceOnly: false,
	leverage: null,
	marginMode: "cross",
	marginRequired: 0,
	feeQuote,
	liqPrice: null,
	liqWarning: false,
	slippagePercent: 2.5,
};

describe("TWAP price label locale dependencies", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		activateLocale("en");
		vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		activateLocale("en");
		vi.clearAllMocks();
		vi.unstubAllGlobals();
	});

	it.each(stopLabels)("updates the $side form and summary without resetting inputs", ({ side, english, chinese }) => {
		expect(zhCatalog).toContain(`msgid "${english}"\nmsgstr "${chinese}"`);
		act(() =>
			root.render(
				<>
					<TradeFormTwap disabled={false} side={side} quoteToken="USDC" markPx={100} assetId={0} szDecimals={2} />
					<div data-testid="twap-summary">
						<TwapOrderSummary
							side={side}
							twapMinutesNum={30}
							twapTriggerPriceNum={105}
							twapStopPriceNum={110}
							feeQuote={feeQuote}
							szDecimals={2}
						/>
					</div>
				</>,
			),
		);
		const input = container.querySelector<HTMLInputElement>(`input[aria-label="${english} (USDC)"]`);
		const summary = container.querySelector('[data-testid="twap-summary"]');
		expect(input?.value).toBe("110");
		expect(summary?.textContent).toContain(english);

		act(() => activateLocale("zh"));
		expect(container.querySelector(`input[aria-label="${chinese} (USDC)"]`)).toBe(input);
		expect(input?.value).toBe("110");
		expect(summary?.textContent).toContain(chinese);
		expect(summary?.textContent).not.toContain(english);

		act(() => activateLocale("en"));
		expect(container.querySelector(`input[aria-label="${english} (USDC)"]`)).toBe(input);
		expect(input?.value).toBe("110");
		expect(summary?.textContent).toContain(english);
		expect(mocks.setTwapStopPrice).not.toHaveBeenCalled();
		expect(mocks.setTwapTriggerPrice).not.toHaveBeenCalled();
	});

	it.each(stopLabels)(
		"updates a stable $side confirmation draft without submitting it",
		({ side, english, chinese }) => {
			const draft = { ...baseDraft, side };
			const onConfirm = vi.fn();
			act(() =>
				root.render(
					<OrderConfirmationModal
						open
						draft={draft}
						isSubmitting={false}
						dontShowAgain={false}
						onDontShowAgainChange={() => {}}
						onConfirm={onConfirm}
						onOpenChange={() => {}}
					/>,
				),
			);
			const rows = document.querySelector('[data-testid="order-confirmation-rows"]');
			expect(rows?.textContent).toContain(`${english}$110`);

			act(() => activateLocale("zh"));
			expect(document.querySelector('[data-testid="order-confirmation-rows"]')).toBe(rows);
			expect(rows?.textContent).toContain(`${chinese}$110`);
			expect(rows?.textContent).not.toContain(english);

			act(() => activateLocale("en"));
			expect(document.querySelector('[data-testid="order-confirmation-rows"]')).toBe(rows);
			expect(rows?.textContent).toContain(`${english}$110`);
			expect(draft).toEqual({ ...baseDraft, side });
			expect(onConfirm).not.toHaveBeenCalled();
		},
	);
});
