import type { CandleSnapshotResponse, CandleWsEvent } from "@nktkas/hyperliquid";
import { toNumber } from "@/lib/trade/numbers";
import type { Bar } from "@/types/charting_library";

interface RawCandle {
	t: number;
	o: string;
	h: string;
	l: string;
	c: string;
	v: string;
}

function rawCandleToBar(candle: RawCandle): Bar | null {
	const open = toNumber(candle.o);
	const high = toNumber(candle.h);
	const low = toNumber(candle.l);
	const close = toNumber(candle.c);
	const volume = toNumber(candle.v);

	if (open == null || high == null || low == null || close == null) return null;

	return {
		time: candle.t,
		open,
		high,
		low,
		close,
		volume: volume ?? undefined,
	};
}

export function candleSnapshotToBar(candle: CandleSnapshotResponse[number]): Bar | null {
	return rawCandleToBar(candle);
}

export function candleEventToBar(event: CandleWsEvent): Bar | null {
	return rawCandleToBar(event);
}

export function filterAndSortBars(bars: (Bar | null)[], fromMs: number, toMs: number): Bar[] {
	return bars
		.filter((bar): bar is Bar => bar !== null && bar.time >= fromMs && bar.time < toMs)
		.sort((a, b) => a.time - b.time);
}
