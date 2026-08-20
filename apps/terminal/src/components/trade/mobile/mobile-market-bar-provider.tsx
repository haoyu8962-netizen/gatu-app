import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { isLiveMarkPriceReady, LIVE_MARK_MAX_STALE_MS, resolveActiveMarketPrice } from "@/domain/trade/market-price";
import { useOrderbookMidPrice } from "@/hooks/trade/use-orderbook-mid-price";
import {
	getMarketApiCoin,
	getSpotMarketApiCoin,
	type SubParams,
	subscribeWsReconnect,
	type UnifiedMarketInfo,
	useHyperliquid,
	useSelectedMarketInfo,
	useSubscription,
} from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";

export type MobileMarketPriceSource = "bbo" | "allMids" | "assetCtxMid" | null;
export type MobileMarketPriceDirection = "up" | "down";

export interface MobileMarketPriceFlash {
	sequence: number;
	direction: MobileMarketPriceDirection | null;
}

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

interface PriceSample {
	source: MobileMarketPriceSource;
	value: MarketValue;
}

interface PriceIdentity {
	generation: number;
	identity: string;
	priceKey: string | null;
	receipt: object | undefined;
	source: MobileMarketPriceSource;
}

interface PriceFlashEvent extends MobileMarketPriceFlash {
	identity: string;
	priceKey: string | null;
	source: MobileMarketPriceSource;
}

type AllMidsParams = SubParams<"allMids">;
type MarketValue = string | number | null | undefined;

const EMPTY_FLASH_EVENT: PriceFlashEvent = {
	sequence: 0,
	direction: null,
	identity: "",
	priceKey: null,
	source: null,
};

const MobileMarketBarContext = createContext<MobileMarketBarSnapshot | null>(null);

export function MobileMarketBarProvider({ children, enabled }: Props) {
	const { env } = useHyperliquid();
	const wsGeneration = useWsReconnectGeneration(enabled);
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
	const priceSample = selectMobileMarketPrice({
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
	const priceIdentity = `${env}:${marketDex}:${market?.name ?? ""}:${wsGeneration}`;
	const priceKey = toBig(priceSample.value)?.toString() ?? null;
	const [priceFlashEvent, setPriceFlashEvent] = useState<PriceFlashEvent>(EMPTY_FLASH_EVENT);
	const awaitingReconnectReceiptRef = useRef<{ generation: number; receipt: object | undefined } | null>(null);
	const previousPriceRef = useRef<PriceIdentity | null>(null);

	useEffect(() => {
		const current: PriceIdentity = {
			generation: wsGeneration,
			identity: priceIdentity,
			priceKey,
			receipt: priceReceipt,
			source: priceSample.source,
		};
		const previous = previousPriceRef.current;
		previousPriceRef.current = current;
		if (previous && previous.generation !== current.generation) {
			awaitingReconnectReceiptRef.current = {
				generation: current.generation,
				receipt: current.receipt,
			};
		}

		const awaitingReconnectReceipt = awaitingReconnectReceiptRef.current;
		if (awaitingReconnectReceipt?.generation === current.generation) {
			if (!Object.is(awaitingReconnectReceipt.receipt, current.receipt)) {
				awaitingReconnectReceiptRef.current = null;
			}
			setPriceFlashEvent((state) => createPriceFlashEvent(state, current, null));
			return;
		}

		if (
			!previous ||
			!current.priceKey ||
			!current.source ||
			previous.identity !== current.identity ||
			previous.source !== current.source ||
			!previous.priceKey
		) {
			setPriceFlashEvent((state) => createPriceFlashEvent(state, current, null));
			return;
		}

		const previousPrice = toBig(previous.priceKey);
		const currentPrice = toBig(current.priceKey);
		if (!previousPrice || !currentPrice || currentPrice.eq(previousPrice)) return;

		setPriceFlashEvent((state) =>
			createPriceFlashEvent(state, current, currentPrice.gt(previousPrice) ? "up" : "down"),
		);
	}, [priceIdentity, priceKey, priceReceipt, priceSample.source, wsGeneration]);

	const isCurrentFlashEvent =
		priceFlashEvent.identity === priceIdentity &&
		priceFlashEvent.source === priceSample.source &&
		priceFlashEvent.priceKey === priceKey;
	const priceFlash: MobileMarketPriceFlash = {
		sequence: priceFlashEvent.sequence,
		direction: isCurrentFlashEvent ? priceFlashEvent.direction : null,
	};

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

function createPriceFlashEvent(
	previous: PriceFlashEvent,
	current: PriceIdentity,
	direction: MobileMarketPriceDirection | null,
): PriceFlashEvent {
	return {
		sequence: previous.sequence + 1,
		direction,
		identity: current.identity,
		priceKey: current.priceKey,
		source: current.source,
	};
}

function useWsReconnectGeneration(enabled: boolean): number {
	const [generation, setGeneration] = useState(0);

	useEffect(() => {
		if (!enabled) return;
		return subscribeWsReconnect(() => setGeneration((value) => value + 1));
	}, [enabled]);

	return generation;
}

export function useMobileMarketBarSnapshot(): MobileMarketBarSnapshot {
	const snapshot = useContext(MobileMarketBarContext);
	if (!snapshot) throw new Error("MobileMarketBar must be rendered inside MobileMarketBarProvider");
	return snapshot;
}

export function selectMobileMarketPrice({
	bboMidPx,
	allMidsPrice,
	assetCtxMidPx,
}: {
	bboMidPx: MarketValue;
	allMidsPrice: MarketValue;
	assetCtxMidPx: MarketValue;
}): PriceSample {
	if (isPositivePrice(bboMidPx)) return { source: "bbo", value: bboMidPx };
	if (isPositivePrice(allMidsPrice)) return { source: "allMids", value: allMidsPrice };
	if (isPositivePrice(assetCtxMidPx)) return { source: "assetCtxMid", value: assetCtxMidPx };
	return { source: null, value: undefined };
}

function isPositivePrice(value: MarketValue): boolean {
	return toBig(value)?.gt(0) === true;
}

function getAllMidsParams(market: UnifiedMarketInfo | undefined): AllMidsParams {
	if (market?.kind !== "builderPerp") return undefined;
	return { dex: market.dex };
}
