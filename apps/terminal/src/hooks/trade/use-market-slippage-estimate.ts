import { estimateMarketSlippage, type MarketSlippageEstimate } from "@/domain/trade/order/slippage";
import { useInfo } from "@/lib/hyperliquid";
import { type Numeric, toBig } from "@/lib/trade/numbers";
import type { Side } from "@/lib/trade/types";

const SLIPPAGE_BOOK_REFRESH_MS = 3_000;

export function useMarketSlippageEstimate(
	coin: string | undefined,
	side: Side,
	size: Numeric,
	enabled: boolean,
): MarketSlippageEstimate | null {
	const requestedSize = toBig(size);
	const isActive = enabled && !!coin && !!requestedSize && requestedSize.gt(0);

	const { data } = useInfo(
		"l2Book",
		{ coin: coin ?? "" },
		{
			enabled: isActive,
			staleTime: SLIPPAGE_BOOK_REFRESH_MS,
			refetchInterval: isActive ? SLIPPAGE_BOOK_REFRESH_MS : false,
			refetchIntervalInBackground: false,
			retry: false,
		},
	);

	if (!isActive || !data || data.coin !== coin) return null;
	return estimateMarketSlippage({ levels: data.levels, side, size });
}
