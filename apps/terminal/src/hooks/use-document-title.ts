import { useEffect } from "react";
import { SEO_DEFAULTS } from "@/config/seo";
import { formatPrice } from "@/lib/format";
import { type SpotMarketInfo, useSelectedMarketInfo, useSubscription } from "@/lib/hyperliquid";

function getSpotSubscriptionCoin(market: ReturnType<typeof useSelectedMarketInfo>["data"]): string {
	if (market?.kind !== "spot") return "";
	return `@${(market as SpotMarketInfo).index}`;
}

export function TabTitleSync() {
	useDocumentTitle();
	return null;
}

export function useDocumentTitle() {
	const { data: market } = useSelectedMarketInfo();

	const isSpot = market?.kind === "spot";
	const perpCoin = market?.name ?? "";
	const spotCoin = getSpotSubscriptionCoin(market);

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

		const price = formatPrice(markPx, { szDecimals });
		document.title = `${price} · ${pairName} | HypeTerminal`;

		return () => {
			document.title = SEO_DEFAULTS.defaultTitle;
		};
	}, [markPx, pairName, szDecimals]);
}
