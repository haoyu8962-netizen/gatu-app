import { warmL2BookSubscription } from "@gatu/hl-react";
import { getTradeRouteMarketFromPath, isSafeTradeRouteMarketName } from "@/lib/hyperliquid/market-route";
import { isTestnet } from "@/lib/network";
import { getStoredSelectedMarket } from "@/stores/use-market-store";

let releaseWarmOrderbook: (() => void) | undefined;

/**
 * Perp, builder-perp and `@index` spot names are the API coin itself; a spot pair name such as
 * `PURR/USDC` needs the market catalog to resolve, so its stream starts with the panel as before.
 */
function isApiCoin(marketName: string): boolean {
	return !marketName.includes("/");
}

export function getBootOrderbookCoin(pathname: string): string | undefined {
	const routeMarket = getTradeRouteMarketFromPath(pathname);
	if (routeMarket) return isApiCoin(routeMarket.name) ? routeMarket.name : undefined;
	const [section, dex] = pathname.split("/").filter(Boolean);
	if (section !== "perp" && section !== "builders-perp") return undefined;
	const stored = getStoredSelectedMarket(section);
	if (!isSafeTradeRouteMarketName(stored) || !isApiCoin(stored)) return undefined;
	if (section === "builders-perp" && dex && stored.split(":")[0] !== dex) return undefined;
	return stored;
}

/**
 * Opens the pooled order-book stream for the market a trade route names while the catalog loads.
 * The panel that mounts later joins the confirmed subscription and renders the freshest snapshot
 * in its first data commit instead of waiting for a new socket and a subscribe round trip.
 */
export function bootOrderbook(pathname: string): void {
	if (typeof window === "undefined") return;
	const coin = getBootOrderbookCoin(pathname);
	if (!coin) return;
	releaseWarmOrderbook?.();
	releaseWarmOrderbook = undefined;
	try {
		releaseWarmOrderbook = warmL2BookSubscription(isTestnet(), { coin });
	} catch {}
}
