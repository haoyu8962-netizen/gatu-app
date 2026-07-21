import { toBig } from "@/lib/trade/numbers";

export type RawBookLevel = { px: string; sz: string; n: number };

export type BookLevel = {
	price: number;
	size: number;
	total: number;
};

export type L2BookPriceGroupOption = {
	key: string;
	nSigFigs: 2 | 3 | 4 | 5 | null;
	mantissa?: 2 | 5;
	tickSize: number;
	decimals: number;
	label: string;
};

export type L2BookPriceGroupSelection = {
	nSigFigs?: 2 | 3 | 4 | 5 | null;
	mantissa?: 2 | 5 | null;
};

export type L2BookSubscriptionParams = {
	coin: string;
	nSigFigs?: 2 | 3 | 4 | 5;
	mantissa?: 2 | 5;
};

export function processLevels(raw: RawBookLevel[] | undefined, limit?: number): BookLevel[] {
	if (!raw?.length) return [];
	const levels = limit ? raw.slice(0, limit) : raw;
	let total = 0;
	return levels.map(({ px, sz }) => {
		const price = Number(px);
		const size = Number(sz);
		total += size;
		return { price, size, total };
	});
}

export function getRawSpreadInfo(levels: readonly [readonly RawBookLevel[], readonly RawBookLevel[]] | undefined) {
	const bestBid = toBig(levels?.[0][0]?.px);
	const bestAsk = toBig(levels?.[1][0]?.px);
	if (!bestBid || !bestAsk || bestBid.lte(0) || bestAsk.lte(0) || bestAsk.lt(bestBid)) return null;

	const mid = bestAsk.plus(bestBid).div(2);
	const spread = bestAsk.minus(bestBid);
	return {
		mid: mid.toString(),
		spread: spread.toString(),
		spreadPct: spread.div(mid).times(100).toString(),
	};
}

export function getTickSizes(price: number | undefined): number[] {
	if (!price || price <= 0) return [];
	const magnitude = 10 ** Math.floor(Math.log10(price));
	const base = magnitude / 10000;
	return [base, base * 2, base * 5, base * 10, base * 100, base * 1000];
}

export function aggregateLevels(levels: BookLevel[], tickSize: number, side: "bid" | "ask"): BookLevel[] {
	if (!tickSize || !levels.length) return levels;

	const round =
		side === "bid"
			? (p: number) => Math.floor(p / tickSize) * tickSize
			: (p: number) => Math.ceil(p / tickSize) * tickSize;

	const grouped = new Map<number, number>();
	for (const { price, size } of levels) {
		const key = round(price);
		grouped.set(key, (grouped.get(key) ?? 0) + size);
	}

	const sorted = [...grouped.entries()].sort((a, b) => (side === "bid" ? b[0] - a[0] : a[0] - b[0]));
	let total = 0;
	return sorted.map(([price, size]) => {
		total += size;
		return { price, size, total };
	});
}

export function getMaxTotal(bids: BookLevel[], asks: BookLevel[]): number {
	const bidMax = bids[bids.length - 1]?.total ?? 0;
	const askMax = asks[asks.length - 1]?.total ?? 0;
	return Math.max(bidMax, askMax);
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

export function getPriceGroupingKey(selection: L2BookPriceGroupSelection | null | undefined): string {
	if (selection?.nSigFigs == null) return "full";
	return `${selection.nSigFigs}:${selection.mantissa ?? "default"}`;
}

export function getL2BookSubscriptionParams(
	coin: string,
	selection: L2BookPriceGroupSelection | null | undefined,
): L2BookSubscriptionParams {
	if (selection?.nSigFigs == null) return { coin };
	return {
		coin,
		nSigFigs: selection.nSigFigs,
		...(selection.mantissa == null ? {} : { mantissa: selection.mantissa }),
	};
}

function buildPriceGroupingOption(
	selection: Pick<L2BookPriceGroupOption, "nSigFigs" | "mantissa">,
	tickSize: number,
): L2BookPriceGroupOption {
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
