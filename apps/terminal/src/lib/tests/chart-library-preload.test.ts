import { describe, expect, it } from "vitest";
import { APP_BUILD_COMMIT } from "@/config/app";
import { createBuildMeta } from "@/config/build-meta";
import { CHART_LIBRARY_PATH, createChartLibraryScriptUrl } from "@/config/chart-library";
import { MOBILE_BREAKPOINT_PX } from "@/config/layout";
import { TRADINGVIEW_SCRIPT_SRC } from "@/lib/chart/load-tradingview";
import { DESKTOP_MEDIA_QUERY, DESKTOP_MIN_WIDTH_PX } from "../../../../../scripts/inject-shell-preloads.mjs";

describe("chart library preload contract", () => {
	it("builds one loader url for the runtime and the build metadata", () => {
		expect(createChartLibraryScriptUrl("abc/123")).toBe(`${CHART_LIBRARY_PATH}charting_library.js?v=abc%2F123`);
		expect(TRADINGVIEW_SCRIPT_SRC).toBe(createChartLibraryScriptUrl(APP_BUILD_COMMIT));
		const meta = createBuildMeta({
			version: "1.0.0",
			commit: APP_BUILD_COMMIT,
			release: "r",
			builtAt: "2026-09-13T00:00:00.000Z",
			ticketApiVersion: 2,
			pairing: { createAndReveal: false, importFromQr: false },
		});
		expect(meta.chartLibraryScript).toBe(TRADINGVIEW_SCRIPT_SRC);
	});

	it("only preloads the chart where the desktop layout mounts it", () => {
		expect(DESKTOP_MIN_WIDTH_PX).toBe(MOBILE_BREAKPOINT_PX + 1);
		expect(DESKTOP_MEDIA_QUERY).toBe(`(min-width: ${MOBILE_BREAKPOINT_PX + 1}px)`);
	});
});
