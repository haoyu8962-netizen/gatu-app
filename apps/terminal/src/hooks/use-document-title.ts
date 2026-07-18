import { useEffect } from "react";
import { SEO_DEFAULTS } from "@/config/seo";
import { formatPrice } from "@/lib/format";
import { getMarketApiCoin, getSpotMarketApiCoin, useSelectedMarketInfo, useSubscription } from "@/lib/hyperliquid";

export function TabTitleSync() {
	useDocumentTitle();
	return null;
}

export function useDocumentTitle() {
	const { data: market } = useSelectedMarketInfo();

	const isSpot = market?.kind === "spot";
	const perpCoin = getMarketApiCoin(market);
	const spotCoin = getSpotMarketApiCoin(market);

	const { data: perpCtxEvent } = useSubscription(
		"activeAssetCtx",
		{ coin: perpCoin },
		{ enabled: !!perpCoin && !isSpot, pauseWhenHidden: false },
	);
	const { data: spotCtxEvent } = useSubscription(
		"activeSpotAssetCtx",
		{ coin: spotCoin },
		{ enabled: !!spotCoin && isSpot, pauseWhenHidden: false },
	);

	const markPx = isSpot ? spotCtxEvent?.ctx?.markPx : perpCtxEvent?.ctx?.markPx;
	const pairName = market?.pairName;
	const szDecimals = market?.szDecimals;

	useEffect(() => {
		if (!markPx || !pairName) return;
		const price = formatPrice(markPx, { szDecimals, marketType: isSpot ? "spot" : "perp" });
		document.title = `${price} · ${pairName} | gatu`;
	}, [isSpot, markPx, pairName, szDecimals]);

	useEffect(() => {
		return () => {
			document.title = SEO_DEFAULTS.defaultTitle;
		};
	}, []);
}
