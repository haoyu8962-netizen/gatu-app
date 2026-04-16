import { isUserStreamKey } from "@hypeterminal/hl-react/internal/websocket/reliability";
import { describe, expect, it } from "vitest";

function key(method: string, params: Record<string, unknown> = {}) {
	return JSON.stringify(["hl", "subscription", method, params]);
}

describe("isUserStreamKey", () => {
	it("returns true for method-based user streams", () => {
		expect(isUserStreamKey(key("orderUpdates"))).toBe(true);
		expect(isUserStreamKey(key("webData2"))).toBe(true);
		expect(isUserStreamKey(key("webData3"))).toBe(true);
		expect(isUserStreamKey(key("allDexsClearinghouseState"))).toBe(true);
	});

	it("returns true for subscriptions with user param", () => {
		expect(isUserStreamKey(key("clearinghouseState", { user: "0xabc" }))).toBe(true);
		expect(isUserStreamKey(key("openOrders", { user: "0xdef" }))).toBe(true);
		expect(isUserStreamKey(key("userFills", { user: "0x123" }))).toBe(true);
		expect(isUserStreamKey(key("spotState", { user: "0x456" }))).toBe(true);
	});

	it("returns false for market streams", () => {
		expect(isUserStreamKey(key("l2Book", { coin: "ETH" }))).toBe(false);
		expect(isUserStreamKey(key("trades", { coin: "ETH" }))).toBe(false);
		expect(isUserStreamKey(key("allMids"))).toBe(false);
		expect(isUserStreamKey(key("candle", { coin: "ETH", interval: "1h" }))).toBe(false);
		expect(isUserStreamKey(key("activeAssetCtx", { coin: "ETH" }))).toBe(false);
		expect(isUserStreamKey(key("activeAssetData", { coin: "ETH" }))).toBe(false);
		expect(isUserStreamKey(key("assetCtxs"))).toBe(false);
		expect(isUserStreamKey(key("spotAssetCtxs"))).toBe(false);
		expect(isUserStreamKey(key("allDexsAssetCtxs"))).toBe(false);
	});

	it("returns false for invalid keys", () => {
		expect(isUserStreamKey("invalid")).toBe(false);
		expect(isUserStreamKey("")).toBe(false);
		expect(isUserStreamKey("{}")).toBe(false);
	});
});
