import { useEffect } from "react";
import { SEO_DEFAULTS } from "@/config/seo";
import { formatPrice } from "@/lib/format";
import { getMarketApiCoin, getSpotMarketApiCoin, useSelectedMarketInfo, useSubscription } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { buildMarketDocumentTitle } from "@/lib/seo";

export function TabTitleSync() {
	useDocumentTitle();
	return null;
}

export function useDocumentTitle() {
	const numberFormatRevision = useNumberFormatRevision();
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
		void numberFormatRevision;
		if (!markPx || !pairName) return;
		const price = formatPrice(markPx, { szDecimals, marketType: isSpot ? "spot" : "perp", style: "decimal" });
		document.title = buildMarketDocumentTitle(price, pairName);
	}, [isSpot, markPx, numberFormatRevision, pairName, szDecimals]);

	useEffect(() => {
		return () => {
			document.title = SEO_DEFAULTS.defaultTitle;
		};
	}, []);
}
