import type { SubscriptionStatus } from "@/lib/hyperliquid";
import { useSubscription } from "@/lib/hyperliquid";
import { type Numeric, toBig } from "@/lib/trade/numbers";

interface BboPrices {
	bestAsk: string | undefined;
	bestBid: string | undefined;
	midPx: string | undefined;
}

interface OrderbookMidPriceResult extends BboPrices {
	isStale: boolean;
	status: SubscriptionStatus;
}

type BboSides = readonly [{ px: string } | null | undefined, { px: string } | null | undefined];
const BBO_UI_THROTTLE_MS = 50;

function getPositivePrice(value: string | undefined): string | undefined {
	const price = toBig(value);
	return price?.gt(0) ? value : undefined;
}

export function getBboPrices(bbo: BboSides | undefined): BboPrices {
	const bestBid = getPositivePrice(bbo?.[0]?.px);
	const bestAsk = getPositivePrice(bbo?.[1]?.px);
	const bid = toBig(bestBid);
	const ask = toBig(bestAsk);
	if (bid && ask && ask.lt(bid)) {
		return { bestAsk: undefined, bestBid: undefined, midPx: undefined };
	}
	const midPx = bid && ask ? bid.plus(ask).div(2).toString() : undefined;

	return { bestAsk, bestBid, midPx };
}

export function getMidReferencePrice(midPx: string | undefined, markPx: Numeric): Numeric {
	return midPx ?? markPx;
}

export function useOrderbookMidPrice(coin: string | undefined): OrderbookMidPriceResult {
	const {
		data: event,
		isStale,
		status,
	} = useSubscription("bbo", { coin: coin ?? "" }, { enabled: !!coin, throttleMs: BBO_UI_THROTTLE_MS });
	const prices = getBboPrices(status === "active" && !isStale && event && event.coin === coin ? event.bbo : undefined);

	return { ...prices, isStale, status };
}
