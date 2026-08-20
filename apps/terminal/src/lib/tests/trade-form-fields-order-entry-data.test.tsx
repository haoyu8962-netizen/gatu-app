// @vitest-environment jsdom

import Big from "big.js";
import { act, Fragment } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useOrderEntryDataMock = vi.hoisted(() => vi.fn());
const tradeSizeSliderState = vi.hoisted(() => ({
	props: null as null | {
		onPercentCancel: (value: number) => void;
		onPercentChange: (value: number) => void;
		onPercentInteractionStart?: (value: number) => void;
	},
}));

vi.mock("@/hooks/trade/use-order-entry-data", () => ({
	useOrderEntryData: useOrderEntryDataMock,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ isConnected: true }),
}));

vi.mock("@/lib/hyperliquid", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/hyperliquid")>()),
	useSelectedMarketInfo: () => ({
		data: {
			assetId: 0,
			kind: "perp",
			markPx: "100",
			midPx: "100",
			name: "BTC",
			pairName: "BTC/USDC",
			szDecimals: 4,
		},
	}),
}));

vi.mock("@/hooks/trade/use-orderbook-mid-price", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/hooks/trade/use-orderbook-mid-price")>()),
	useOrderbookMidPrice: () => ({ midPx: null }),
}));

vi.mock("@/lib/number-format-reactivity", () => ({
	useNumberFormatRevision: () => 0,
}));

vi.mock("@/components/trade/components/trade-size-slider", () => ({
	TradeSizeSlider: (props: NonNullable<typeof tradeSizeSliderState.props>) => {
		tradeSizeSliderState.props = props;
		return null;
	},
}));

import { TradeFormFields } from "@/components/trade/tradebox/trade-form-fields";
import { TradeHeader } from "@/components/trade/tradebox/trade-header";
import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import { createI18nRoot } from "./harness/react";

const committedOrderEntryData = {
	availableBalance: 1_000,
	baseToken: "BTC",
	capabilities: {
		allowsCrossMargin: true,
		hasFunding: true,
		hasMarginMode: true,
		hasReduceOnly: true,
		hasTpSl: true,
		isCanonical: null,
		isLeveraged: true,
		isOnlyIsolated: false,
		maxLeverage: 50,
	},
	displayAvailableBalance: 1_000,
	displayAvailableBalanceToken: "USDC",
	hasAvailabilityError: false,
	isAvailabilityBlocked: false,
	isAvailabilityLoading: false,
	isAvailabilityStale: false,
	isSpotMarket: false,
	leverage: 20,
	leverageInteractionIdentity: "mainnet:0xabc:perp:0:BTC",
	maxSize: 10,
	orderValue: 200,
	quoteToken: "USDC",
	sizeModeLabel: "BTC",
	sizeValue: 2,
	szDecimals: 4,
};

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	act(() => {
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

describe("TradeFormFields order-entry data ownership", () => {
	let actions: ReturnType<typeof useOrderEntryActions>;
	let container: HTMLDivElement;
	let root: Root;

	function ParentHarness({ maxSize = 10 }: { maxSize?: number }) {
		const hookOrderEntryData = useOrderEntryData({
			market: undefined,
			side: "buy",
			markPx: 100,
			sizeMode: "base",
			sizeInput: "2",
			marketOrderSizing: null,
		});
		const orderEntryData = { ...hookOrderEntryData, maxSize };
		actions = useOrderEntryActions();
		const marginRequired = new Big(orderEntryData.orderValue).div(orderEntryData.leverage).toNumber();

		return (
			<Fragment>
				<TradeHeader
					orderType="market"
					side="buy"
					sideLabels={{ buy: "Long", sell: "Short", buyAria: "Buy Long", sellAria: "Sell Short" }}
					marketKind="perp"
					onOrderTypeChange={vi.fn()}
					onSideChange={vi.fn()}
					marginMode="cross"
					leverage={orderEntryData.leverage}
					isLeveraged
					accountMode="disabled"
				/>
				<output aria-label="Parent order value">{orderEntryData.orderValue}</output>
				<output aria-label="Parent margin required">{marginRequired}</output>
				<TradeFormFields
					orderEntryData={orderEntryData}
					price={100}
					positionSize={0}
					swapTargetToken={null}
					onSizeModeToggle={vi.fn()}
					onSizePercentApply={(percent) => actions.setSize(percent === 80 ? "8" : String(percent))}
					onSwapClick={vi.fn()}
				/>
			</Fragment>
		);
	}

	beforeEach(() => {
		localStorage.clear();
		useOrderEntryDataMock.mockReset();
		useOrderEntryDataMock
			.mockReturnValueOnce(committedOrderEntryData)
			.mockReturnValue({ ...committedOrderEntryData, leverage: 10 });
		tradeSizeSliderState.props = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		localStorage.clear();
	});

	it("keeps TP/SL conversion on the committed leverage while the authoritative subscription is stale", () => {
		act(() => root.render(<ParentHarness />));
		act(() => {
			actions.setSide("buy");
			actions.setOrderType("market");
			actions.setSizeMode("base");
			actions.resetForm();
			actions.setSize("2");
			actions.setTpSlEnabled(true);
		});

		expect(useOrderEntryDataMock).toHaveBeenCalledTimes(1);
		expect(container.querySelector<HTMLButtonElement>('button[title="20x"]')).not.toBeNull();
		expect(container.querySelector<HTMLOutputElement>('output[aria-label="Parent order value"]')?.value).toBe("200");
		expect(container.querySelector<HTMLOutputElement>('output[aria-label="Parent margin required"]')?.value).toBe("10");

		const returnInput = container.querySelector<HTMLInputElement>('input[aria-label="Take profit return"]');
		const priceInput = container.querySelector<HTMLInputElement>('input[aria-label="Take Profit"]');
		if (!returnInput || !priceInput) throw new Error("Expected TP/SL return controls");

		changeInput(returnInput, "50");
		expect(priceInput.value).toBe("102.50");
	});

	it("restores the exact pre-drag size when availability disables percentage sizing", () => {
		act(() => root.render(<ParentHarness />));
		act(() => actions.setSize("1.2345"));
		const beforeDrag = tradeSizeSliderState.props;
		if (!beforeDrag) throw new Error("Expected trade size slider props");

		act(() => beforeDrag.onPercentInteractionStart?.(12.345));
		act(() => beforeDrag.onPercentChange(80));
		expect(container.querySelector<HTMLInputElement>('input[placeholder="0.00"]')?.value).toBe("8");

		act(() => root.render(<ParentHarness maxSize={0} />));
		const afterDisable = tradeSizeSliderState.props;
		if (!afterDisable) throw new Error("Expected disabled trade size slider props");
		act(() => afterDisable.onPercentChange(12.345));
		expect(container.querySelector<HTMLInputElement>('input[placeholder="0.00"]')?.value).toBe("8");

		act(() => afterDisable.onPercentCancel(12.345));
		expect(container.querySelector<HTMLInputElement>('input[placeholder="0.00"]')?.value).toBe("1.2345");
	});
});
