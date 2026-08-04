import { describe, expect, it } from "vitest";
import type { OpenOrderModifyMarketBinding } from "@/domain/trade/open-order-modification";
import {
	buildOpenOrderModifyFormPlan,
	createOpenOrderModifyFormTarget,
	type OpenOrderModifyFormTarget,
} from "@/domain/trade/open-order-modification-form";
import type { OpenOrder } from "@/lib/trade/open-orders";

const OWNER = "0x1111111111111111111111111111111111111111";
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
	orderType: "Stop Market" | "Stop Limit" | "Take Profit Market" | "Take Profit Limit" = "Stop Market",
	overrides: Partial<OpenOrder> = {},
): OpenOrder {
	const isStop = orderType.startsWith("Stop");
	const side = overrides.side ?? (isStop ? "B" : "A");
	const triggerPx = overrides.triggerPx ?? "110";
	return makeLimitOrder({
		isTrigger: true,
		limitPx: orderType.endsWith("Market") ? (side === "B" ? "121" : "99") : "115",
		orderType,
		reduceOnly: true,
		side,
		tif: null,
		triggerCondition: `Price above ${triggerPx}`,
		triggerPx,
		...overrides,
	});
}

function capture(order: OpenOrder): OpenOrderModifyFormTarget {
	const result = createOpenOrderModifyFormTarget({ owner: OWNER, env: "Mainnet", market, order });
	if (result.status !== "ready") throw new Error(result.reason);
	return result.target;
}

function build(
	target: OpenOrderModifyFormTarget,
	order: OpenOrder,
	size: string,
	triggerPrice?: string,
	overrides: { owner?: string; status?: "active" | "subscribing"; market?: OpenOrderModifyMarketBinding } = {},
) {
	return buildOpenOrderModifyFormPlan({
		target,
		session: { owner: overrides.owner ?? OWNER, env: "Mainnet" },
		snapshot: {
			owner: OWNER,
			env: "Mainnet",
			status: overrides.status ?? "active",
			orders: [order],
		},
		market: overrides.market ?? market,
		size,
		triggerPrice,
	});
}

describe("open order modification form", () => {
	it("exposes size-only editing for ordinary limits", () => {
		const order = makeLimitOrder();
		const target = capture(order);
		expect(target.triggerPrice).toBeNull();
		expect(build(target, order, "1.25")).toEqual({
			status: "ready",
			normalizedSize: "1.25",
			normalizedTriggerPrice: null,
			params: {
				a: true,
				modifies: [
					{
						oid: 42,
						order: { a: 0, b: true, p: "100", s: "1.25", r: false, t: { limit: { tif: "Gtc" } } },
					},
				],
			},
		});
	});

	it.each(["Stop Market", "Stop Limit", "Take Profit Market", "Take Profit Limit"] as const)(
		"combines size and trigger changes into one complete %s payload",
		(orderType) => {
			const isStop = orderType.startsWith("Stop");
			const order = makeTriggerOrder(orderType);
			const target = capture(order);
			const nextTrigger = "120";
			const plan = build(target, order, "1.5", nextTrigger);
			expect(plan.status).toBe("ready");
			if (plan.status !== "ready") return;
			expect(plan.normalizedSize).toBe("1.5");
			expect(plan.normalizedTriggerPrice).toBe(nextTrigger);
			expect(plan.params).toEqual({
				a: true,
				modifies: [
					{
						oid: 42,
						order: {
							a: 0,
							b: isStop,
							p: orderType.endsWith("Market") ? (isStop ? "132" : "108") : "115",
							s: "1.5",
							r: true,
							t: {
								trigger: {
									isMarket: orderType.endsWith("Market"),
									triggerPx: "120",
									tpsl: isStop ? "sl" : "tp",
								},
							},
						},
					},
				],
			});
		},
	);

	it("preserves raw unchanged fields while validating the changed field exactly", () => {
		const order = makeTriggerOrder();
		const target = capture(order);
		expect(build(target, order, "1.", "110.000")).toMatchObject({
			status: "ready",
			normalizedSize: "1",
			normalizedTriggerPrice: "110",
		});
		expect(build(target, order, "2", "110")).toEqual({ status: "blocked", reason: "no-change", field: null });
	});

	it("attributes invalid size and trigger values to the correct form field", () => {
		const order = makeTriggerOrder();
		const target = capture(order);
		expect(build(target, order, "3", "110")).toEqual({
			status: "blocked",
			reason: "size-exceeds-remaining",
			field: "size",
		});
		expect(build(target, order, "2", "90")).toEqual({
			status: "blocked",
			reason: "invalid-trigger-direction",
			field: "triggerPrice",
		});
	});

	it("retains the owner, live snapshot, and market binding guards", () => {
		const order = makeLimitOrder();
		const target = capture(order);
		expect(build(target, order, "1", undefined, { owner: "0x2222222222222222222222222222222222222222" })).toEqual({
			status: "blocked",
			reason: "session-changed",
			field: "size",
		});
		expect(build(target, order, "1", undefined, { status: "subscribing" })).toEqual({
			status: "blocked",
			reason: "snapshot-not-ready",
			field: "size",
		});
		expect(build(target, order, "1", undefined, { market: { ...market, assetId: 1 } })).toEqual({
			status: "blocked",
			reason: "market-binding-changed",
			field: "size",
		});
	});

	it("does not expose the form target for unsupported orders", () => {
		expect(
			createOpenOrderModifyFormTarget({
				owner: OWNER,
				env: "Mainnet",
				market,
				order: makeLimitOrder({ orderType: "Twap Slice" }),
			}),
		).toEqual({ status: "blocked", reason: "unsupported-system-order" });
	});
});
