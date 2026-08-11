// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_BUILD_COMMIT } from "@/config/app";
import { loadTradingViewScript, TRADINGVIEW_SCRIPT_SRC } from "@/lib/chart/load-tradingview";
import { loadScript } from "@/lib/load-script";

vi.mock("@/lib/load-script", () => ({
	loadScript: vi.fn(async () => {}),
}));

describe("loadTradingViewScript", () => {
	beforeEach(() => {
		vi.mocked(loadScript).mockClear();
	});

	it("cache-busts the unhashed TradingView entry with the application build commit", async () => {
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
