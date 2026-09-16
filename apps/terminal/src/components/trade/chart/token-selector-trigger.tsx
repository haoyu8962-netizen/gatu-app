import { useLingui } from "@lingui/react/macro";
import type { ComponentPropsWithRef } from "react";
import { marketSelector } from "@/components/trade/mobile/mobile-token-selector-view";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { AssetDisplay } from "../components/asset-display";
import { MobileTokenSelectorView } from "../mobile/mobile-token-selector-view";
import { TokenSelectorTriggerView } from "./token-selector-trigger-view";

export const MOBILE_TOKEN_SELECTOR_TRIGGER_CLASSNAME = marketSelector;

function getMarketLeverageLabel(market: UnifiedMarketInfo | undefined): string | null {
	if (!market || !("maxLeverage" in market) || !market.maxLeverage) return null;
	return `${market.maxLeverage}x`;
}

interface Props extends Omit<ComponentPropsWithRef<"button">, "children"> {
	selectedMarket: UnifiedMarketInfo | undefined;
	mobile?: boolean;
	open?: boolean;
	showAssetIcon?: boolean;
	showMetadataBadge?: boolean;
}

export function TokenSelectorTriggerContent({
	selectedMarket,
	mobile = false,
	open = false,
	showAssetIcon = true,
	showMetadataBadge = true,
	...rest
}: Props) {
	const { t } = useLingui();
	const kindBadge =
		selectedMarket?.kind === "spot"
			? t`Spot`
			: selectedMarket?.kind === "builderPerp"
				? selectedMarket.dex
				: selectedMarket
					? t`Perp`
					: "";
	const isSpot = selectedMarket?.kind === "spot";
	const leverageLabel = getMarketLeverageLabel(selectedMarket);
	const pairName = selectedMarket?.pairName ?? selectedMarket?.name ?? "";
	if (mobile)
		return (
			<MobileTokenSelectorView
				{...rest}
				showAssetIcon={showAssetIcon}
				pairName={pairName || null}
				kindBadge={showMetadataBadge ? kindBadge || null : undefined}
				leverageBadge={showMetadataBadge ? (selectedMarket ? (leverageLabel ?? undefined) : null) : undefined}
				isSpot={isSpot}
				icon={
					showAssetIcon && selectedMarket ? (
						<AssetDisplay coin={selectedMarket.name} iconUrl={selectedMarket.iconUrl} hideName iconClassName="size-7" />
					) : null
				}
			/>
		);

	return (
		<TokenSelectorTriggerView
			{...rest}
			pairName={pairName}
			kindBadge={showMetadataBadge ? kindBadge : undefined}
			leverageBadge={showMetadataBadge ? (leverageLabel ?? undefined) : undefined}
			isSpot={isSpot}
			open={open}
			showAssetIcon={showAssetIcon}
			icon={
				selectedMarket ? (
					<AssetDisplay coin={selectedMarket.name} iconUrl={selectedMarket.iconUrl} hideName iconClassName="size-5" />
				) : undefined
			}
		/>
	);
}
