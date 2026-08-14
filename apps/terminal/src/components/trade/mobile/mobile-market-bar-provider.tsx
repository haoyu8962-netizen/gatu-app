import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { useOrderbookMidPrice } from "@/hooks/trade/use-orderbook-mid-price";
import {
	getMarketApiCoin,
	getSpotMarketApiCoin,
	type SpotMarketInfo,
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
		status: allMidsStatus,
	} = useSubscription("allMids", getAllMidsParams(market), { enabled: enabled && !!midsCoin });
	const {
		data: perpCtxEvent,
		isStale: perpCtxIsStale,
		status: perpCtxStatus,
	} = useSubscription("activeAssetCtx", { coin: perpCoin }, { enabled: enabled && !!perpCoin && !isSpot });
	const {
		data: spotCtxEvent,
		isStale: spotCtxIsStale,
		status: spotCtxStatus,
	} = useSubscription("activeSpotAssetCtx", { coin: spotCoin }, { enabled: enabled && !!spotCoin && isSpot });

	const allMidsPrice =
		allMidsStatus === "active" && !allMidsIsStale && midsCoin ? allMidsEvent?.mids?.[midsCoin] : undefined;
	const perpCtx = !isSpot && perpCtxStatus === "active" && !perpCtxIsStale ? perpCtxEvent?.ctx : undefined;
	const spotCtx = isSpot && spotCtxStatus === "active" && !spotCtxIsStale ? spotCtxEvent?.ctx : undefined;
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

	const marketMarkPx = liveCtx?.markPx ?? market?.markPx;
	const snapshot: MobileMarketBarSnapshot = {
		market,
		displayPrice: priceSample.value,
		priceSource: priceSample.source,
		priceFlash,
		prevDayPx: liveCtx?.prevDayPx ?? market?.prevDayPx,
		marketMarkPx,
		oraclePx: perpCtx?.oraclePx ?? market?.oraclePx,
		dayNtlVlm: liveCtx?.dayNtlVlm ?? market?.dayNtlVlm,
		openInterest: perpCtx?.openInterest ?? market?.openInterest,
		funding: perpCtx?.funding ?? market?.funding,
		spotMarkPx: isSpot ? (spotCtx?.markPx ?? market?.markPx) : undefined,
		spotCirculatingSupply: isSpot ? (spotCtx?.circulatingSupply ?? getSpotCirculatingSupply(market)) : null,
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

function getSpotCirculatingSupply(market: UnifiedMarketInfo | undefined): string | number | null | undefined {
	if (market?.kind !== "spot") return null;
	return (market as SpotMarketInfo).circulatingSupply;
}
