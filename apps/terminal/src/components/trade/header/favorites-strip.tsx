import { useLingui } from "@lingui/react/macro";
import { MARKET_HEADER_LABELS } from "@/config/market-header";
import { get24hChange } from "@/domain/market";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { formatPercent } from "@/lib/format";
import { useMarketsInfo, useSelectedMarketInfo } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { useFavoriteMarkets, useMarketActions, useSelectedMarket } from "@/stores/use-market-store";
import { FavoritesStripView } from "./favorites-strip-view";

export function useFavoritesStripProps() {
	const { t } = useLingui();
	useNumberFormatRevision();
	const favorites = useFavoriteMarkets();
	const { data: selectedMarket } = useSelectedMarketInfo();
	const selectedMarketName = useSelectedMarket();
	const { toggleFavoriteMarket } = useMarketActions();
	const { getMarketInfo } = useMarketsInfo();
	const navigateToMarket = useMarketNavigation();
	const items = favorites.map((name) => {
		const market = getMarketInfo(name);
		const changePct = get24hChange(market?.prevDayPx, market?.markPx);
		return {
			name,
			label: market?.pairName ?? name,
			active: name === (selectedMarket?.name ?? selectedMarketName),
			changeText: changePct == null ? undefined : formatPercent(changePct / 100),
			changeTone: changePct !== null && changePct < 0 ? ("down" as const) : ("up" as const),
		};
	});
	function onSelect(name: string) {
		navigateToMarket(name, getMarketInfo(name));
	}
	function selectLabel(name: string) {
		const displayName = getMarketInfo(name)?.pairName ?? name;
		return t`Select ${displayName} market`;
	}
	function removeLabel(name: string) {
		const displayName = getMarketInfo(name)?.pairName ?? name;
		return t`Remove ${displayName} from favorites`;
	}
	return {
		items,
		emptyLabel: t(MARKET_HEADER_LABELS.favoritesEmpty),
		onSelect,
		onRemove: toggleFavoriteMarket,
		selectLabel,
		removeLabel,
	};
}

export function FavoritesStrip() {
	return <FavoritesStripView {...useFavoritesStripProps()} />;
}
