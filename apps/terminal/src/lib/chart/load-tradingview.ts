import { CHART_LIBRARY_PATH } from "@/config/chart";
import { SCRIPT_LOAD_TIMEOUT_MS } from "@/config/time";
import { loadScript } from "@/lib/load-script";

export const TRADINGVIEW_SCRIPT_SRC = `${CHART_LIBRARY_PATH}charting_library.js`;

export function loadTradingViewScript(): Promise<void> {
	return loadScript(TRADINGVIEW_SCRIPT_SRC, {
		timeoutMs: SCRIPT_LOAD_TIMEOUT_MS,
		isReady: () => typeof window !== "undefined" && Boolean(window.TradingView),
	});
}
