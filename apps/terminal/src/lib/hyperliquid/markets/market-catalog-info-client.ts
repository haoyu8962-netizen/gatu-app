import { HttpTransport } from "@nktkas/hyperliquid";
import { allPerpMetas, perpDexs, spotMeta } from "@nktkas/hyperliquid/api/info";
import type { MarketCatalogInfoClient } from "./market-catalog-query";

const clients = new Map<boolean, MarketCatalogInfoClient>();

export function getMarketCatalogInfoClient(isTestnet: boolean): MarketCatalogInfoClient {
	const cached = clients.get(isTestnet);
	if (cached) return cached;

	const transport = new HttpTransport({ isTestnet });
	const client: MarketCatalogInfoClient = {
		allPerpMetas: (signal) => allPerpMetas({ transport }, signal),
		perpDexs: (signal) => perpDexs({ transport }, signal),
		spotMeta: (signal) => spotMeta({ transport }, signal),
	};
	clients.set(isTestnet, client);
	return client;
}
