import { beforeEach, describe, expect, it, vi } from "vitest";

const reportClientError = vi.fn();
vi.mock("@/lib/error-reporting/client", () => ({ reportClientError }));

describe("compact market context fallback", () => {
	beforeEach(() => {
		vi.resetModules();
		reportClientError.mockReset();
	});

	it("stays disabled for the page session and reports the first failure only", async () => {
		const module = await import("@/lib/hyperliquid/markets/market-ctxs-fallback");
		expect(module.isCompactMarketCtxsDisabled()).toBe(false);
		const first = new Error("first");
		module.disableCompactMarketCtxs(first);
		module.disableCompactMarketCtxs(new Error("second"));
		expect(module.isCompactMarketCtxsDisabled()).toBe(true);
		expect(reportClientError).toHaveBeenCalledTimes(1);
		expect(reportClientError).toHaveBeenCalledWith(first, { kind: "market_ctxs_compact_fallback" });
	});

	it("reports the first locked fast price stream of the page only", async () => {
		const module = await import("@/lib/hyperliquid/markets/market-ctxs-fallback");
		const first = new Error("first");
		module.reportFastMarketPricesFallback(first);
		module.reportFastMarketPricesFallback(new Error("second"));
		expect(reportClientError).toHaveBeenCalledExactlyOnceWith(first, { kind: "market_ctxs_fast_fallback" });
	});
});
