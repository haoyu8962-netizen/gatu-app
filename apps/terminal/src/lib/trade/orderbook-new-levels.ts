import { toBig } from "@/lib/trade/numbers";

export type OrderbookPulseSide = "bid" | "ask";

export interface OrderbookPulseSnapshot {
	readonly levels: readonly [readonly { readonly px: string }[], readonly { readonly px: string }[]];
}

export interface OrderbookPriceSets {
	readonly bid: ReadonlySet<string>;
	readonly ask: ReadonlySet<string>;
}

export interface OrderbookVisibleLevel {
	readonly side: OrderbookPulseSide;
	readonly price: string;
}

export function getOrderbookPriceKey(price: string): string | null {
	const value = toBig(price);
	return value?.gt(0) ? value.toString() : null;
}

export function getOrderbookLevelKey(side: OrderbookPulseSide, price: string): string | null {
	const priceKey = getOrderbookPriceKey(price);
	return priceKey === null ? null : `${side}:${priceKey}`;
}

export function collectOrderbookPrices(snapshot: OrderbookPulseSnapshot): OrderbookPriceSets {
	return {
		bid: collectSidePrices(snapshot.levels[0]),
		ask: collectSidePrices(snapshot.levels[1]),
	};
}

export function findNewOrderbookPrices(
	previous: OrderbookPriceSets | undefined,
	current: OrderbookPriceSets,
): OrderbookPriceSets {
	return {
		bid: findNewSidePrices(previous?.bid, current.bid),
		ask: findNewSidePrices(previous?.ask, current.ask),
	};
}

function collectSidePrices(levels: readonly { readonly px: string }[]): ReadonlySet<string> {
	const prices = new Set<string>();
	for (const level of levels) {
		const price = getOrderbookPriceKey(level.px);
		if (price !== null) prices.add(price);
	}
	return prices;
}

function findNewSidePrices(
	previous: ReadonlySet<string> | undefined,
	current: ReadonlySet<string>,
): ReadonlySet<string> {
	const added = new Set<string>();
	if (!previous?.size) return added;
	for (const price of current) {
		if (!previous.has(price)) added.add(price);
	}
	return added;
}
