import type { OrderParameters } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import { ORDER_TYPES, type OrderType } from "@/config/trade";
import {
	getMarketOpenInterestCapStatus,
	getOpenInterestCappedCoins,
	getPerpDexCoinOpenInterestCap,
	isOpenInterestCapRestrictedOrderRequest,
} from "@/domain/trade/open-interest-cap";
import { buildOrderPlan, type EntryOrderIntent } from "@/domain/trade/order-intent";
import { usesLimitPrice } from "@/lib/trade/order-types";

const USER = "0x00000000000000000000000000000000000000aa";

function webData3(perpDexStates: unknown, user: string = USER) {
	return {
		userState: {
			agentAddress: null,
			agentValidUntil: null,
			cumLedger: "0",
			serverTime: 1,
			isVault: false,
			user,
		},
		perpDexStates,
	};
}

function snapshot(overrides: Partial<Parameters<typeof getOpenInterestCappedCoins>[0]> = {}) {
	return {
		enabled: true,
		user: USER,
		event: webData3([
			{ totalVaultEquity: "0", perpsAtOpenInterestCap: ["CANTO", "FTM"] },
			{ totalVaultEquity: "0", perpsAtOpenInterestCap: ["km:AAPL"] },
		]),
		status: "active" as const,
		isStale: false,
		...overrides,
	};
}

function entry(overrides: Partial<EntryOrderIntent>): EntryOrderIntent {
	return {
		kind: "entry",
		assetId: 0,
		side: "buy",
		orderType: "limit",
		sizeValue: 3,
		szDecimals: 2,
		markPx: 100,
		price: 100,
		slippageBps: 50,
		reduceOnly: false,
		tif: "Gtc",
		limitPriceInput: "100",
		triggerPriceInput: "",
		scaleStartPriceInput: "",
		scaleEndPriceInput: "",
		scaleLevelsNum: null,
		scaleSkewInput: "",
		tpSlEnabled: false,
		canUseTpSl: false,
		tpPriceNum: null,
		slPriceNum: null,
		...overrides,
	};
}

const PLAN_INPUTS: Record<Exclude<OrderType, "twap">, Partial<EntryOrderIntent>> = {
	market: { orderType: "market" },
	limit: { orderType: "limit" },
	stopMarket: { orderType: "stopMarket", triggerPriceInput: "110" },
	stopLimit: { orderType: "stopLimit", triggerPriceInput: "110", limitPriceInput: "111" },
	takeProfitMarket: { orderType: "takeProfitMarket", triggerPriceInput: "90" },
	takeProfitLimit: { orderType: "takeProfitLimit", triggerPriceInput: "90", limitPriceInput: "91" },
	scale: {
		orderType: "scale",
		scaleStartPriceInput: "90",
		scaleEndPriceInput: "100",
		scaleLevelsNum: 3,
		scaleSkewInput: "1",
	},
};

function planParams(intent: EntryOrderIntent): OrderParameters {
	const plan = buildOrderPlan(intent);
	expect(plan.errors).toEqual([]);
	expect(plan.grouping).not.toBe("positionTpsl");
	return { orders: plan.orders, grouping: plan.grouping as "na" | "normalTpsl" };
}

describe("open-interest cap snapshot", () => {
	it("unions every dex state of a current same-user snapshot", () => {
		expect(getOpenInterestCappedCoins(snapshot())).toEqual(["CANTO", "FTM", "km:AAPL"]);
	});

	it("matches the snapshot owner case-insensitively", () => {
		expect(getOpenInterestCappedCoins(snapshot({ user: USER.toUpperCase().replace("0X", "0x") }))).toEqual([
			"CANTO",
			"FTM",
			"km:AAPL",
		]);
	});

	it("removes duplicates and ignores missing fields and malformed entries", () => {
		const event = webData3([
			{ totalVaultEquity: "0", perpsAtOpenInterestCap: ["BTC", "BTC", 7, "", null] },
			{ totalVaultEquity: "0" },
			{ totalVaultEquity: "0", perpsAtOpenInterestCap: "ETH" },
			null,
			{ totalVaultEquity: "0", perpsAtOpenInterestCap: ["xyz:TSLA", "BTC"] },
		]);
		expect(getOpenInterestCappedCoins(snapshot({ event }))).toEqual(["BTC", "xyz:TSLA"]);
	});

	it("returns a confirmed empty set when no dex reports a capped perp", () => {
		const event = webData3([{ totalVaultEquity: "0", perpsAtOpenInterestCap: [] }, { totalVaultEquity: "0" }]);
		expect(getOpenInterestCappedCoins(snapshot({ event }))).toEqual([]);
	});

	it.each([
		["disabled", { enabled: false }],
		["missing user", { user: undefined }],
		["idle", { status: "idle" as const }],
		["subscribing", { status: "subscribing" as const }],
		["error", { status: "error" as const }],
		["stale", { isStale: true }],
		["missing event", { event: undefined }],
		["another account", { event: webData3([{ perpsAtOpenInterestCap: ["BTC"] }], `0x${"b".repeat(40)}`) }],
		["missing owner", { event: { perpDexStates: [{ perpsAtOpenInterestCap: ["BTC"] }] } }],
		["non-array dex states", { event: webData3({ perpsAtOpenInterestCap: ["BTC"] }) }],
	])("treats a %s snapshot as unknown", (_label, overrides) => {
		expect(getOpenInterestCappedCoins(snapshot(overrides))).toBeNull();
	});
});

describe("market open-interest cap status", () => {
	const capped = ["BTC", "km:AAPL"];

	it("requires the exact perp or HIP-3 market name", () => {
		expect(getMarketOpenInterestCapStatus(capped, { kind: "perp", name: "BTC" })).toBe("capped");
		expect(getMarketOpenInterestCapStatus(capped, { kind: "builderPerp", name: "km:AAPL" })).toBe("capped");
		expect(getMarketOpenInterestCapStatus(capped, { kind: "perp", name: "AAPL" })).toBe("clear");
		expect(getMarketOpenInterestCapStatus(capped, { kind: "builderPerp", name: "xyz:AAPL" })).toBe("clear");
		expect(getMarketOpenInterestCapStatus(capped, { kind: "perp", name: "BT" })).toBe("clear");
		expect(getMarketOpenInterestCapStatus(capped, { kind: "perp", name: "btc" })).toBe("clear");
	});

	it("never caps spot markets", () => {
		expect(getMarketOpenInterestCapStatus(["@107", "BTC"], { kind: "spot", name: "@107" })).toBe("clear");
		expect(getMarketOpenInterestCapStatus(null, { kind: "spot", name: "@107" })).toBe("clear");
	});

	it("keeps an unknown snapshot or market unknown", () => {
		expect(getMarketOpenInterestCapStatus(null, { kind: "perp", name: "BTC" })).toBe("unknown");
		expect(getMarketOpenInterestCapStatus(undefined, { kind: "perp", name: "BTC" })).toBe("unknown");
		expect(getMarketOpenInterestCapStatus(capped, undefined)).toBe("unknown");
	});
});

describe("open-interest cap order classification", () => {
	it("restricts exactly the limit-priced order types the validator receives", () => {
		expect(ORDER_TYPES.filter(usesLimitPrice)).toEqual(["limit", "stopLimit", "takeProfitLimit"]);
	});

	for (const [orderType, input] of Object.entries(PLAN_INPUTS)) {
		const expected = usesLimitPrice(orderType as OrderType);

		it(`classifies the real ${orderType} plan like its order type`, () => {
			for (const reduceOnly of [false, true]) {
				for (const side of ["buy", "sell"] as const) {
					const params = planParams(entry({ ...input, side, reduceOnly }));
					expect(isOpenInterestCapRestrictedOrderRequest(params)).toBe(expected);
				}
			}
		});
	}

	it.each(["Gtc", "Ioc", "Alo"] as const)("restricts a %s limit order", (tif) => {
		const params = planParams(entry({ orderType: "limit", tif }));
		expect(isOpenInterestCapRestrictedOrderRequest(params)).toBe(true);
	});

	it("restricts a limit parent with attached TP/SL and allows a market parent", () => {
		const attached = { tpSlEnabled: true, canUseTpSl: true, tpPriceNum: 110, slPriceNum: 90 };
		const limit = planParams(entry({ orderType: "limit", ...attached }));
		const market = planParams(entry({ orderType: "market", ...attached }));

		expect(limit.grouping).toBe("normalTpsl");
		expect(market.grouping).toBe("normalTpsl");
		expect(isOpenInterestCapRestrictedOrderRequest(limit)).toBe(true);
		expect(isOpenInterestCapRestrictedOrderRequest(market)).toBe(false);
	});

	it("never restricts a multi-level Scale plan or position TP/SL", () => {
		const scale = planParams(entry(PLAN_INPUTS.scale));
		expect(scale.orders.length).toBeGreaterThanOrEqual(2);
		expect(isOpenInterestCapRestrictedOrderRequest(scale)).toBe(false);
		expect(
			isOpenInterestCapRestrictedOrderRequest({
				grouping: "positionTpsl",
				orders: [
					{
						a: 0,
						b: false,
						p: "90",
						s: "0",
						r: true,
						t: { trigger: { isMarket: false, triggerPx: "90", tpsl: "sl" } },
					},
				],
			}),
		).toBe(false);
	});
});

describe("HIP-3 per-coin open-interest cap", () => {
	const limits = {
		totalOiCap: "1000000.0",
		oiSzCapPerPerp: "1000.0",
		maxTransferNtl: "100000.0",
		coinToOiCap: [
			["km:AAPL", "160000.0"],
			["km:TSLA", "0.0"],
			["km:NVDA", "1e5"],
			["km:MSFT", 250000],
		],
	};

	it("returns the exact coin's positive protocol decimal", () => {
		expect(getPerpDexCoinOpenInterestCap(limits, "km:AAPL")).toBe("160000.0");
	});

	it.each([
		["a missing coin", limits, "km:GOOG"],
		["a prefix-less coin", limits, "AAPL"],
		["a zero cap", limits, "km:TSLA"],
		["a non-decimal cap", limits, "km:NVDA"],
		["a numeric cap", limits, "km:MSFT"],
		["a null response", null, "km:AAPL"],
		["an annotation-like object", { category: "stocks", description: "Apple" }, "km:AAPL"],
		["a non-tuple entry", { coinToOiCap: [["km:AAPL"], { coin: "km:AAPL", oiCap: "1" }] }, "km:AAPL"],
		["a non-array mapping", { coinToOiCap: { "km:AAPL": "160000.0" } }, "km:AAPL"],
		["an empty coin", limits, ""],
	])("returns nothing for %s", (_label, response, coin) => {
		expect(getPerpDexCoinOpenInterestCap(response, coin)).toBeNull();
	});
});
