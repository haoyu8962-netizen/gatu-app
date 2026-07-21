import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { HL_ALL_DEXS } from "@/config/app";
import { getPositionDex } from "@/domain/market";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { buildTradingViewOverlayLines } from "@/lib/chart/tradingview-overlays";
import { type UnifiedMarketInfo, useSubscription, useUserPositions } from "@/lib/hyperliquid";

export function useTradingViewOverlayLines(market: UnifiedMarketInfo | undefined, fallbackSymbol: string) {
	const { t } = useLingui();
	const { address, isConnected } = useWalletSession();
	const { positions } = useUserPositions();
	const { data: openOrdersEvent } = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const coin = market?.name ?? fallbackSymbol;
	const positionDex = market ? (getPositionDex(market) ?? null) : null;

	return useMemo(
		() =>
			buildTradingViewOverlayLines({
				coin,
				positionDex,
				orders: openOrdersEvent?.orders ?? [],
				positions,
				labels: {
					limitBuy: t`Limit Buy`,
					limitSell: t`Limit Sell`,
					long: t`Long`,
					short: t`Short`,
				},
			}),
		[coin, openOrdersEvent?.orders, positionDex, positions, t],
	);
}
