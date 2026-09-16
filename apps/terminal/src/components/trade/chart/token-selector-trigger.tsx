import { useLingui } from "@lingui/react/macro";
import { CaretDownIcon } from "@phosphor-icons/react";
import type { ComponentPropsWithRef } from "react";
import * as mobileChrome from "@/components/trade/mobile/mobile-chrome-classes";
import { cn } from "@/lib/cn";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { AssetDisplay } from "../components/asset-display";
import { TokenSelectorTriggerView } from "./token-selector-trigger-view";

export const MOBILE_TOKEN_SELECTOR_TRIGGER_CLASSNAME = mobileChrome.marketSelector;

function getMarketLeverageLabel(market: UnifiedMarketInfo | undefined): string | null {
	if (!market || !("maxLeverage" in market) || !market.maxLeverage) return null;
	return `${market.maxLeverage}x`;
}

function getPairNameParts(pairName: string): { main: string; suffix: string } {
	const separatorIndex = pairName.indexOf("-");
	if (separatorIndex < 0) return { main: pairName, suffix: "" };
	return {
		main: pairName.slice(0, separatorIndex),
		suffix: pairName.slice(separatorIndex),
	};
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
	const pairNameParts = getPairNameParts(pairName);
	const metadataBadgeClassName = mobileChrome.marketBadge;
	const kindBadgeClassName = cn(
		metadataBadgeClassName,
		isSpot
			? "bg-trading-panel-success-soft text-trading-panel-success"
			: "bg-trading-panel-hover text-trading-panel-muted",
	);
	const leverageBadgeClassName = cn(
		metadataBadgeClassName,
		"bg-trading-panel-hover text-trading-panel-muted tabular-nums",
	);

	if (mobile) {
		return (
			<>
				{selectedMarket && (
					<>
						{showAssetIcon ? (
							<AssetDisplay
								coin={selectedMarket.name}
								iconUrl={selectedMarket.iconUrl}
								hideName
								iconClassName="size-7"
							/>
						) : null}
						<span className="flex min-w-0 shrink-0 flex-col items-start gap-1">
							<span className="flex min-w-0 items-center gap-1.5 max-[360px]:gap-1">
								<span className={mobileChrome.marketName} title={pairName}>
									<span>{pairNameParts.main}</span>
									{pairNameParts.suffix ? <span>{pairNameParts.suffix}</span> : null}
								</span>
								<CaretDownIcon className="size-3 shrink-0 text-trading-panel-subtle" />
							</span>
							{showMetadataBadge && (kindBadge || leverageLabel) ? (
								<span className="flex min-w-0 items-center gap-1">
									{kindBadge ? <span className={kindBadgeClassName}>{kindBadge}</span> : null}
									{!isSpot && leverageLabel ? <span className={leverageBadgeClassName}>{leverageLabel}</span> : null}
								</span>
							) : null}
						</span>
					</>
				)}
			</>
		);
	}

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
