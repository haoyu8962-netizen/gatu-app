import type { ActiveAssetDataWsEvent } from "@nktkas/hyperliquid";
import { type AssetAvailabilityStatus, getAssetAvailabilityStatus } from "@/domain/trade/order/availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useSelectedMarketInfo, useSubscription } from "@/lib/hyperliquid";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";

interface ActiveAssetDataState {
	data: ActiveAssetDataWsEvent | undefined;
	isConnected: boolean;
	market: UnifiedMarketInfo | undefined;
	receivedAt: number | undefined;
	status: AssetAvailabilityStatus;
}

export function useActiveAssetData(): ActiveAssetDataState {
	const { address, isConnected } = useWalletSession();
	const { data: market } = useSelectedMarketInfo();
	const isPerpMarket = market?.kind === "perp" || market?.kind === "builderPerp";
	const coin = market?.name;
	const {
		data,
		status: subscriptionStatus,
		isStale,
		lastMessageAt,
	} = useSubscription(
		"activeAssetData",
		{ coin: coin ?? "", user: address ?? "" },
		{ enabled: isConnected && !!address && !!coin && isPerpMarket },
	);
	const status = getAssetAvailabilityStatus({
		isConnected,
		isPerpMarket,
		coin,
		user: address,
		data,
		subscriptionStatus,
		isStale,
	});

	return {
		data: status === "success" || status === "stale" ? data : undefined,
		isConnected,
		market,
		receivedAt: lastMessageAt,
		status,
	};
}
