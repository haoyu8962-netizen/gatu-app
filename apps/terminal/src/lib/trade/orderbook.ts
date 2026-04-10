export type RawBookLevel = { px: string; sz: string; n: number };

export type BookLevel = {
	price: number;
	size: number;
	total: number;
};

export type L2BookPriceGroupOption = {
	key: string;
	nSigFigs: 2 | 3 | 4 | 5;
	mantissa?: 2 | 5;
	tickSize: number;
	decimals: number;
	label: string;
};

export type L2BookPriceGroupSelection = Pick<L2BookPriceGroupOption, "nSigFigs" | "mantissa">;

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

export function getSpreadInfo(bids: BookLevel[], asks: BookLevel[]) {
	const bestBid = bids[0]?.price;
	const bestAsk = asks[0]?.price;
	if (!bestBid || !bestAsk) return { mid: undefined, spread: undefined, spreadPct: undefined };
	const mid = (bestBid + bestAsk) / 2;
	const spread = bestAsk - bestBid;
	return { mid, spread, spreadPct: (spread / mid) * 100 };
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

export function getPriceGroupingOptions(mid: number | undefined): L2BookPriceGroupOption[] {
	if (!mid || !Number.isFinite(mid) || mid <= 0) {
		return [];
	}

	const integerDigits = Math.floor(Math.log10(mid)) + 1;

	return [
		buildPriceGroupingOption({ nSigFigs: 5 }, 10 ** (integerDigits - 5)),
		buildPriceGroupingOption({ nSigFigs: 5, mantissa: 2 }, 2 * 10 ** (integerDigits - 5)),
		buildPriceGroupingOption({ nSigFigs: 5, mantissa: 5 }, 5 * 10 ** (integerDigits - 5)),
		buildPriceGroupingOption({ nSigFigs: 4 }, 10 ** (integerDigits - 4)),
		buildPriceGroupingOption({ nSigFigs: 3 }, 10 ** (integerDigits - 3)),
		buildPriceGroupingOption({ nSigFigs: 2 }, 10 ** (integerDigits - 2)),
	].sort((a, b) => a.tickSize - b.tickSize);
}

export function getPriceGroupingKey(selection: L2BookPriceGroupSelection | null | undefined): string {
	return `${selection?.nSigFigs ?? "default"}:${selection?.mantissa ?? "default"}`;
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
