import { Badge } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { FireIcon, StarIcon } from "@phosphor-icons/react";
import {
	get24hChange,
	get24hPriceChange,
	getEightHourFundingRate,
	getMarketCapUsd,
	getOiUsd,
	isTokenInCategory,
} from "@/domain/market";
import { cn } from "@/lib/cn";
import { formatNumber, formatPercent, formatPrice, formatUSD, szDecimalsToPriceDecimals } from "@/lib/format";
import { getValueColorClass } from "@/lib/ui/value-color";
import { AssetDisplay } from "../components/asset-display";
import { getMarketSelectorPairName } from "./token-selector-categories";
import { getMarketTableColumnClass, type MarketRow, type MarketTableLayout } from "./token-selector-columns";

interface Props {
	market: MarketRow;
	mobile: boolean;
	showDerivativesMetrics: boolean;
	showSpotMarketCap: boolean;
	isSelected: boolean;
	isHighlighted: boolean;
	isFavorite: boolean;
	top: number;
	height: number;
	onSelect: (name: string) => void;
	onToggleFavorite: (name: string) => void;
}

function getSzDecimals(market: MarketRow): number {
	if (market.kind === "spot") return market.tokensInfo[0]?.szDecimals ?? 4;
	return market.szDecimals;
}

function getMaxLeverage(market: MarketRow): number | null {
	if (market.kind === "spot") return null;
	return market.maxLeverage ?? null;
}

function getDex(market: MarketRow): string | undefined {
	if (market.kind === "builderPerp") return market.dex;
	return undefined;
}

export function TokenSelectorRow({
	market,
	mobile,
	showDerivativesMetrics,
	showSpotMarketCap,
	isSelected,
	isHighlighted,
	isFavorite: isFav,
	top,
	height,
	onSelect,
	onToggleFavorite,
}: Props) {
	const { t } = useLingui();
	const szDecimals = getSzDecimals(market);
	const isSpot = market.kind === "spot";
	const spotBaseToken = isSpot ? market.tokensInfo[0] : undefined;
	const spotQuoteToken = isSpot ? market.tokensInfo[1] : undefined;
	const spotPairName =
		spotBaseToken && spotQuoteToken
			? `${spotBaseToken.displayName ?? spotBaseToken.name}/${spotQuoteToken.displayName ?? spotQuoteToken.name}`
			: null;
	const displayPairName = !mobile && spotPairName ? spotPairName : getMarketSelectorPairName(market);
	const changePercent = get24hChange(market.prevDayPx, market.markPx);
	const priceChange = get24hPriceChange(market.prevDayPx, market.markPx);
	const changeClass = cn(
		"font-medium tabular-nums text-xs",
		changePercent === null ? "text-fg-muted" : getValueColorClass(changePercent),
	);
	const changePercentText = formatPercent(changePercent !== null ? changePercent / 100 : null);
	const changeText =
		changePercent === null || mobile
			? changePercentText
			: `${formatNumber(priceChange, {
					maximumFractionDigits: szDecimalsToPriceDecimals(szDecimals),
					signDisplay: "exceptZero",
				})} / ${changePercentText}`;

	const isHip3 = market.kind === "builderPerp";
	const spotApiToken = spotBaseToken?.name;

	const oiValue = getOiUsd(market.openInterest, market.markPx);
	const oiText = formatUSD(oiValue, {
		compact: false,
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	});
	const eightHourFunding = getEightHourFundingRate(market.funding);
	const spotMarketCap = isSpot ? getMarketCapUsd(market.circulatingSupply, market.markPx) : null;
	const tableLayout: MarketTableLayout = showSpotMarketCap ? "spot" : "default";
	const spotMarketCapText =
		spotMarketCap && spotQuoteToken
			? `${formatNumber(spotMarketCap, {
					compact: false,
					minimumFractionDigits: 0,
					maximumFractionDigits: 0,
				})} ${spotQuoteToken.displayName ?? spotQuoteToken.name}`
			: "--";
	const favoriteButton = (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onToggleFavorite(market.name);
			}}
			className="shrink-0 cursor-pointer rounded-4 p-0.5 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
			aria-label={isFav ? t`Remove ${displayPairName} from favorites` : t`Add ${displayPairName} to favorites`}
			aria-pressed={isFav}
		>
			<StarIcon
				weight={isFav ? "fill" : "regular"}
				className={cn(
					"transition-colors",
					mobile ? "size-3" : "size-3.5",
					isFav ? "text-yellow" : "text-fg-muted hover:text-yellow",
				)}
			/>
		</button>
	);

	return (
		<div
			data-index={market.name}
			onClick={() => onSelect(market.name)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") onSelect(market.name);
			}}
			role="option"
			aria-selected={isSelected}
			tabIndex={-1}
			className={cn(
				"flex items-center px-2 cursor-pointer border-b border-stroke-weak",
				"hover:bg-fill-hover transition-colors",
				"absolute top-0 left-0 w-full",
				mobile ? "py-2.5" : "py-1.5",
				isSelected && !isHighlighted && "bg-surface",
				isHighlighted && "bg-fill-hover",
			)}
			style={{ height: `${height}px`, transform: `translateY(${top}px)` }}
		>
			<div
				className={cn(
					"min-w-0 flex items-center gap-2",
					showSpotMarketCap ? "flex-1 lg:flex-none" : "flex-1 min-[848px]:flex-none",
					getMarketTableColumnClass("pairName", mobile, tableLayout),
				)}
			>
				{mobile ? (
					<AssetDisplay coin={market.name} iconUrl={market.iconUrl} hideName iconClassName="size-6 shrink-0" />
				) : (
					favoriteButton
				)}
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-1">
						<span
							title={displayPairName}
							className={cn(
								"min-w-0 truncate font-semibold tracking-tight",
								mobile ? "text-xs" : "text-2xs leading-snug",
							)}
						>
							{displayPairName}
						</span>
						{isSpot && !mobile ? (
							<Badge tone="brand" size="xxs" className="shrink-0 border-0">
								{t`Spot`}
							</Badge>
						) : null}
						{isTokenInCategory(market.shortName, "new") && (
							<Badge tone="neutral" size="sm" className="shrink-0 px-1 py-0 text-xs">
								{t`NEW`}
							</Badge>
						)}
						{mobile ? favoriteButton : null}
					</div>
					<div className={cn("flex items-center gap-1.5 text-fg", mobile ? "text-xs" : "text-2xs")}>
						{getMaxLeverage(market) && <span>{getMaxLeverage(market)}x</span>}
						{isSpot && mobile && <span className="text-brand">{t`Spot`}</span>}
						{mobile && spotApiToken && spotApiToken !== market.shortName && (
							<span className="font-mono text-fg-muted">{spotApiToken}</span>
						)}
						{isHip3 && <span className="text-warning">{getDex(market)}</span>}
					</div>
				</div>
			</div>
			<div className={cn("text-right", getMarketTableColumnClass("price", mobile, tableLayout))}>
				<span className="font-medium tabular-nums text-xs">
					{mobile
						? formatPrice(market.markPx, { szDecimals })
						: formatNumber(market.markPx, {
								minimumFractionDigits: 0,
								maximumFractionDigits: szDecimalsToPriceDecimals(szDecimals),
							})}
				</span>
			</div>
			<div className={cn("text-right", getMarketTableColumnClass("24h-change", mobile, tableLayout))}>
				<span className={cn(changeClass, "whitespace-nowrap")} title={changeText}>
					{changeText}
				</span>
			</div>
			{showDerivativesMetrics ? (
				<div className={cn("text-right hidden sm:block", getMarketTableColumnClass("funding", mobile))}>
					<div className="flex items-center justify-end gap-1">
						{!isSpot && eightHourFunding !== null && eightHourFunding !== 0 ? (
							<FireIcon className={cn("size-2.5", getValueColorClass(eightHourFunding))} />
						) : null}
						<span
							className={cn(
								"text-xs tabular-nums font-medium",
								isSpot || eightHourFunding === null ? "text-fg-muted" : getValueColorClass(eightHourFunding),
							)}
						>
							{isSpot ? "--" : formatPercent(eightHourFunding, { minimumFractionDigits: 4, signDisplay: "exceptZero" })}
						</span>
					</div>
				</div>
			) : null}
			<div className={cn("text-right hidden sm:block", getMarketTableColumnClass("volume", mobile, tableLayout))}>
				<span className="text-xs font-medium tabular-nums">
					{formatUSD(market.dayNtlVlm, {
						compact: false,
						minimumFractionDigits: 0,
						maximumFractionDigits: 0,
					})}
				</span>
			</div>
			{showSpotMarketCap ? (
				<div className={cn("hidden text-right lg:block", getMarketTableColumnClass("market-cap", mobile, tableLayout))}>
					<span className="whitespace-nowrap text-xs font-medium tabular-nums">{spotMarketCapText}</span>
				</div>
			) : null}
			{showDerivativesMetrics ? (
				<div className={cn("text-right hidden sm:block", getMarketTableColumnClass("oi", mobile))}>
					<span className="whitespace-nowrap text-xs font-medium tabular-nums" title={oiText}>
						{isSpot ? "--" : oiText}
					</span>
				</div>
			) : null}
		</div>
	);
}
