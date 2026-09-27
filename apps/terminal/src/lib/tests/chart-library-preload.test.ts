import { describe, expect, it } from "vitest";
import { APP_BUILD_COMMIT, APP_CHART_LIBRARY_HASH } from "@/config/app";
import { createBuildMeta } from "@/config/build-meta";
import {
	CHART_LIBRARY_PATH,
	createChartLibraryScriptUrl,
	createHashedChartLibraryEntryPath,
} from "@/config/chart-library";
import { MOBILE_BREAKPOINT_PX } from "@/config/layout";
import { TRADINGVIEW_SCRIPT_SRC } from "@/lib/chart/load-tradingview";
import { DESKTOP_MEDIA_QUERY, DESKTOP_MIN_WIDTH_PX } from "../../../../../scripts/inject-shell-preloads.mjs";

describe("chart library preload contract", () => {
	it("builds one loader url for the runtime and the build metadata", () => {
		expect(createChartLibraryScriptUrl("abc/123")).toBe(`${CHART_LIBRARY_PATH}charting_library.js?v=abc%2F123`);
		expect(TRADINGVIEW_SCRIPT_SRC).toBe(createChartLibraryScriptUrl(APP_CHART_LIBRARY_HASH || APP_BUILD_COMMIT));
		const meta = createBuildMeta({
			version: "1.0.0",
			commit: APP_BUILD_COMMIT,
			release: "r",
			builtAt: "2026-09-13T00:00:00.000Z",
			pairing: { enabled: false },
			cctpDeposits: { mainnetSponsoredWallet: false, testnetExternalWallet: false, testnetSponsoredWallet: false },
			chartLibraryHash: APP_CHART_LIBRARY_HASH,
		});
		expect(meta.chartLibraryScript).toBe(TRADINGVIEW_SCRIPT_SRC);
	});

	it("names the production loader by its content hash instead of a cache-busting query", () => {
		expect(createHashedChartLibraryEntryPath("0123456789abcdef")).toBe(
			"charting_library/charting_library.0123456789abcdef.js",
		);
		expect(createChartLibraryScriptUrl("0123456789abcdef")).toBe(
			"/charting_library/charting_library.0123456789abcdef.js",
		);
		expect(createChartLibraryScriptUrl("0123456789ABCDEF")).toBe(
			`${CHART_LIBRARY_PATH}charting_library.js?v=0123456789ABCDEF`,
		);
		expect(createChartLibraryScriptUrl("0123456789abcde")).toBe(
			`${CHART_LIBRARY_PATH}charting_library.js?v=0123456789abcde`,
		);
		const meta = createBuildMeta({
			version: "1.0.0",
			commit: "abc123",
			release: "r",
			builtAt: "2026-09-13T00:00:00.000Z",
			pairing: { enabled: false },
			cctpDeposits: { mainnetSponsoredWallet: false, testnetExternalWallet: false, testnetSponsoredWallet: false },
			chartLibraryHash: "0123456789abcdef",
		});
		expect(meta.chartLibraryScript).toBe("/charting_library/charting_library.0123456789abcdef.js");
	});

	it("only preloads the chart where the desktop layout mounts it", () => {
		expect(DESKTOP_MIN_WIDTH_PX).toBe(MOBILE_BREAKPOINT_PX + 1);
		expect(DESKTOP_MEDIA_QUERY).toBe(`(min-width: ${MOBILE_BREAKPOINT_PX + 1}px)`);
	});
});
