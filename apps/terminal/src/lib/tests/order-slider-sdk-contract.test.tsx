// @vitest-environment jsdom

import type { OrderParameters, TwapOrderParameters } from "@nktkas/hyperliquid";
import Big from "big.js";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORDER_TYPES, type OrderType } from "@/config/trade";
import { getSizeForPercent, getSizeValueFromInput } from "@/domain/trade/order/size";
import { type OrderSubmitInput, useOrderSubmit } from "@/hooks/trade/use-order-submit";
import { marketOrderSlippagePercentToBpsString } from "@/stores/use-global-settings-store";
import { createExchangeHarness } from "./harness/hyperliquid-exchange";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	exchangeSession: {
		id: Symbol("order-slider-sdk-session"),
		env: "Mainnet" as const,
		clientKey: "0x1111111111111111111111111111111111111111",
		sessionMode: "wallet" as const,
		active: true,
	},
	submitOrder: vi.fn(),
	submitTwap: vi.fn(),
	addOrder: vi.fn(() => "sdk-queue"),
	updateOrder: vi.fn(),
	resetFormIfCurrent: vi.fn(() => true),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ ...mocks.exchangeSession, exchangeSession: mocks.exchangeSession }),
}));

vi.mock("@/hooks/trade/use-tracked-order", () => ({
	useTrackedOrder: () => ({ submitOrder: mocks.submitOrder, isPending: false }),
}));

vi.mock("@/hooks/trade/use-tracked-twap-order", () => ({
	useTrackedTwapOrder: () => ({ submitTwap: mocks.submitTwap, isPending: false }),
}));

vi.mock("@/stores/use-order-queue-store", () => ({
	useOrderQueueActions: () => ({ addOrder: mocks.addOrder, updateOrder: mocks.updateOrder }),
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	getOrderEntryDraftResetToken: () => ({ marketIdentity: "order-slider-sdk-market", draftRevision: 1 }),
	useOrderEntryActions: () => ({ resetFormIfCurrent: mocks.resetFormIfCurrent }),
}));

const markets = [
	{ assetId: 0, kind: "perp", name: "BTC", szDecimals: 5, price: 80_123, maxSize: 0.12345 },
	{ assetId: 120_031, kind: "perp", name: "xyz:SMSN", szDecimals: 3, price: 1378.9, maxSize: 1.234 },
	{ assetId: 10_000, kind: "spot", name: "@0", szDecimals: 2, price: 0.1234567, maxSize: 12_345.67 },
] as const;

type MarketFixture = (typeof markets)[number];

function orderInput(market: MarketFixture, overrides: Partial<OrderSubmitInput> = {}): OrderSubmitInput {
	const draftResetToken = hookValue?.captureDraftResetToken();
	if (!draftResetToken) throw new Error("Expected a current draft reset token");
	return {
		draftResetToken,
		market,
		baseToken: market.name,
		side: "buy",
		orderType: "market",
		sizeValue: market.maxSize,
		price: market.price,
		executionReferencePx: market.price,
		markPx: market.price,
		marginMode: "cross",
		slippageBps: 250,
		reduceOnly: false,
		tif: "Gtc",
		limitPriceInput: String(market.price),
		triggerPriceInput: String(market.price),
		scaleStartPriceInput: Big(market.price).times("0.9").toString(),
		scaleEndPriceInput: Big(market.price).times("1.1").toString(),
		scaleLevelsNum: 4,
		scaleSkewInput: "1",
		twapMinutesNum: 30,
		twapRandomize: true,
		twapTriggerPx: null,
		twapStopPx: null,
		tpSlEnabled: false,
		canUseTpSl: false,
		tpPriceNum: null,
		slPriceNum: null,
		twapOrder: false,
		scaleOrder: false,
		triggerOrder: false,
		...overrides,
	};
}

function assertTickAndLot(order: OrderParameters["orders"][number], market: MarketFixture) {
	const size = String(order.s);
	const price = String(order.p);
	expect(size).toMatch(/^\d+(?:\.\d+)?$/);
	expect(price).toMatch(/^\d+(?:\.\d+)?$/);
	expect(Big(size).gt(0)).toBe(true);
	expect(size.split(".")[1]?.length ?? 0).toBeLessThanOrEqual(market.szDecimals);
	expect(price.split(".")[1]?.length ?? 0).toBeLessThanOrEqual((market.kind === "spot" ? 8 : 6) - market.szDecimals);
	if (price.includes(".")) expect(Big(price).c.length).toBeLessThanOrEqual(5);
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useOrderSubmit> | null = null;

function Probe() {
	hookValue = useOrderSubmit();
	return null;
}

describe("slider quantity through the installed Hyperliquid SDK", () => {
	let container: HTMLDivElement;
	let root: Root;
	let sdk: ReturnType<typeof createExchangeHarness>;

	beforeEach(() => {
		sdk = createExchangeHarness();
		mocks.submitOrder.mockReset().mockImplementation(async (params: OrderParameters) => ({
			state: "confirmed",
			result: await sdk.client.order(params),
		}));
		mocks.submitTwap.mockReset().mockImplementation(async (params: TwapOrderParameters) => ({
			state: "confirmed",
			result: await sdk.client.twapOrder(params),
		}));
		mocks.updateOrder.mockClear();
		mocks.resetFormIfCurrent.mockClear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(createElement(Probe)));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		hookValue = null;
	});

	async function submit(input: OrderSubmitInput) {
		if (!hookValue) throw new Error("Expected order submit hook");
		await act(async () => hookValue?.handleSubmit(input));
	}

	for (const market of markets) {
		const types: readonly OrderType[] = market.kind === "spot" ? ["market", "limit", "scale", "twap"] : ORDER_TYPES;
		for (const orderType of types) {
			it.each([
				["buy", "base"],
				["sell", "base"],
				["buy", "quote"],
				["sell", "quote"],
			] as const)(`${market.name} ${orderType}: sends %s %s sizing as base lots`, async (side, sizeMode) => {
				const sizeInput = getSizeForPercent({
					pct: 63,
					isSpotMarket: market.kind === "spot",
					side,
					sizeMode,
					price: market.price,
					maxSize: market.maxSize,
					spotBalance: {
						baseAvailable: market.maxSize,
						quoteAvailable: 10_000,
						baseName: market.name,
						quoteName: "USDC",
					},
					szDecimals: market.szDecimals,
				});
				const sizeValue = getSizeValueFromInput({
					sizeInput,
					sizeMode,
					price: market.price,
					szDecimals: market.szDecimals,
				});
				const triggerPrice = Big(market.price)
					.times(orderType.startsWith("stop") === (side === "buy") ? "1.1" : "0.9")
					.toString();
				await submit(
					orderInput(market, {
						side,
						orderType,
						sizeValue,
						twapOrder: orderType === "twap",
						scaleOrder: orderType === "scale",
						triggerPriceInput: triggerPrice,
						limitPriceInput: orderType === "limit" ? String(market.price) : triggerPrice,
					}),
				);

				expect(sdk.signTypedData).toHaveBeenCalledOnce();
				expect(sdk.request).toHaveBeenCalledOnce();
				expect(sdk.request.mock.calls[0]?.[0]).toBe("exchange");
				const action = sdk.getAction();
				if (orderType === "twap") {
					expect(action).toEqual({
						type: "twapOrder",
						twap: { a: market.assetId, b: side === "buy", s: String(sizeValue), r: false, m: 30, t: true },
					});
				} else {
					expect(action.type).toBe("order");
					expect(action.grouping).toBe("na");
					const orders = action.orders as OrderParameters["orders"];
					expect(orders).toHaveLength(orderType === "scale" ? 4 : 1);
					for (const order of orders) {
						expect(order).toMatchObject({ a: market.assetId, b: side === "buy", r: false });
						assertTickAndLot(order, market);
						if (orderType === "market") expect(order.t).toEqual({ limit: { tif: "FrontendMarket" } });
						else if (orderType === "limit" || orderType === "scale") expect(order.t).toEqual({ limit: { tif: "Gtc" } });
						else
							expect(order.t).toMatchObject({
								trigger: { isMarket: orderType.endsWith("Market"), tpsl: orderType.startsWith("stop") ? "sl" : "tp" },
							});
					}
					expect(orders.reduce((sum, order) => sum.plus(order.s), Big(0)).eq(sizeValue)).toBe(true);
				}
				expect(Big(sizeValue).lte(Big(market.maxSize).times("0.63"))).toBe(true);
				expect(mocks.updateOrder).toHaveBeenCalledWith("sdk-queue", expect.objectContaining({ status: "success" }));
			});
		}
	}

	it.each([
		[0.1, 10],
		[2.55, 255],
		[5, 500],
	])(
		"converts saved %s percent slippage to %s basis points and caps both signed prices",
		async (percent, expectedBps) => {
			const slippageBps = Number(marketOrderSlippagePercentToBpsString(percent));
			expect(slippageBps).toBe(expectedBps);
			for (const side of ["buy", "sell"] as const) {
				await submit(orderInput(markets[1], { side, slippageBps }));
				const action = sdk.getAction(side === "buy" ? 0 : 1);
				const [order] = action.orders as OrderParameters["orders"];
				const limit = Big(markets[1].price).times(
					side === "buy" ? Big(1).plus(Big(percent).div(100)) : Big(1).minus(Big(percent).div(100)),
				);
				expect(side === "buy" ? Big(order.p).lte(limit) : Big(order.p).gte(limit)).toBe(true);
				if (percent === 0.1) expect(order.p).toBe(side === "buy" ? "1380.2" : "1377.6");
				expect(action).not.toHaveProperty("slippage");
				assertTickAndLot(order, markets[1]);
			}
		},
	);

	it.each(["Gtc", "Ioc", "Alo"] as const)(
		"preserves %s limit semantics and reduce-only through the SDK",
		async (tif) => {
			await submit(orderInput(markets[1], { orderType: "limit", side: "sell", tif, reduceOnly: true }));
			expect(sdk.getAction()).toMatchObject({
				type: "order",
				grouping: "na",
				orders: [{ a: 120_031, b: false, r: true, t: { limit: { tif } } }],
			});
		},
	);

	it.each(["buy", "sell"] as const)("keeps attached TP/SL grouped with the %s parent size", async (side) => {
		await submit(
			orderInput(markets[1], {
				side,
				tpSlEnabled: true,
				canUseTpSl: true,
				tpPriceNum: side === "buy" ? 1500 : 1200,
				slPriceNum: side === "buy" ? 1200 : 1500,
			}),
		);
		const action = sdk.getAction();
		expect(action.grouping).toBe("normalTpsl");
		const orders = action.orders as OrderParameters["orders"];
		expect(orders).toHaveLength(3);
		expect(orders[0]).toMatchObject({ b: side === "buy", r: false, s: "1.234" });
		for (const order of orders.slice(1)) {
			expect(order).toMatchObject({ b: side === "sell", r: true, s: "1.234" });
			assertTickAndLot(order, markets[1]);
		}
	});

	it.each([5, 10080])(
		"passes the patched SDK TWAP %s-minute boundary and exact trigger/stop fields",
		async (minutes) => {
			await submit(
				orderInput(markets[1], {
					orderType: "twap",
					twapOrder: true,
					twapMinutesNum: minutes,
					twapTriggerPx: "1400",
					twapStopPx: "1500",
					reduceOnly: true,
				}),
			);
			expect(sdk.getAction()).toEqual({
				type: "twapOrder",
				twap: { a: 120_031, b: true, s: "1.234", r: true, m: minutes, t: true },
				details: { t: { p: "1400", a: true }, s: "1500" },
			});
		},
	);

	it.each([4, 10081, 5.5])("blocks invalid TWAP duration %s before SDK signing", async (minutes) => {
		await submit(orderInput(markets[1], { orderType: "twap", twapOrder: true, twapMinutesNum: minutes }));
		expect(sdk.signTypedData).not.toHaveBeenCalled();
		expect(sdk.request).not.toHaveBeenCalled();
	});
});
