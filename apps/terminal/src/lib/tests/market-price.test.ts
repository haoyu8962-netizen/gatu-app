import { describe, expect, it } from "vitest";
import {
	getOrderEntryReferencePrice,
	isLiveMarkPriceReady,
	resolveActiveMarketPrice,
	resolveFastMarketPrice,
	selectMarketHeadlinePrice,
} from "@/domain/trade/market-price";

describe("live market price", () => {
	it("offers fresh context mids and only a fresh mark fallback to order-entry controls", () => {
		const market = { midPx: "101.234", markPx: "99", markPriceStatus: "success" as const, midPriceReceivedAt: 1_000 };
		expect(getOrderEntryReferencePrice(market, 2_000)).toBe("101.234");
		for (const status of ["loading", "stale", "error", "idle"] as const) {
			expect(getOrderEntryReferencePrice({ ...market, markPriceStatus: status }, 2_000)).toBeUndefined();
		}
		for (const midPx of [null, undefined, "0", "-1", "NaN"]) {
			expect(getOrderEntryReferencePrice({ ...market, midPx }, 2_000)).toBeUndefined();
		}
		for (const midPriceReceivedAt of [undefined, 2_001, -10_000, Number.NaN]) {
			expect(getOrderEntryReferencePrice({ ...market, midPriceReceivedAt }, 2_000)).toBeUndefined();
		}
		expect(getOrderEntryReferencePrice(undefined, 2_000)).toBeUndefined();
		for (const midPx of [null, undefined]) {
			expect(getOrderEntryReferencePrice({ ...market, midPx, markPriceReceivedAt: 1_000 }, 2_000)).toBe("99");
		}
		expect(
			getOrderEntryReferencePrice({ ...market, midPriceReceivedAt: -10_000, markPriceReceivedAt: 1_000 }, 2_000),
		).toBeUndefined();
	});
	it("selects the context mid and falls back to its mark only for a missing mid", () => {
		expect(selectMarketHeadlinePrice({ assetCtxMidPx: "72.12", assetCtxMarkPx: "72.5" })).toEqual({
			source: "assetCtxMid",
			value: "72.12",
		});
		for (const mid of [null, undefined]) {
			expect(selectMarketHeadlinePrice({ assetCtxMidPx: mid, assetCtxMarkPx: "72.5" })).toEqual({
				source: "assetCtxMark",
				value: "72.5",
			});
		}
		for (const mid of ["0", "-1", "NaN"]) {
			expect(selectMarketHeadlinePrice({ assetCtxMidPx: mid, assetCtxMarkPx: "72.5" })).toEqual({
				source: null,
				value: undefined,
			});
		}
		expect(selectMarketHeadlinePrice({ assetCtxMidPx: null, assetCtxMarkPx: null })).toEqual({
			source: null,
			value: undefined,
		});
	});

	it("uses the exact fast-market key and preserves an explicit null mid", () => {
		expect(
			resolveFastMarketPrice({
				coin: "xyz:MU",
				enabled: true,
				data: { "xyz:MU": { markPx: "123.45", midPx: null } },
				subscriptionStatus: "active",
				isStale: false,
				lastMessageAt: 1_000,
			}),
		).toEqual({
			markPx: "123.45",
			midPx: null,
			status: "success",
			receivedAt: 1_000,
			midReceivedAt: 1_000,
		});
	});

	it("keeps a last value for display but marks a stale stream unsafe", () => {
		expect(
			resolveFastMarketPrice({
				coin: "BTC",
				enabled: true,
				data: { BTC: { markPx: "100000" } },
				subscriptionStatus: "active",
				isStale: true,
				lastMessageAt: 1_000,
			}),
		).toEqual({
			markPx: "100000",
			midPx: undefined,
			status: "stale",
			receivedAt: 1_000,
			midReceivedAt: undefined,
		});
	});

	it("keeps an unchanged coin ready while the aggregate stream remains fresh", () => {
		const price = resolveFastMarketPrice({
			coin: "BTC",
			enabled: true,
			data: { BTC: { markPx: "100000", midPx: "100100" }, HYPE: { markPx: "42" } },
			subscriptionStatus: "active",
			isStale: false,
			lastMessageAt: 11_000,
		});

		expect(price).toEqual({
			markPx: "100000",
			midPx: "100100",
			status: "success",
			receivedAt: 11_000,
			midReceivedAt: 11_000,
		});
		expect(isLiveMarkPriceReady(price.status, price.markPx, price.receivedAt, 11_001)).toBe(true);
	});

	it("retains an unchanged midpoint while the aggregate stream remains fresh", () => {
		expect(
			resolveFastMarketPrice({
				coin: "BTC",
				enabled: true,
				data: { BTC: { markPx: "100000", midPx: "99990" } },
				subscriptionStatus: "active",
				isStale: false,
				lastMessageAt: 11_000,
			}),
		).toEqual({
			markPx: "100000",
			midPx: "99990",
			status: "success",
			receivedAt: 11_000,
			midReceivedAt: 11_000,
		});
	});

	it("fails closed when an active stream has no valid mark", () => {
		expect(
			resolveFastMarketPrice({
				coin: "BTC",
				enabled: true,
				data: { BTC: { markPx: "0" } },
				subscriptionStatus: "active",
				isStale: false,
				lastMessageAt: 1_000,
			}).status,
		).toBe("error");
	});

	it("fails action readiness when the aggregate stream is stale or errored", () => {
		for (const state of [
			{ subscriptionStatus: "active" as const, isStale: true },
			{ subscriptionStatus: "error" as const, isStale: true },
		]) {
			const price = resolveFastMarketPrice({
				coin: "BTC",
				enabled: true,
				data: { BTC: { markPx: "100000" } },
				lastMessageAt: 11_000,
				...state,
			});

			expect(isLiveMarkPriceReady(price.status, price.markPx, price.receivedAt, 11_001)).toBe(false);
		}
	});

	it("requires the exact active-market identity for order freshness", () => {
		expect(
			resolveActiveMarketPrice({
				coin: "ETH",
				enabled: true,
				data: { coin: "BTC", ctx: { markPx: "100000" } },
				subscriptionStatus: "active",
				isStale: false,
				lastMessageAt: 1_000,
			}).status,
		).toBe("loading");
	});

	it("checks receipt age again at the submit boundary", () => {
		expect(isLiveMarkPriceReady("success", "100", 1_000, 10_999)).toBe(true);
		expect(isLiveMarkPriceReady("success", "100", 1_000, 11_001)).toBe(false);
		expect(isLiveMarkPriceReady("stale", "100", 1_000, 1_001)).toBe(false);
	});
});
