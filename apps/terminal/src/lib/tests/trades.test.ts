import { describe, expect, it } from "vitest";
import {
	getTradeKey,
	getTradePriceDecimals,
	getTradeQuoteSize,
	processTrades,
	type RawTrade,
} from "@/lib/trade/trades";

describe("trades", () => {
	it("builds globally unique trade keys from time, coin, and tid", () => {
		expect(getTradeKey(1_721_977_585_899, "HYPE", 123)).toBe("1721977585899:HYPE:123");
		expect(getTradeKey(1_721_977_585_899, "BTC", "tid")).toBe("1721977585899:BTC:tid");
	});

	it("derives price precision from the market price", () => {
		expect(getTradePriceDecimals("59.046", 2, "perp")).toBe(3);
		expect(getTradePriceDecimals("72.1375", 2, "spot")).toBe(3);
		expect(getTradePriceDecimals("63958", 4, "perp")).toBe(0);
		expect(getTradePriceDecimals(null, 3, "spot")).toBe(5);
	});

	it("caps low-price precision at Hyperliquid market limits", () => {
		expect(getTradePriceDecimals("0.6058", 2, "perp")).toBe(4);
		expect(getTradePriceDecimals("0.0000004", 1, "spot")).toBe(7);
	});

	it("calculates quote size with decimal-safe arithmetic", () => {
		expect(getTradeQuoteSize("0.1", "0.2")).toBe("0.02");
		expect(getTradeQuoteSize("invalid", "0.2")).toBeNull();
	});

	it("preserves API price and size strings while formatting a 24-hour time", () => {
		const rawTrade = {
			coin: "HYPE",
			side: "B",
			px: "59.046",
			sz: "0.10",
			hash: "0xabc",
			time: 1_721_977_585_899,
			tid: 123,
			users: ["0xbuyer", "0xseller"],
		} as RawTrade;

		const [trade] = processTrades([rawTrade]);
		const [arabicTrade] = processTrades([rawTrade], "ar");
		expect(arabicTrade?.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);

		expect(trade).toMatchObject({
			id: "1721977585899:HYPE:123",
			price: "59.046",
			size: "0.10",
			side: "buy",
		});
		expect(trade?.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
	});
});
