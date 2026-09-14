import type { QueryClient } from "@tanstack/react-query";
import { preloadAppRuntimeOverlays } from "@/components/app-runtime-overlays";
import { startMarketCatalogBootstrap } from "@/lib/hyperliquid/markets/market-catalog-bootstrap";

/**
 * Runs when a trade entry route matches, during router hydration: the market catalog requests start
 * and every lazy piece of the first terminal render resolves before the page renders. React
 * throttles the reveal of content behind a Suspense fallback shown less than 300ms earlier, so a
 * boot render that suspends anywhere costs that much; resolved lazies render synchronously instead.
 */
export function bootTradeRoute(queryClient: QueryClient): void {
	startMarketCatalogBootstrap(queryClient);
	preloadAppRuntimeOverlays();
	void import("@/components/trade/trade-terminal-page")
		.then((module) => module.preloadTradeTerminalSurface())
		.catch(() => {});
}
