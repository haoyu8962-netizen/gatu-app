import Big from "big.js";
import { describe, expect, it } from "vitest";
import { DEFAULT_MARKET_ORDER_SLIPPAGE_PERCENT } from "@/config/trade";
import { deriveOrderEntry } from "@/domain/trade/order/derive";
import {
	assertEntryOrderExecutionAllowed,
	type EntryOrderExecutionState,
} from "@/domain/trade/order/entry-execution-guard";
import { getSizeForPercent, getSizeValueFromInput } from "@/domain/trade/order/size";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import type { SpotBalance } from "@/hooks/trade/use-account-balances";
import { createExchangeHarness } from "./harness/hyperliquid-exchange";

const spotMarket = {
	kind: "spot",
	assetId: 10000,
	name: "@0",
	pairName: "HYPE/USDC",
	szDecimals: 2,
	isCanonical: true,
	tokensInfo: [
		{ name: "HYPE", tokenId: 150 },
		{ name: "USDC", tokenId: 0 },
	],
} as never;

const spotBalances: SpotBalance[] = [
	{ coin: "HYPE", token: 150, total: "0", hold: "0", entryNtl: "0" },
	{ coin: "USDC", token: 0, total: "100", hold: "0", entryNtl: "0" },
];

function executionState(slippageBps: number): EntryOrderExecutionState {
	return {
		active: true,
		assetId: 10000,
		szDecimals: 2,
		availabilityStatus: "success",
		availabilityReceivedAt: 1_000,
		availabilityMaxAgeMs: 20_000,
		availability: { kind: "spot", baseAvailable: "0", quoteAvailable: "100" },
		positionStateReady: false,
		positionReceivedAt: undefined,
		positionSignedSize: undefined,
		markPriceStatus: "success",
		markPx: "10",
		markPriceReceivedAt: 1_000,
		executionReferencePx: "10",
		executionPriceReceivedAt: 1_000,
		slippageBps,
		openInterestCapped: false,
	};
}

describe("spot market buy Max", () => {
	it("sizes against the signed slippage cap without exceeding the quote balance", async () => {
		const slippageBps = Big(DEFAULT_MARKET_ORDER_SLIPPAGE_PERCENT).times(100).toNumber();
		const derived = deriveOrderEntry({
			isConnected: true,
			market: spotMarket,
			side: "buy",
			conversionPrice: 10,
			sizeMode: "base",
			sizeInput: "",
			spotBalances,
			maxTradeSzs: null,
			availableToTrade: null,
			marketOrderSizing: { referencePx: 10, slippageBps },
		});

		expect(derived.maxSize).toBe(9.75);

		const quoteMaxInput = getSizeForPercent({
			pct: 100,
			isSpotMarket: true,
			side: "buy",
			sizeMode: "quote",
			price: 10,
			maxSize: derived.maxSize,
			spotBalance: derived.spotBalance,
			szDecimals: 2,
		});
		const sizeValue = getSizeValueFromInput({
			sizeInput: quoteMaxInput,
			sizeMode: "quote",
			price: 10,
			szDecimals: 2,
		});
		const plan = buildOrderPlan({
			kind: "entry",
			assetId: 10000,
			side: "buy",
			orderType: "market",
			sizeValue,
			szDecimals: 2,
			markPx: 10,
			price: 10,
			slippageBps,
			reduceOnly: false,
			tif: "Gtc",
			limitPriceInput: "",
			triggerPriceInput: "",
			scaleStartPriceInput: "",
			scaleEndPriceInput: "",
			scaleLevelsNum: null,
			scaleSkewInput: "",
			tpSlEnabled: false,
			canUseTpSl: false,
			tpPriceNum: null,
			slPriceNum: null,
		});

		expect(quoteMaxInput).toBe("97.50");
		expect(sizeValue).toBe(9.75);
		expect(plan.errors).toEqual([]);
		expect(plan.orders[0]).toMatchObject({
			a: 10000,
			b: true,
			p: "10.25",
			s: "9.75",
			t: { limit: { tif: "FrontendMarket" } },
		});
		expect(Big(plan.orders[0].p).times(plan.orders[0].s).toString()).toBe("99.9375");
		expect(() => assertEntryOrderExecutionAllowed(plan, executionState(slippageBps), 1_001)).not.toThrow();
		const sdk = createExchangeHarness();
		await sdk.client.order({ orders: plan.orders, grouping: plan.grouping });
		expect(sdk.request).toHaveBeenCalledOnce();
		expect(sdk.getAction()).toEqual({ type: "order", orders: plan.orders, grouping: "na" });
		expect(() =>
			assertEntryOrderExecutionAllowed(
				{ ...plan, orders: [{ ...plan.orders[0], s: "10" }] },
				executionState(slippageBps),
				1_001,
			),
		).toThrow("Trading availability changed before submission");
	});
});
