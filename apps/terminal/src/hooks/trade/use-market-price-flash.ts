import { useEffect, useRef, useState } from "react";
import { subscribeWsReconnect } from "@/lib/hyperliquid";
import { type Numeric, toBig } from "@/lib/trade/numbers";

export type MarketPriceDirection = "up" | "down";

export interface MarketPriceFlash {
	sequence: number;
	direction: MarketPriceDirection | null;
}

interface MarketPriceFlashOptions {
	enabled: boolean;
	identity: string;
	receipt: object | undefined;
	source: string | null;
	value: Numeric;
}

interface PriceIdentity {
	generation: number;
	identity: string;
	priceKey: string | null;
	receipt: object | undefined;
	source: string | null;
}

interface PriceFlashEvent extends MarketPriceFlash {
	identity: string;
	priceKey: string | null;
	source: string | null;
}

const EMPTY_FLASH_EVENT: PriceFlashEvent = {
	sequence: 0,
	direction: null,
	identity: "",
	priceKey: null,
	source: null,
};

export function useMarketPriceFlash({
	enabled,
	identity,
	receipt,
	source,
	value,
}: MarketPriceFlashOptions): MarketPriceFlash {
	const wsGeneration = useWsReconnectGeneration(enabled);
	const priceKey = toBig(value)?.toString() ?? null;
	const flashIdentity = `${identity}:${wsGeneration}`;
	const [event, setEvent] = useState<PriceFlashEvent>(EMPTY_FLASH_EVENT);
	const awaitingReconnectReceiptRef = useRef<{ generation: number; receipt: object | undefined } | null>(null);
	const previousPriceRef = useRef<PriceIdentity | null>(null);

	useEffect(() => {
		const current: PriceIdentity = {
			generation: wsGeneration,
			identity: flashIdentity,
			priceKey,
			receipt,
			source,
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
			setEvent((state) => createPriceFlashEvent(state, current, null));
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
			setEvent((state) => createPriceFlashEvent(state, current, null));
			return;
		}

		const previousPrice = toBig(previous.priceKey);
		const currentPrice = toBig(current.priceKey);
		if (!previousPrice || !currentPrice || currentPrice.eq(previousPrice)) return;

		setEvent((state) => createPriceFlashEvent(state, current, currentPrice.gt(previousPrice) ? "up" : "down"));
	}, [flashIdentity, priceKey, receipt, source, wsGeneration]);

	const isCurrentEvent = event.identity === flashIdentity && event.source === source && event.priceKey === priceKey;

	return {
		sequence: event.sequence,
		direction: isCurrentEvent ? event.direction : null,
	};
}

function createPriceFlashEvent(
	previous: PriceFlashEvent,
	current: PriceIdentity,
	direction: MarketPriceDirection | null,
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
