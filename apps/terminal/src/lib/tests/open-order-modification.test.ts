import { describe, expect, it } from "vitest";
import {
	buildOpenOrderModifyPlan,
	createOpenOrderModifyTarget,
	formatOpenOrderEditValue,
	getOpenOrderModifyCapabilities,
	type OpenOrderModifyField,
	type OpenOrderModifyMarketBinding,
	type OpenOrderModifyTarget,
	openOrderModifyParamsEqual,
} from "@/domain/trade/open-order-modification";
import type { ExchangeParams } from "@/lib/hyperliquid";
import type { OpenOrder } from "@/lib/trade/open-orders";

const OWNER = "0x1111111111111111111111111111111111111111";
const OTHER_OWNER = "0x2222222222222222222222222222222222222222";

const market: OpenOrderModifyMarketBinding = {
	coin: "BTC",
	assetId: 0,
	szDecimals: 3,
	kind: "perp",
	markPx: "100",
};

function makeLimitOrder(overrides: Partial<OpenOrder> = {}): OpenOrder {
	return {
		children: [],
		cloid: null,
		coin: "BTC",
		isPositionTpsl: false,
		isTrigger: false,
		limitPx: "100",
		oid: 42,
		orderType: "Limit",
		origSz: "3",
		reduceOnly: false,
		side: "B",
		sz: "2",
		tif: "Gtc",
		timestamp: 1_786_000_000_000,
		triggerCondition: "N/A",
		triggerPx: "0",
		...overrides,
	} as OpenOrder;
}

function makeTriggerOrder(
	orderType: "Stop Market" | "Stop Limit" | "Take Profit Market" | "Take Profit Limit",
	overrides: Partial<OpenOrder> = {},
): OpenOrder {
	const isStop = orderType.startsWith("Stop");
	const side = overrides.side ?? (isStop ? "B" : "A");
	const triggerPx = overrides.triggerPx ?? "110";
	const isMarket = orderType.endsWith("Market");
	const defaultLimitPx = isMarket ? (side === "B" ? "121" : "99") : "115";
	return makeLimitOrder({
		isTrigger: true,
		limitPx: defaultLimitPx,
		orderType,
		reduceOnly: true,
		side,
		tif: null,
		triggerCondition: `Price above ${triggerPx}`,
		triggerPx,
		...overrides,
	});
}

function captureTarget(order: OpenOrder, field: OpenOrderModifyField, binding = market): OpenOrderModifyTarget {
	const result = createOpenOrderModifyTarget({ owner: OWNER, env: "Mainnet", field, market: binding, order });
	if (result.status !== "ready") throw new Error(`Unable to capture target: ${result.reason}`);
	return result.target;
}

interface BuildOverrides {
	sessionOwner?: string;
	sessionEnv?: "Mainnet" | "Testnet";
	snapshotOwner?: string;
	snapshotEnv?: "Mainnet" | "Testnet";
	snapshotStatus?: "active" | "error" | "idle" | "subscribing";
	orders?: readonly OpenOrder[];
	market?: OpenOrderModifyMarketBinding;
}

function buildPlan(target: OpenOrderModifyTarget, order: OpenOrder, value: string, overrides: BuildOverrides = {}) {
	return buildOpenOrderModifyPlan({
		target,
		session: { owner: overrides.sessionOwner ?? OWNER, env: overrides.sessionEnv ?? "Mainnet" },
		snapshot: {
			owner: overrides.snapshotOwner ?? OWNER,
			env: overrides.snapshotEnv ?? "Mainnet",
			status: overrides.snapshotStatus ?? "active",
			orders: overrides.orders ?? [order],
		},
		market: overrides.market ?? market,
		value,
	});
}

describe("open order limit price and client order id modifications", () => {
	const ownOrder = makeLimitOrder({ cloid: "0x0000000000000000000000000000abcd" });

	it("modifies this terminal's own orders and sends the replacement without a client order id", () => {
		const plan = buildPlan(captureTarget(ownOrder, "size"), ownOrder, "1");

		expect(plan).toMatchObject({ status: "ready", normalizedValue: "1" });
		if (plan.status !== "ready") return;
		expect(plan.params.modifies).toEqual([
			{ oid: 42, order: { a: 0, b: true, p: "100", s: "1", r: false, t: { limit: { tif: "Gtc" } } } },
		]);
	});

	it("moves a limit order to a new price on the market tick and keeps its size", () => {
		const target = captureTarget(ownOrder, "limitPrice");
		const plan = buildPlan(target, ownOrder, "101.5");

		expect(plan).toMatchObject({ status: "ready", normalizedValue: "101.5" });
		if (plan.status !== "ready") return;
		expect(plan.params.modifies[0]?.order).toMatchObject({ p: "101.5", s: "2" });
		expect(buildPlan(target, ownOrder, "100.1234")).toEqual({ status: "blocked", reason: "invalid-price" });
		expect(buildPlan(target, ownOrder, "100.0")).toEqual({ status: "blocked", reason: "no-change" });
		expect(buildPlan(target, ownOrder, "0")).toEqual({ status: "blocked", reason: "invalid-price" });
	});

	it("does not offer a limit price edit for orders without one", () => {
		expect(getOpenOrderModifyCapabilities(makeTriggerOrder("Stop Limit")).limitPrice.supported).toBe(false);
		expect(
			createOpenOrderModifyTarget({
				owner: OWNER,
				env: "Mainnet",
				field: "limitPrice",
				market,
				order: makeLimitOrder({ orderType: "Market", tif: "FrontendMarket" }),
			}),
		).toEqual({ status: "blocked", reason: "unsupported-market-order" });
	});
});

describe("open order edit start values", () => {
	it("starts an edit from the size and prices at the decimals the official editor shows", () => {
		expect(formatOpenOrderEditValue("2", "size", market)).toBe("2.000");
		expect(formatOpenOrderEditValue("170", "limitPrice", market)).toBe("170.00");
		expect(formatOpenOrderEditValue("168.3", "triggerPrice", market)).toBe("168.30");
		expect(formatOpenOrderEditValue("77559", "limitPrice", { assetId: 0, szDecimals: 5 })).toBe("77559");
	});

	it("does not read the padded start values as a change", () => {
		const order = makeLimitOrder();
		expect(formatOpenOrderEditValue(order.limitPx, "limitPrice", market)).toBe("100.00");
		for (const field of ["size", "limitPrice"] as const) {
			const value = formatOpenOrderEditValue(field === "size" ? order.sz : order.limitPx, field, market);
			expect(buildPlan(captureTarget(order, field), order, value)).toEqual({ status: "blocked", reason: "no-change" });
		}
		const trigger = makeTriggerOrder("Stop Market");
		const triggerValue = formatOpenOrderEditValue(trigger.triggerPx, "triggerPrice", market);
		expect(buildPlan(captureTarget(trigger, "triggerPrice"), trigger, triggerValue)).toEqual({
			status: "blocked",
			reason: "no-change",
		});
	});
});

describe("open order modify capabilities", () => {
	it("allows limit size and price edits and reduce-only trigger size and trigger edits", () => {
		expect(getOpenOrderModifyCapabilities(makeLimitOrder())).toEqual({
			size: { supported: true, reason: null },
			triggerPrice: { supported: false, reason: "trigger-price-not-applicable" },
			limitPrice: { supported: true, reason: null },
		});

		for (const orderType of ["Stop Market", "Stop Limit", "Take Profit Market", "Take Profit Limit"] as const) {
			expect(getOpenOrderModifyCapabilities(makeTriggerOrder(orderType))).toEqual({
				size: { supported: true, reason: null },
				triggerPrice: { supported: true, reason: null },
				limitPrice: { supported: false, reason: "unsupported-order-type" },
			});
		}
	});

	it.each(["Twap Slice", "Vault Close", "Spot Dust Conversion"] as const)(
		"blocks the system order type %s",
		(orderType) => {
			expect(getOpenOrderModifyCapabilities(makeLimitOrder({ orderType })).size).toEqual({
				supported: false,
				reason: "unsupported-system-order",
			});
		},
	);

	it("blocks market, grouped, position TP/SL, unknown-TIF, and inconsistent orders", () => {
		expect(
			getOpenOrderModifyCapabilities(makeLimitOrder({ orderType: "Market", tif: "FrontendMarket" })).size.reason,
		).toBe("unsupported-market-order");
		expect(
			getOpenOrderModifyCapabilities(makeLimitOrder({ children: [makeLimitOrder({ oid: 43 })] })).size.reason,
		).toBe("grouped-order");
		expect(
			getOpenOrderModifyCapabilities(makeTriggerOrder("Stop Market", { isPositionTpsl: true, origSz: "0", sz: "0" }))
				.size.reason,
		).toBe("position-tpsl");
		expect(
			getOpenOrderModifyCapabilities(makeLimitOrder({ cloid: "0x00000000000000000000000000000001" })).size.reason,
		).toBeNull();
		expect(getOpenOrderModifyCapabilities(makeLimitOrder({ cloid: "0x01" as `0x${string}` })).size.reason).toBe(
			"invalid-order-shape",
		);
		expect(getOpenOrderModifyCapabilities(makeLimitOrder({ tif: "FrontendMarket" })).size.reason).toBe(
			"unsupported-tif",
		);
		expect(getOpenOrderModifyCapabilities(makeLimitOrder({ tif: "Unknown" as OpenOrder["tif"] })).size.reason).toBe(
			"unsupported-tif",
		);
		expect(getOpenOrderModifyCapabilities(makeTriggerOrder("Stop Market", { reduceOnly: false })).size.reason).toBe(
			"unsupported-order-type",
		);
	});

	it("blocks outcome modification until exact market precision metadata is available", () => {
		expect(getOpenOrderModifyCapabilities(makeLimitOrder({ coin: "#10" }))).toEqual({
			size: { supported: false, reason: "invalid-market-binding" },
			triggerPrice: { supported: false, reason: "invalid-market-binding" },
			limitPrice: { supported: false, reason: "invalid-market-binding" },
		});
	});
});

describe("open order modify target capture", () => {
	it("captures an immutable owner, environment, market, and order fingerprint", () => {
		const order = makeLimitOrder();
		const result = createOpenOrderModifyTarget({
			owner: OWNER.toUpperCase().replace("0X", "0x"),
			env: "Mainnet",
			field: "size",
			market,
			order,
		});
		expect(result.status).toBe("ready");
		if (result.status !== "ready") return;
		expect(result.target).toMatchObject({
			owner: OWNER,
			env: "Mainnet",
			assetId: 0,
			szDecimals: 3,
			marketKind: "perp",
			order: { oid: 42, coin: "BTC", sz: "2", origSz: "3" },
		});

		order.sz = "1";
		expect(result.target.order.sz).toBe("2");
	});

	it("fails closed for invalid owners, market bindings, and unsupported fields", () => {
		expect(
			createOpenOrderModifyTarget({ owner: "0x0", env: "Mainnet", field: "size", market, order: makeLimitOrder() }),
		).toEqual({ status: "blocked", reason: "invalid-owner" });
		expect(
			createOpenOrderModifyTarget({
				owner: OWNER,
				env: "Mainnet",
				field: "size",
				market: { ...market, coin: "ETH" },
				order: makeLimitOrder(),
			}),
		).toEqual({ status: "blocked", reason: "invalid-market-binding" });
		expect(
			createOpenOrderModifyTarget({
				owner: OWNER,
				env: "Mainnet",
				field: "triggerPrice",
				market,
				order: makeLimitOrder(),
			}),
		).toEqual({ status: "blocked", reason: "trigger-price-not-applicable" });
	});
});

describe("ordinary limit order modification plans", () => {
	it.each(["Gtc", "Alo"] as const)("rebuilds a complete %s order while only reducing remaining sz", (tif) => {
		const order = makeLimitOrder({ tif, reduceOnly: true, side: "A" });
		const target = captureTarget(order, "size");
		const plan = buildPlan(target, order, "1.25");

		expect(plan).toEqual({
			status: "ready",
			normalizedValue: "1.25",
			params: {
				modifies: [
					{
						oid: 42,
						order: { a: 0, b: false, p: "100", s: "1.25", r: true, t: { limit: { tif } } },
					},
				],
			},
		});
	});

	it("rejects Ioc modification because the fail-closed SDK path only permits Alo or non-executable Gtc", () => {
		const order = makeLimitOrder({ tif: "Ioc" });
		expect(getOpenOrderModifyCapabilities(order).size).toEqual({
			supported: false,
			reason: "unsupported-tif",
		});
	});

	it("rejects zero, excess precision, increases above latest remaining size, and no-op edits", () => {
		const order = makeLimitOrder();
		const target = captureTarget(order, "size");
		expect(buildPlan(target, order, "0")).toEqual({ status: "blocked", reason: "invalid-size" });
		expect(buildPlan(target, order, "1.2345")).toEqual({ status: "blocked", reason: "invalid-size" });
		expect(buildPlan(target, order, "2.001")).toEqual({ status: "blocked", reason: "size-exceeds-remaining" });
		expect(buildPlan(target, order, "2.000")).toEqual({ status: "blocked", reason: "no-change" });
	});
});

describe("trigger order modification plans", () => {
	it("replaces a reduce-only trigger with the always-place flag the exchange requires", () => {
		for (const orderType of ["Stop Market", "Stop Limit", "Take Profit Market", "Take Profit Limit"] as const) {
			const order = makeTriggerOrder(orderType);
			const triggerPlan = buildPlan(captureTarget(order, "triggerPrice"), order, "112");
			const sizePlan = buildPlan(captureTarget(order, "size"), order, "1");

			expect(triggerPlan).toMatchObject({ status: "ready", normalizedValue: "112" });
			expect(triggerPlan.status === "ready" ? triggerPlan.params.a : null).toBe(true);
			expect(triggerPlan.status === "ready" ? triggerPlan.params.modifies[0]?.order : null).toMatchObject({
				r: true,
				t: { trigger: { triggerPx: "112", tpsl: orderType.startsWith("Stop") ? "sl" : "tp" } },
			});
			expect(sizePlan.status === "ready" ? sizePlan.params.a : null).toBe(true);
			if (triggerPlan.status !== "ready") continue;
			const { a: _alwaysPlace, ...withoutFlag } = triggerPlan.params;
			expect(openOrderModifyParamsEqual(triggerPlan.params, withoutFlag)).toBe(false);
		}
	});

	it("rebuilds the whole replacement: a market trigger's price follows the trigger, a limit trigger keeps its price", () => {
		const cases = [
			["Stop Market", "B", "112", "123.2", true, "sl"],
			["Stop Market", "A", "95", "85.5", true, "sl"],
			["Take Profit Market", "A", "112", "100.8", true, "tp"],
			["Take Profit Market", "B", "95", "104.5", true, "tp"],
			["Stop Limit", "B", "112", "115", false, "sl"],
			["Take Profit Limit", "A", "112", "115", false, "tp"],
		] as const;
		for (const [orderType, side, trigger, price, isMarket, tpsl] of cases) {
			const order = makeTriggerOrder(orderType, { side });
			const plan = buildPlan(captureTarget(order, "triggerPrice"), order, trigger);
			expect(plan.status === "ready" ? plan.params.modifies[0]?.order : plan).toEqual({
				a: 0,
				b: side === "B",
				p: price,
				s: "2",
				r: true,
				t: { trigger: { isMarket, triggerPx: trigger, tpsl } },
			});
		}
		const stop = makeTriggerOrder("Stop Market");
		const sizePlan = buildPlan(captureTarget(stop, "size"), stop, "1");
		expect(sizePlan.status === "ready" ? sizePlan.params.modifies[0]?.order : sizePlan).toEqual({
			a: 0,
			b: true,
			p: "121",
			s: "1",
			r: true,
			t: { trigger: { isMarket: true, triggerPx: "110", tpsl: "sl" } },
		});
	});

	it("refuses a trigger on the wrong side of the mark, on the mark, or without a live mark", () => {
		const cases = [
			["Stop Market", "B", "95"],
			["Stop Market", "A", "112"],
			["Take Profit Market", "A", "95"],
			["Take Profit Market", "B", "112"],
			["Stop Limit", "B", "95"],
			["Take Profit Limit", "A", "95"],
		] as const;
		for (const [orderType, side, wrongSide] of cases) {
			const order = makeTriggerOrder(orderType, { side });
			const target = captureTarget(order, "triggerPrice");
			expect(buildPlan(target, order, wrongSide)).toEqual({ status: "blocked", reason: "invalid-trigger-direction" });
			expect(buildPlan(target, order, "100")).toEqual({ status: "blocked", reason: "invalid-trigger-direction" });
		}
		const stop = makeTriggerOrder("Stop Market");
		expect(
			buildPlan(captureTarget(stop, "triggerPrice"), stop, "112", { market: { ...market, markPx: undefined } }),
		).toEqual({ status: "blocked", reason: "mark-price-unavailable" });
	});

	it("keeps triggers that can open a position on cancel and replace, and limit replacements without the flag", () => {
		expect(
			createOpenOrderModifyTarget({
				owner: OWNER,
				env: "Mainnet",
				field: "triggerPrice",
				market,
				order: makeTriggerOrder("Stop Market", { reduceOnly: false }),
			}),
		).toEqual({ status: "blocked", reason: "unsupported-order-type" });
		const limit = makeLimitOrder();
		const plan = buildPlan(captureTarget(limit, "size"), limit, "1");
		expect(plan.status === "ready" ? plan.params : null).not.toHaveProperty("a");
	});
});

describe("fresh snapshot and execution binding", () => {
	it("requires the active owner/environment snapshot used to create the target", () => {
		const order = makeLimitOrder();
		const target = captureTarget(order, "size");
		expect(buildPlan(target, order, "1", { sessionOwner: OTHER_OWNER })).toEqual({
			status: "blocked",
			reason: "session-changed",
		});
		expect(buildPlan(target, order, "1", { sessionEnv: "Testnet" })).toEqual({
			status: "blocked",
			reason: "session-changed",
		});
		expect(buildPlan(target, order, "1", { snapshotOwner: OTHER_OWNER })).toEqual({
			status: "blocked",
			reason: "session-changed",
		});
		expect(buildPlan(target, order, "1", { snapshotStatus: "subscribing" })).toEqual({
			status: "blocked",
			reason: "snapshot-not-ready",
		});
	});

	it("requires an exact coin, asset id, size precision, and market-kind binding", () => {
		const order = makeLimitOrder();
		const target = captureTarget(order, "size");
		for (const nextMarket of [
			{ ...market, coin: "ETH" },
			{ ...market, assetId: 1 },
			{ ...market, szDecimals: 4 },
			{ ...market, kind: "builderPerp" as const },
		]) {
			expect(buildPlan(target, order, "1", { market: nextMarket })).toEqual({
				status: "blocked",
				reason: "market-binding-changed",
			});
		}
	});

	it("requires exactly one latest open order with the captured oid", () => {
		const order = makeLimitOrder();
		const target = captureTarget(order, "size");
		expect(buildPlan(target, order, "1", { orders: [] })).toEqual({ status: "blocked", reason: "order-not-open" });
		expect(buildPlan(target, order, "1", { orders: [order, { ...order }] })).toEqual({
			status: "blocked",
			reason: "ambiguous-order",
		});
	});

	it.each([
		["remaining size", { sz: "1.9" }],
		["original size", { origSz: "4" }],
		["side", { side: "A" as const }],
		["price", { limitPx: "101" }],
		["timestamp", { timestamp: 1_786_000_000_001 }],
		["reduce-only", { reduceOnly: true }],
		["TIF", { tif: "Alo" as const }],
	] as const)("blocks when the latest order %s changed", (_label, change) => {
		const opened = makeLimitOrder();
		const target = captureTarget(opened, "size");
		const latest = makeLimitOrder(change);
		expect(buildPlan(target, opened, "1", { orders: [latest] })).toEqual({
			status: "blocked",
			reason: "order-changed",
		});
	});

	it("keeps the SDK-bound payload comparable for a synchronous execution guard", () => {
		const order = makeLimitOrder();
		const target = captureTarget(order, "size");
		const plan = buildPlan(target, order, "1");
		expect(plan.status).toBe("ready");
		if (plan.status !== "ready") return;

		expect(openOrderModifyParamsEqual(plan.params, plan.params)).toBe(true);
		const changed: ExchangeParams<"batchModify"> = {
			...plan.params,
			modifies: plan.params.modifies.map((modify) => ({ ...modify, order: { ...modify.order, s: "0.5" } })),
		};
		expect(openOrderModifyParamsEqual(plan.params, changed)).toBe(false);
		const repriced: ExchangeParams<"batchModify"> = {
			...plan.params,
			modifies: plan.params.modifies.map((modify) => ({ ...modify, order: { ...modify.order, p: "101" } })),
		};
		expect(openOrderModifyParamsEqual(plan.params, repriced)).toBe(false);
	});
});
