import Big from "big.js";
import { type Numeric, toBig } from "@/lib/trade/numbers";
import type { RawBookSides } from "@/lib/trade/orderbook";
import type { Side } from "@/lib/trade/types";

const BPS_DIVISOR = 10_000;

interface EstimateMarketSlippageInput {
	levels: RawBookSides | undefined;
	side: Side;
	size: Numeric;
}

export interface MarketSlippageEstimate {
	avgPx: number;
	refPx: number;
	slippageBps: number;
	exceedsVisibleDepth: boolean;
}

export function estimateMarketSlippage({
	levels,
	side,
	size,
}: EstimateMarketSlippageInput): MarketSlippageEstimate | null {
	const requestedSize = toBig(size);
	if (!requestedSize || requestedSize.lte(0)) return null;

	const bestBid = toBig(levels?.[0]?.[0]?.px);
	const bestAsk = toBig(levels?.[1]?.[0]?.px);
	if (!bestBid || !bestAsk || bestBid.lte(0) || bestAsk.lte(0) || bestAsk.lt(bestBid)) return null;

	const takerLevels = side === "buy" ? levels?.[1] : levels?.[0];
	if (!takerLevels?.length) return null;

	let remainingSize = requestedSize;
	let filledSize = Big(0);
	let notional = Big(0);

	for (const level of takerLevels) {
		const price = toBig(level.px);
		const levelSize = toBig(level.sz);
		if (!price || !levelSize || price.lte(0) || levelSize.lte(0)) continue;

		const fillSize = remainingSize.lte(levelSize) ? remainingSize : levelSize;
		filledSize = filledSize.plus(fillSize);
		notional = notional.plus(fillSize.times(price));
		remainingSize = remainingSize.minus(fillSize);
		if (remainingSize.lte(0)) break;
	}

	if (filledSize.lte(0)) return null;

	const refPx = bestBid.plus(bestAsk).div(2);
	const avgPx = notional.div(filledSize);

	return {
		avgPx: avgPx.toNumber(),
		refPx: refPx.toNumber(),
		slippageBps: avgPx.minus(refPx).abs().div(refPx).times(BPS_DIVISOR).toNumber(),
		exceedsVisibleDepth: remainingSize.gt(0),
	};
}
