import { describe, expect, it } from "vitest";
import { getTwapViewState, matchesTwapIntent, type TwapIntent, type TwapStateLike } from "@/domain/trade/twap";

const intent: TwapIntent = {
	assetId: 7,
	coin: "xyz:GOLD",
	side: "B",
	size: "1.25",
	minutes: 30,
	reduceOnly: false,
	randomize: true,
};

const state: TwapStateLike = {
	coin: "xyz:GOLD",
	side: "B",
	sz: "1.2500",
	minutes: 30,
	reduceOnly: false,
	randomize: true,
};

describe("TWAP domain state", () => {
	it("distinguishes initial failures from stale snapshots", () => {
		expect(getTwapViewState({ isConnected: false, status: "error", hasData: false, isStale: false })).toBe(
			"disconnected",
		);
		expect(getTwapViewState({ isConnected: true, status: "subscribing", hasData: false, isStale: false })).toBe(
			"loading",
		);
		expect(getTwapViewState({ isConnected: true, status: "error", hasData: false, isStale: false })).toBe("error");
		expect(getTwapViewState({ isConnected: true, status: "error", hasData: true, isStale: false })).toBe("stale");
		expect(getTwapViewState({ isConnected: true, status: "active", hasData: true, isStale: true })).toBe("stale");
		expect(getTwapViewState({ isConnected: true, status: "active", hasData: true, isStale: false })).toBe("ready");
	});

	it("matches a TWAP using every exchange field while comparing size numerically", () => {
		expect(matchesTwapIntent(intent, state)).toBe(true);
		expect(matchesTwapIntent(intent, { ...state, coin: "GOLD" })).toBe(false);
		expect(matchesTwapIntent(intent, { ...state, side: "A" })).toBe(false);
		expect(matchesTwapIntent(intent, { ...state, sz: "1.26" })).toBe(false);
		expect(matchesTwapIntent(intent, { ...state, minutes: 60 })).toBe(false);
		expect(matchesTwapIntent(intent, { ...state, reduceOnly: true })).toBe(false);
		expect(matchesTwapIntent(intent, { ...state, randomize: false })).toBe(false);
		expect(matchesTwapIntent(intent, { ...state, sz: "invalid" })).toBe(false);
	});
});
