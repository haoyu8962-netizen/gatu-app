import { useEffect, useRef } from "react";
import { SEO_DEFAULTS } from "@/config/seo";
import { useNumberFormat } from "@/lib/format";
import { getMarketApiCoin, getSpotMarketApiCoin, useSelectedMarketInfo, useSubscription } from "@/lib/hyperliquid";
import { buildMarketDocumentTitle } from "@/lib/seo";

export function TabTitleSync() {
	useDocumentTitle();
	return null;
}

export function useDocumentTitle() {
	const lastWrittenTitleRef = useRef<string | null>(null);
	const { formatPrice } = useNumberFormat();
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
		const price = formatPrice(markPx, { szDecimals, marketType: isSpot ? "spot" : "perp", style: "decimal" });
		const title = buildMarketDocumentTitle(price, pairName);
		document.title = title;
		lastWrittenTitleRef.current = title;
	}, [formatPrice, isSpot, markPx, pairName, szDecimals]);

	useEffect(() => {
		return () => {
			if (lastWrittenTitleRef.current !== null && document.title === lastWrittenTitleRef.current) {
				document.title = SEO_DEFAULTS.defaultTitle;
			}
			lastWrittenTitleRef.current = null;
		};
	}, []);
}
