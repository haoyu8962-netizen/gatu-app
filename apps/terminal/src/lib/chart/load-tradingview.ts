import { APP_BUILD_COMMIT, APP_CHART_LIBRARY_HASH } from "@/config/app";
import { createChartLibraryScriptUrl } from "@/config/chart-library";
import { SCRIPT_LOAD_TIMEOUT_MS } from "@/config/time";
import { loadScript } from "@/lib/load-script";

export const TRADINGVIEW_SCRIPT_SRC = createChartLibraryScriptUrl(APP_CHART_LIBRARY_HASH || APP_BUILD_COMMIT);

export function loadTradingViewScript(): Promise<void> {
	return loadScript(TRADINGVIEW_SCRIPT_SRC, {
		timeoutMs: SCRIPT_LOAD_TIMEOUT_MS,
		isReady: () => typeof window !== "undefined" && Boolean(window.TradingView),
	});
}
