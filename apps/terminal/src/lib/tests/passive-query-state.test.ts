import { describe, expect, it } from "vitest";
import { combinePassiveQueryStates, getPassiveQueryState, isPassiveQueryShown } from "@/lib/passive-query-state";

describe("passive query state", () => {
	it("is loading until usable data arrives and ready once it has", () => {
		expect(getPassiveQueryState({ hasData: false, failed: false, receivedSinceMount: false })).toBe("loading");
		expect(getPassiveQueryState({ hasData: true, failed: false, receivedSinceMount: false })).toBe("ready");
		expect(getPassiveQueryState({ hasData: true, failed: false, receivedSinceMount: true })).toBe("ready");
	});

	it("keeps only data received on this page after a failed request", () => {
		expect(getPassiveQueryState({ hasData: true, failed: true, receivedSinceMount: true })).toBe("retained");
		expect(getPassiveQueryState({ hasData: true, failed: true, receivedSinceMount: false })).toBe("failed");
		expect(getPassiveQueryState({ hasData: false, failed: true, receivedSinceMount: true })).toBe("failed");
		expect(getPassiveQueryState({ hasData: false, failed: true, receivedSinceMount: false })).toBe("failed");
	});

	it("lets the weakest source decide a combined snapshot", () => {
		expect(combinePassiveQueryStates(["ready", "ready"])).toBe("ready");
		expect(combinePassiveQueryStates(["ready", "retained"])).toBe("retained");
		expect(combinePassiveQueryStates(["retained", "loading"])).toBe("loading");
		expect(combinePassiveQueryStates(["loading", "failed", "ready"])).toBe("failed");
		expect(combinePassiveQueryStates([])).toBe("ready");
	});

	it("shows data only while it is ready or retained", () => {
		expect(isPassiveQueryShown("ready")).toBe(true);
		expect(isPassiveQueryShown("retained")).toBe(true);
		expect(isPassiveQueryShown("loading")).toBe(false);
		expect(isPassiveQueryShown("failed")).toBe(false);
	});
});
