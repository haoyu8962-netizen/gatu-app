import {
	getPayloadLimitBytesForSubscriptionKey,
	getStalenessThresholdForKey,
	isUserStreamKey,
	WS_RELIABILITY_LIMITS,
} from "@gatu/hl-react/internal/websocket/reliability";
import { describe, expect, it, vi } from "vitest";

function key(method: string) {
	return JSON.stringify(["hl", "subscription", method, {}]);
}

describe("fast mark stream reliability", () => {
	it("classifies fastAssetCtxs as a known market stream", () => {
		const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(isUserStreamKey(key("fastAssetCtxs"))).toBe(false);
		expect(warning).not.toHaveBeenCalled();

		warning.mockRestore();
	});

	it("uses bounded payload and staleness limits for fast mark streams", () => {
		expect(getPayloadLimitBytesForSubscriptionKey(key("fastAssetCtxs"))).toBe(
			WS_RELIABILITY_LIMITS.payload.perMethodMaxBytes.fastAssetCtxs,
		);
		expect(getStalenessThresholdForKey(key("fastAssetCtxs"))).toBe(10_000);
		expect(getStalenessThresholdForKey(key("activeAssetCtx"))).toBe(10_000);
		expect(getStalenessThresholdForKey(key("activeSpotAssetCtx"))).toBe(10_000);
	});
});
