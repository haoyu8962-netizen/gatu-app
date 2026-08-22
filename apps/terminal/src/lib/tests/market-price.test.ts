import { describe, expect, it } from "vitest";
import {
	isLiveMarkPriceReady,
	resolveActiveMarketPrice,
	resolveFastMarketPrice,
	selectMarketHeadlinePrice,
} from "@/domain/trade/market-price";

describe("live market price", () => {
	it("selects a tradable headline midpoint without substituting mark price", () => {
		expect(
			selectMarketHeadlinePrice({
				bboMidPx: "72.1375",
				allMidsPrice: "72.13",
				assetCtxMidPx: "72.12",
			}),
		).toEqual({ source: "bbo", value: "72.1375" });
		expect(
			selectMarketHeadlinePrice({
				bboMidPx: undefined,
				allMidsPrice: undefined,
				assetCtxMidPx: null,
			}),
		).toEqual({ source: null, value: undefined });
	});

	it("uses the exact fast-market key and preserves an explicit null mid", () => {
		expect(
			resolveFastMarketPrice({
				coin: "xyz:MU",
				enabled: true,
				data: { "xyz:MU": { markPx: "123.45", midPx: null } },
				subscriptionStatus: "active",
				isStale: false,
				markReceivedAt: 1_000,
				midReceivedAt: 1_000,
				now: 1_001,
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
				markReceivedAt: 1_000,
				midReceivedAt: undefined,
				now: 1_001,
			}),
		).toEqual({
			markPx: "100000",
			midPx: undefined,
			status: "stale",
			receivedAt: 1_000,
			midReceivedAt: undefined,
		});
	});

	it("marks one coin stale even while other coins or mid-only fields keep updating", () => {
		expect(
			resolveFastMarketPrice({
				coin: "BTC",
				enabled: true,
				data: { BTC: { markPx: "100000", midPx: "100100" }, HYPE: { markPx: "42" } },
				subscriptionStatus: "active",
				isStale: false,
				markReceivedAt: 1_000,
				midReceivedAt: 11_000,
				now: 11_001,
			}).status,
		).toBe("stale");
	});

	it("expires mid independently while retaining a fresh mark", () => {
		expect(
			resolveFastMarketPrice({
				coin: "BTC",
				enabled: true,
				data: { BTC: { markPx: "100000", midPx: "99990" } },
				subscriptionStatus: "active",
				isStale: false,
				markReceivedAt: 11_000,
				midReceivedAt: 1_000,
				now: 11_001,
			}),
		).toEqual({
			markPx: "100000",
			midPx: undefined,
			status: "success",
			receivedAt: 11_000,
			midReceivedAt: 1_000,
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
				markReceivedAt: 1_000,
				midReceivedAt: undefined,
				now: 1_001,
			}).status,
		).toBe("error");
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
