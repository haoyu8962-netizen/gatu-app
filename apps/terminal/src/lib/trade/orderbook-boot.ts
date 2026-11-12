import { warmL2BookSubscription } from "@sairn/hl-react";
import { MOBILE_MEDIA_QUERY } from "@/hooks/use-mobile";
import { getTradeRouteMarketFromPath, isSafeTradeRouteMarketName } from "@/lib/hyperliquid/market-route";
import { isTestnet } from "@/lib/network";
import { getStoredSelectedMarket } from "@/stores/use-market-store";

let releaseWarmOrderbook: (() => void) | undefined;

/**
 * Perp, builder-perp and `@index` spot names are the API coin itself; a spot pair name such as
 * `PURR/USDC` or a `0x` token-ID address needs the market catalog to resolve, so its stream starts
 * with the panel as before.
 */
function isApiCoin(marketName: string): boolean {
	return !marketName.includes("/") && !marketName.startsWith("0x");
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
 * in its first data commit instead of waiting for a new socket and a subscribe round trip. The phone
 * layout opens on the order form, whose compact book reads the incremental `l2` feed or the fast
 * stream, so a full-depth connection there would only hold one of the ten an address may open.
 */
export function bootOrderbook(pathname: string): void {
	if (typeof window === "undefined" || window.matchMedia?.(MOBILE_MEDIA_QUERY).matches) return;
	const coin = getBootOrderbookCoin(pathname);
	if (!coin) return;
	releaseWarmOrderbook?.();
	releaseWarmOrderbook = undefined;
	try {
		releaseWarmOrderbook = warmL2BookSubscription(isTestnet(), { coin });
	} catch {}
}
