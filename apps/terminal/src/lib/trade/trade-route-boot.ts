import type { QueryClient } from "@tanstack/react-query";
import { preloadAppRuntimeOverlays } from "@/components/app-runtime-overlays";
import { startMarketCatalogBootstrap } from "@/lib/hyperliquid/markets/market-catalog-bootstrap";
import { bootOrderbook } from "@/lib/trade/orderbook-boot";

/**
 * Runs when a trade entry route matches, during router hydration: the market catalog requests and
 * the order-book stream of the route market start, and every lazy piece of the first terminal
 * render starts resolving. Nothing is awaited: the chunks are already in the shell's preload list,
 * so they normally resolve before the catalog answers, and a lazy that resolved renders
 * synchronously. A lazy still pending at that moment suspends as before, which React then reveals
 * only 300ms after the fallback it showed during hydration.
 */
export function bootTradeRoute(queryClient: QueryClient, pathname: string): void {
	startMarketCatalogBootstrap(queryClient);
	bootOrderbook(pathname);
	preloadAppRuntimeOverlays();
	void import("@/components/trade/preload-trade-terminal-surface")
		.then((module) => module.preloadTradeTerminalSurface())
		.catch(() => {});
}
