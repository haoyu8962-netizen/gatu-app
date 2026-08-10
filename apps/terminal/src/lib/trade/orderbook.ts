import Big from "big.js";
import { toBig } from "@/lib/trade/numbers";

export type RawBookLevel = { px: string; sz: string; n: number };

export type BookLevel = {
	price: string;
	size: string;
	total: string;
	quoteSize: string;
	quoteTotal: string;
};

type L2BookNativePriceGroupSelection = {
	nSigFigs?: null;
	mantissa?: never;
};

type L2BookDecimalPriceGroupSelection = {
	nSigFigs: 2 | 3 | 4;
	mantissa?: never;
};

type L2BookMantissaPriceGroupSelection = {
	nSigFigs: 5;
	mantissa?: 2 | 5 | null;
};

export type L2BookPriceGroupSelection =
	| L2BookNativePriceGroupSelection
	| L2BookDecimalPriceGroupSelection
	| L2BookMantissaPriceGroupSelection;

type L2BookPriceGroupKeyInput = {
	nSigFigs?: 2 | 3 | 4 | 5 | null;
	mantissa?: 2 | 5 | null;
};

export type L2BookPriceGroupOption = L2BookPriceGroupSelection & {
	key: string;
	tickSize: number;
	decimals: number;
	label: string;
};

export type L2BookSubscriptionParams =
	| { coin: string; fast?: boolean; nSigFigs?: never; mantissa?: never }
	| { coin: string; fast?: boolean; nSigFigs: 2 | 3 | 4; mantissa?: never }
	| { coin: string; fast?: boolean; nSigFigs: 5; mantissa?: 2 | 5 };

export interface L2BookSubscriptionOptions {
	fast?: boolean;
}

type RawBookSides = readonly [readonly RawBookLevel[], readonly RawBookLevel[]];

export interface RawSpreadInfoOptions {
	bboMid?: string | null;
	eventSpread?: string | null;
}

export function processLevels(raw: readonly RawBookLevel[] | undefined, limit?: number): BookLevel[] {
	if (!raw?.length) return [];
	const levels = limit ? raw.slice(0, limit) : raw;
	let total = Big(0);
	let quoteTotal = Big(0);
	const processed: BookLevel[] = [];

	for (const { px, sz } of levels) {
		const price = toBig(px);
		const size = toBig(sz);
		if (!price || !size) continue;

		const quoteSize = price.times(size);
		total = total.plus(size);
		quoteTotal = quoteTotal.plus(quoteSize);
		processed.push({
			price: px,
			size: sz,
			total: total.toString(),
			quoteSize: quoteSize.toString(),
			quoteTotal: quoteTotal.toString(),
		});
	}

	return processed;
}

export function getRawSpreadInfo(levels: RawBookSides | undefined, options: RawSpreadInfoOptions = {}) {
	const bestBid = toBig(levels?.[0][0]?.px);
	const bestAsk = toBig(levels?.[1][0]?.px);
	const bboMid = toBig(options.bboMid);
	const eventSpread = toBig(options.eventSpread);
	const visibleBookIsValid = !!bestBid && !!bestAsk && bestBid.gt(0) && bestAsk.gt(0) && bestAsk.gte(bestBid);
	const mid = bboMid?.gt(0) ? bboMid : visibleBookIsValid ? bestAsk.plus(bestBid).div(2) : null;
	const spread = eventSpread?.gte(0) ? eventSpread : visibleBookIsValid ? bestAsk.minus(bestBid) : null;
	if (!mid || !spread) return null;

	return {
		mid: mid.toString(),
		spread: spread.toString(),
		spreadPct: spread.div(mid).times(100).toString(),
	};
}

export function getSideMaxTotal(levels: readonly BookLevel[]): string {
	return levels
		.reduce((max, level) => {
			const total = toBig(level.total);
			return total?.gt(max) ? total : max;
		}, Big(0))
		.toString();
}

export function getDepthPercentage(total: string, maxTotal: string): number {
	const totalValue = toBig(total);
	const maxValue = toBig(maxTotal);
	if (!totalValue || !maxValue || totalValue.lte(0) || maxValue.lte(0)) return 0;
	return Math.min(100, totalValue.div(maxValue).times(100).toNumber());
}

export function compareOrderbookValues(previous: string, current: string): -1 | 0 | 1 | null {
	const previousValue = toBig(previous);
	const currentValue = toBig(current);
	if (!previousValue || !currentValue) return null;
	return currentValue.cmp(previousValue) as -1 | 0 | 1;
}

export function getOrderbookQuoteDecimals(value: string): number {
	const quoteValue = toBig(value);
	if (!quoteValue || quoteValue.eq(0) || quoteValue.abs().gte("0.01")) return 2;
	const absoluteValue = quoteValue.abs();
	const significantDigits = Math.min(absoluteValue.c.length, 2);
	return Math.min(20, Math.max(2, -absoluteValue.e + significantDigits - 1));
}

export function getSnapshotPriceDecimals(levels: RawBookSides | undefined, fallbackDecimals: number): number {
	if (!levels) return fallbackDecimals;
	let decimals = fallbackDecimals;
	for (const side of levels) {
		for (const level of side) {
			const price = toBig(level.px);
			if (price) decimals = Math.max(decimals, getBigDecimalPlaces(price));
		}
	}
	return decimals;
}

export function getPriceGroupingOptions(mid: number | undefined, maxDecimals?: number): L2BookPriceGroupOption[] {
	if (!mid || !Number.isFinite(mid) || mid <= 0) {
		return [];
	}

	const integerDigits = Math.floor(Math.log10(mid)) + 1;
	const minimumTickSize =
		maxDecimals !== undefined && Number.isInteger(maxDecimals) && maxDecimals >= 0 ? 10 ** -maxDecimals : 0;
	const fiveSignificantFigureTick = Math.max(10 ** (integerDigits - 5), minimumTickSize);
	const nativeTickSize = integerDigits > 5 ? Math.max(1, minimumTickSize) : fiveSignificantFigureTick;
	const options = [
		buildPriceGroupingOption({ nSigFigs: null }, nativeTickSize),
		buildPriceGroupingOption({ nSigFigs: 5 }, fiveSignificantFigureTick),
		buildPriceGroupingOption({ nSigFigs: 5, mantissa: 2 }, Math.max(2 * 10 ** (integerDigits - 5), minimumTickSize)),
		buildPriceGroupingOption({ nSigFigs: 5, mantissa: 5 }, Math.max(5 * 10 ** (integerDigits - 5), minimumTickSize)),
		buildPriceGroupingOption({ nSigFigs: 4 }, Math.max(10 ** (integerDigits - 4), minimumTickSize)),
		buildPriceGroupingOption({ nSigFigs: 3 }, Math.max(10 ** (integerDigits - 3), minimumTickSize)),
		buildPriceGroupingOption({ nSigFigs: 2 }, Math.max(10 ** (integerDigits - 2), minimumTickSize)),
	].sort((a, b) => a.tickSize - b.tickSize);
	const seenTickSizes = new Set<number>();

	return options.filter((option) => {
		if (seenTickSizes.has(option.tickSize)) return false;
		seenTickSizes.add(option.tickSize);
		return true;
	});
}

export function getPriceGroupingKey(selection: L2BookPriceGroupKeyInput | null | undefined): string {
	if (selection?.nSigFigs == null) return "full";
	return `${selection.nSigFigs}:${selection.mantissa ?? "default"}`;
}

export function getL2BookSubscriptionParams(
	coin: string,
	selection: L2BookPriceGroupSelection | null | undefined,
	options: L2BookSubscriptionOptions = {},
): L2BookSubscriptionParams {
	if (selection?.nSigFigs == null) return { coin, ...options };
	if (selection.nSigFigs !== 5) {
		return { coin, ...options, nSigFigs: selection.nSigFigs };
	}
	return {
		coin,
		...options,
		nSigFigs: 5,
		...(selection.mantissa == null ? {} : { mantissa: selection.mantissa }),
	};
}

function getBigDecimalPlaces(value: Big): number {
	return Math.max(0, value.c.length - value.e - 1);
}

function buildPriceGroupingOption(selection: L2BookPriceGroupSelection, tickSize: number): L2BookPriceGroupOption {
	const decimals = getTickSizeDecimals(tickSize);
	return {
		...selection,
		key: getPriceGroupingKey(selection),
		tickSize,
		decimals,
		label: formatTickSize(tickSize, decimals),
	};
}

function getTickSizeDecimals(tickSize: number): number {
	if (tickSize >= 1) return 0;
	return Math.max(0, -Math.floor(Math.log10(tickSize)));
}

function formatTickSize(tickSize: number, decimals: number): string {
	if (decimals === 0) return String(Math.trunc(tickSize));
	return tickSize.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
}
