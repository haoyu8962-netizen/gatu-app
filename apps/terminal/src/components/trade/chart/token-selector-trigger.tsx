import { useLingui } from "@lingui/react/macro";
import { CaretDownIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { AssetDisplay } from "../components/asset-display";

export const TOKEN_SELECTOR_TRIGGER_CLASSNAME =
	"inline-flex h-9 shrink-0 select-none items-center gap-2 rounded-[9px] bg-transparent pr-2 font-market-close text-trading-panel-fg transition-[color,background-color] duration-150 ease-out hover:bg-trading-panel-hover active:bg-fill-press aria-expanded:bg-trading-panel-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stroke-focus motion-reduce:transition-none cursor-pointer leading-none";

export const MOBILE_TOKEN_SELECTOR_TRIGGER_CLASSNAME =
	"inline-flex min-h-11 min-w-0 shrink-0 items-center rounded-[9px] bg-transparent py-1 pr-1 font-market-close hover:bg-trading-panel-hover active:bg-fill-press cursor-pointer leading-none";

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

interface Props {
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
	const metadataBadgeClassName =
		"inline-flex max-w-20 shrink-0 items-center truncate rounded-[4px] px-1.5 py-0.5 text-[10px] leading-none font-semibold whitespace-nowrap";
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
								<span
									className="whitespace-nowrap text-base leading-5 font-bold tracking-tight text-trading-panel-fg max-[360px]:text-[13px] max-[360px]:leading-4"
									title={pairName}
								>
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
		<>
			{selectedMarket && (
				<>
					{showAssetIcon ? (
						<AssetDisplay coin={selectedMarket.name} iconUrl={selectedMarket.iconUrl} hideName iconClassName="size-5" />
					) : null}
					<span
						className="shrink-0 whitespace-nowrap text-base leading-none font-bold tracking-tight text-trading-panel-fg"
						title={selectedMarket.pairName ?? selectedMarket.name}
					>
						{selectedMarket.pairName ?? selectedMarket.name}
					</span>
				</>
			)}
			<CaretDownIcon
				className={cn(
					"size-3 shrink-0 self-center text-trading-panel-muted transition-transform duration-150 ease-out motion-reduce:transition-none",
					open && "rotate-180",
				)}
			/>
			{showMetadataBadge && kindBadge ? <span className={kindBadgeClassName}>{kindBadge}</span> : null}
			{showMetadataBadge && !isSpot && leverageLabel ? (
				<span className={leverageBadgeClassName}>{leverageLabel}</span>
			) : null}
		</>
	);
}
