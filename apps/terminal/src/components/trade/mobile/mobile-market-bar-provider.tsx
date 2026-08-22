import { createContext, type ReactNode, useContext } from "react";
import {
	isLiveMarkPriceReady,
	LIVE_MARK_MAX_STALE_MS,
	type MarketHeadlinePriceSource,
	resolveActiveMarketPrice,
	selectMarketHeadlinePrice,
} from "@/domain/trade/market-price";
import {
	type MarketPriceDirection,
	type MarketPriceFlash,
	useMarketPriceFlash,
} from "@/hooks/trade/use-market-price-flash";
import { useOrderbookMidPrice } from "@/hooks/trade/use-orderbook-mid-price";
import {
	getMarketApiCoin,
	getSpotMarketApiCoin,
	type SubParams,
	type UnifiedMarketInfo,
	useHyperliquid,
	useSelectedMarketInfo,
	useSubscription,
} from "@/lib/hyperliquid";

export type MobileMarketPriceSource = MarketHeadlinePriceSource;
export type MobileMarketPriceDirection = MarketPriceDirection;
export type MobileMarketPriceFlash = MarketPriceFlash;
export { selectMarketHeadlinePrice as selectMobileMarketPrice } from "@/domain/trade/market-price";

interface MobileMarketBarSnapshot {
	market: UnifiedMarketInfo | undefined;
	displayPrice: MarketValue;
	priceSource: MobileMarketPriceSource;
	priceFlash: MobileMarketPriceFlash;
	prevDayPx: MarketValue;
	marketMarkPx: MarketValue;
	oraclePx: MarketValue;
	dayNtlVlm: MarketValue;
	openInterest: MarketValue;
	funding: MarketValue;
	spotMarkPx: MarketValue;
	spotCirculatingSupply: string | number | null | undefined;
}

interface Props {
	children: ReactNode;
	enabled: boolean;
}

type AllMidsParams = SubParams<"allMids">;
type MarketValue = string | number | null | undefined;

const MobileMarketBarContext = createContext<MobileMarketBarSnapshot | null>(null);

export function MobileMarketBarProvider({ children, enabled }: Props) {
	const { env } = useHyperliquid();
	const { data: market } = useSelectedMarketInfo();
	const isSpot = market?.kind === "spot";
	const perpCoin = getMarketApiCoin(market);
	const spotCoin = getSpotMarketApiCoin(market);
	const midsCoin = getMarketApiCoin(market);
	const { midPx, snapshot: bboSnapshot } = useOrderbookMidPrice(enabled ? market?.name : undefined);
	const {
		data: allMidsEvent,
		isStale: allMidsIsStale,
		lastMessageAt: allMidsReceivedAt,
		status: allMidsStatus,
	} = useSubscription("allMids", getAllMidsParams(market), {
		enabled: enabled && !!midsCoin,
		maxStaleMs: LIVE_MARK_MAX_STALE_MS,
	});
	const {
		data: perpCtxEvent,
		isStale: perpCtxIsStale,
		lastMessageAt: perpCtxReceivedAt,
		status: perpCtxStatus,
	} = useSubscription("activeAssetCtx", { coin: perpCoin }, { enabled: enabled && !!perpCoin && !isSpot });
	const {
		data: spotCtxEvent,
		isStale: spotCtxIsStale,
		lastMessageAt: spotCtxReceivedAt,
		status: spotCtxStatus,
	} = useSubscription("activeSpotAssetCtx", { coin: spotCoin }, { enabled: enabled && !!spotCoin && isSpot });

	const allMidsCandidate = midsCoin ? allMidsEvent?.mids?.[midsCoin] : undefined;
	const allMidsPrice = isLiveMarkPriceReady(
		allMidsStatus === "active" && !allMidsIsStale ? "success" : allMidsStatus === "error" ? "error" : "loading",
		allMidsCandidate,
		allMidsReceivedAt,
	)
		? allMidsCandidate
		: undefined;
	const perpPrice = resolveActiveMarketPrice({
		coin: perpCoin,
		enabled: enabled && !!perpCoin && !isSpot,
		data: perpCtxEvent,
		subscriptionStatus: perpCtxStatus,
		isStale: perpCtxIsStale,
		lastMessageAt: perpCtxReceivedAt,
	});
	const spotPrice = resolveActiveMarketPrice({
		coin: spotCoin,
		enabled: enabled && !!spotCoin && isSpot,
		data: spotCtxEvent,
		subscriptionStatus: spotCtxStatus,
		isStale: spotCtxIsStale,
		lastMessageAt: spotCtxReceivedAt,
	});
	const perpCtx =
		!isSpot && isLiveMarkPriceReady(perpPrice.status, perpPrice.markPx, perpPrice.receivedAt)
			? perpCtxEvent?.ctx
			: undefined;
	const spotCtx =
		isSpot && isLiveMarkPriceReady(spotPrice.status, spotPrice.markPx, spotPrice.receivedAt)
			? spotCtxEvent?.ctx
			: undefined;
	const liveCtx = isSpot ? spotCtx : perpCtx;
	const priceSample = selectMarketHeadlinePrice({
		bboMidPx: midPx,
		allMidsPrice,
		assetCtxMidPx: liveCtx?.midPx,
	});
	const priceReceipt =
		priceSample.source === "bbo"
			? bboSnapshot
			: priceSample.source === "allMids"
				? allMidsEvent
				: priceSample.source === "assetCtxMid"
					? isSpot
						? spotCtxEvent
						: perpCtxEvent
					: undefined;
	const marketDex = market?.kind === "builderPerp" ? market.dex : isSpot ? "spot" : "perp";
	const priceFlash = useMarketPriceFlash({
		enabled,
		identity: `${env}:${marketDex}:${market?.name ?? ""}`,
		receipt: priceReceipt,
		source: priceSample.source,
		value: priceSample.value,
	});

	const selectedLiveMark = isLiveMarkPriceReady(
		market?.markPriceStatus ?? "loading",
		market?.markPx,
		market?.markPriceReceivedAt,
	)
		? market?.markPx
		: undefined;
	const marketMarkPx = liveCtx?.markPx ?? selectedLiveMark;
	const snapshot: MobileMarketBarSnapshot = {
		market,
		displayPrice: priceSample.value,
		priceSource: priceSample.source,
		priceFlash,
		prevDayPx: liveCtx?.prevDayPx,
		marketMarkPx,
		oraclePx: perpCtx?.oraclePx,
		dayNtlVlm: liveCtx?.dayNtlVlm,
		openInterest: perpCtx?.openInterest,
		funding: perpCtx?.funding,
		spotMarkPx: isSpot ? (spotCtx?.markPx ?? selectedLiveMark) : undefined,
		spotCirculatingSupply: isSpot ? spotCtx?.circulatingSupply : null,
	};

	return <MobileMarketBarContext value={snapshot}>{children}</MobileMarketBarContext>;
}

export function useMobileMarketBarSnapshot(): MobileMarketBarSnapshot {
	const snapshot = useContext(MobileMarketBarContext);
	if (!snapshot) throw new Error("MobileMarketBar must be rendered inside MobileMarketBarProvider");
	return snapshot;
}

function getAllMidsParams(market: UnifiedMarketInfo | undefined): AllMidsParams {
	if (market?.kind !== "builderPerp") return undefined;
	return { dex: market.dex };
}
