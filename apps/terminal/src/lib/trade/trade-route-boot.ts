import type { QueryClient } from "@tanstack/react-query";
import { preloadAppRuntimeOverlays } from "@/components/app-runtime-overlays";
import { startMarketCatalogBootstrap } from "@/lib/hyperliquid/markets/market-catalog-bootstrap";
import { bootOrderbook } from "@/lib/trade/orderbook-boot";

export const TRADE_ROUTE_REVEAL_BUDGET_MS = 1500;

/**
 * Runs when a trade entry route matches, during router hydration. The market catalog requests and
 * the order-book stream of the route market start immediately and are never awaited. The returned
 * promise settles once every lazy piece of the first terminal render has resolved, or after the
 * reveal budget: the route's `beforeLoad` awaits it so the router only reveals the page when the
 * retry render can commit without suspending again. A lazy that still suspends would otherwise be
 * revealed by React only 300ms after the fallback it showed during hydration (ADR 0012).
 */
export function bootTradeRoute(queryClient: QueryClient, pathname: string): Promise<void> {
	startMarketCatalogBootstrap(queryClient);
	bootOrderbook(pathname);
	const surface = import("@/components/trade/preload-trade-terminal-surface").then((module) =>
		module.preloadTradeTerminalSurface(),
	);
	const preloads = Promise.all([preloadAppRuntimeOverlays(), surface]).then(
		() => undefined,
		() => undefined,
	);
	return settleWithinBudget(preloads, TRADE_ROUTE_REVEAL_BUDGET_MS);
}

function settleWithinBudget(preloads: Promise<void>, budgetMs: number): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, budgetMs);
		preloads.finally(() => {
			clearTimeout(timer);
			resolve();
		});
	});
}
