import { describe, expect, it } from "vitest";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { resolvePositionMarketClosePercent } from "@/domain/trade/position-market-close";
import { getPositionTpSlSizeForPercent } from "@/domain/trade/position-tpsl-size";
import { createExchangeHarness } from "./harness/hyperliquid-exchange";

const MARKETS = [
	{ market: "main perpetual", assetId: 0, isLong: true },
	{ market: "main perpetual", assetId: 0, isLong: false },
	{ market: "HIP-3 perpetual", assetId: 120_031, isLong: true },
	{ market: "HIP-3 perpetual", assetId: 120_031, isLong: false },
] as const;

describe("position slider SDK request contract", () => {
	it.each(MARKETS)("preserves 63% close sizing for $market long=$isLong", async ({ assetId, isLong }) => {
		const exchange = createExchangeHarness();
		const signedPositionSize = isLong ? "0.301" : "-0.301";
		const sizing = resolvePositionMarketClosePercent({ signedPositionSize, percent: "63", szDecimals: 3 });
		expect(sizing.errors).toEqual([]);
		const marketPlan = buildOrderPlan({
			kind: "marketClose",
			assetId,
			signedPositionSize,
			closeSize: sizing.normalizedSize,
			szDecimals: 3,
			referencePx: "100",
			slippageBps: "50",
		});
		const limitPlan = buildOrderPlan({
			kind: "limitClose",
			assetId,
			isLong,
			size: sizing.normalizedSize,
			szDecimals: 3,
			price: "100",
		});
		for (const plan of [marketPlan, limitPlan]) {
			expect(plan.errors).toEqual([]);
			await exchange.client.order({ orders: plan.orders, grouping: plan.grouping });
		}
		expect(exchange.getAction(0)).toEqual({
			type: "order",
			grouping: "na",
			orders: [
				{
					a: assetId,
					b: !isLong,
					p: isLong ? "99.5" : "100.5",
					s: "0.189",
					r: true,
					t: { limit: { tif: "FrontendMarket" } },
				},
			],
		});
		expect(exchange.getAction(1)).toEqual({
			type: "order",
			grouping: "na",
			orders: [
				{
					a: assetId,
					b: !isLong,
					p: "100",
					s: "0.189",
					r: true,
					t: { limit: { tif: "Gtc" } },
				},
			],
		});
	});

	it.each(MARKETS)("serializes TP and SL for $market long=$isLong", async ({ assetId, isLong }) => {
		const exchange = createExchangeHarness();
		const size = getPositionTpSlSizeForPercent("0.301", 63, 3);
		for (const executionMode of ["market", "limit"] as const) {
			const plan = buildOrderPlan({
				kind: "positionTpsl",
				assetId,
				isLong,
				szDecimals: 3,
				sizeNum: size,
				tpPriceNum: isLong ? "110" : "90",
				slPriceNum: isLong ? "90" : "110",
				executionMode,
				tpLimitPriceNum: isLong ? "109" : "91",
				slLimitPriceNum: isLong ? "89" : "111",
			});
			expect(plan.errors).toEqual([]);
			await exchange.client.order({ orders: plan.orders, grouping: plan.grouping });
		}
		expect(exchange.getAction(0)).toEqual({
			type: "order",
			grouping: "positionTpsl",
			orders: [
				{
					a: assetId,
					b: !isLong,
					p: "99",
					s: "0.189",
					r: true,
					t: { trigger: { isMarket: true, triggerPx: isLong ? "110" : "90", tpsl: "tp" } },
				},
				{
					a: assetId,
					b: !isLong,
					p: isLong ? "81" : "121",
					s: "0.189",
					r: true,
					t: { trigger: { isMarket: true, triggerPx: isLong ? "90" : "110", tpsl: "sl" } },
				},
			],
		});
		expect(exchange.getAction(1)).toEqual({
			type: "order",
			grouping: "positionTpsl",
			orders: [
				{
					a: assetId,
					b: !isLong,
					p: isLong ? "109" : "91",
					s: "0.189",
					r: true,
					t: { trigger: { isMarket: false, triggerPx: isLong ? "110" : "90", tpsl: "tp" } },
				},
				{
					a: assetId,
					b: !isLong,
					p: isLong ? "89" : "111",
					s: "0.189",
					r: true,
					t: { trigger: { isMarket: false, triggerPx: isLong ? "90" : "110", tpsl: "sl" } },
				},
			],
		});
	});
});
