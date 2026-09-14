// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_BUILD_COMMIT, APP_CHART_LIBRARY_HASH } from "@/config/app";
import { createChartLibraryScriptUrl } from "@/config/chart-library";
import { loadTradingViewScript, TRADINGVIEW_SCRIPT_SRC } from "@/lib/chart/load-tradingview";
import { loadScript } from "@/lib/load-script";

vi.mock("@/lib/load-script", () => ({
	loadScript: vi.fn(async () => {}),
}));

describe("loadTradingViewScript", () => {
	beforeEach(() => {
		vi.mocked(loadScript).mockClear();
	});

	it("loads the hashed TradingView entry, falling back to the commit-versioned file without a build hash", async () => {
		expect(TRADINGVIEW_SCRIPT_SRC).toBe(createChartLibraryScriptUrl(APP_CHART_LIBRARY_HASH || APP_BUILD_COMMIT));
		expect(APP_CHART_LIBRARY_HASH).toBe("");
		expect(TRADINGVIEW_SCRIPT_SRC).toBe(
			`/charting_library/charting_library.js?v=${encodeURIComponent(APP_BUILD_COMMIT)}`,
		);

		await loadTradingViewScript();

		expect(loadScript).toHaveBeenCalledWith(
			TRADINGVIEW_SCRIPT_SRC,
			expect.objectContaining({
				isReady: expect.any(Function),
			}),
		);
	});
});
