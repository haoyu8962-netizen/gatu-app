import { useSubscription } from "@/lib/hyperliquid";
import { processLevels } from "@/lib/trade/orderbook";

const ORDERBOOK_MID_N_SIG_FIGS = 5;

export function useOrderbookMidPrice(coin: string | undefined) {
	const { data: book, status } = useSubscription(
		"l2Book",
		{ coin: coin ?? "", nSigFigs: ORDERBOOK_MID_N_SIG_FIGS },
		{ enabled: !!coin },
	);

	const bestBid = processLevels(book?.levels[0], 1)[0]?.price;
	const bestAsk = processLevels(book?.levels[1], 1)[0]?.price;
	const midPx =
		typeof bestBid === "number" && typeof bestAsk === "number" && Number.isFinite(bestBid) && Number.isFinite(bestAsk)
			? (bestBid + bestAsk) / 2
			: undefined;

	return { bestAsk, bestBid, midPx, status };
}
