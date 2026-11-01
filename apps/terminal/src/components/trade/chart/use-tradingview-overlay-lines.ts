import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { DEFAULT_QUOTE_TOKEN, HL_ALL_DEXS } from "@/config/app";
import { getPositionDex } from "@/domain/market";
import { useOnlineStatus } from "@/hooks/use-mobile";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { buildTradingViewOverlayLines } from "@/lib/chart/tradingview-overlays";
import { useNumberFormat } from "@/lib/format";
import { type UnifiedMarketInfo, useHyperliquid, useSubscription, useUserPositions } from "@/lib/hyperliquid";

export function useTradingViewOverlayLines(market: UnifiedMarketInfo | undefined, fallbackSymbol: string) {
	const { t } = useLingui();
	const numberFormat = useNumberFormat();
	const { address, isConnected } = useWalletSession();
	const { clientKey } = useHyperliquid();
	const isOnline = useOnlineStatus();
	const {
		positions,
		isLoading: positionsLoading,
		hasError: positionsError,
		isStale: positionsStale,
	} = useUserPositions();
	const {
		data: openOrdersEvent,
		status: openOrdersStatus,
		isStale: openOrdersStale,
	} = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const coin = market?.name ?? fallbackSymbol;
	const positionDex = market ? (getPositionDex(market) ?? null) : null;
	const quoteSymbol =
		market?.kind === "builderPerp" ? (market.quoteToken?.displayName ?? DEFAULT_QUOTE_TOKEN) : DEFAULT_QUOTE_TOKEN;
	const ownerMatches =
		isConnected &&
		address !== undefined &&
		clientKey !== "disconnected" &&
		address.toLowerCase() === clientKey.toLowerCase();
	const positionsReady = ownerMatches && isOnline && !positionsLoading && !positionsError && !positionsStale;
	const openOrdersReady =
		ownerMatches && isOnline && openOrdersStatus === "active" && !openOrdersStale && openOrdersEvent !== undefined;

	return useMemo(
		() =>
			buildTradingViewOverlayLines({
				coin,
				positionDex,
				quoteSymbol,
				orders: openOrdersReady ? openOrdersEvent.orders : [],
				positions: positionsReady ? positions : [],
				labels: {
					limitBuy: t`Limit Buy`,
					limitSell: t`Limit Sell`,
					liquidation: t`Liq. Price`,
					long: t`Long`,
					pnl: t`PNL`,
					roe: "ROE",
					short: t`Short`,
				},
				numberFormat,
			}),
		[coin, numberFormat, openOrdersEvent, openOrdersReady, positionDex, positions, positionsReady, quoteSymbol, t],
	);
}
