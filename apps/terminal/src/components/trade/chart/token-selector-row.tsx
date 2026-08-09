import { useLingui } from "@lingui/react/macro";
import { ArrowsClockwiseIcon, StarIcon } from "@phosphor-icons/react";
import {
	get24hChange,
	get24hPriceChange,
	getEightHourFundingRate,
	getMarketCapUsd,
	getOiUsd,
	isTokenInCategory,
} from "@/domain/market";
import { cn } from "@/lib/cn";
import { formatNumber, formatPercent, formatUSD, szDecimalsToPriceDecimals } from "@/lib/format";
import { AssetDisplay } from "../components/asset-display";
import { getMarketSelectorPairName } from "./token-selector-categories";
import { getMarketTableGridClass, type MarketRow, type MarketTableLayout } from "./token-selector-columns";

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

function getMarketValueColorClass(value: number): string {
	if (value > 0) return "text-trading-panel-success";
	if (value < 0) return "text-trading-panel-error";
	return "text-trading-panel-fg";
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
	const priceDecimals = szDecimalsToPriceDecimals(szDecimals, isSpot ? "spot" : "perp");
	const spotBaseToken = isSpot ? market.tokensInfo[0] : undefined;
	const spotQuoteToken = isSpot ? market.tokensInfo[1] : undefined;
	const spotPairName =
		spotBaseToken && spotQuoteToken
			? `${spotBaseToken.displayName ?? spotBaseToken.name}/${spotQuoteToken.displayName ?? spotQuoteToken.name}`
			: null;
	const displayPairName = !mobile && spotPairName ? spotPairName : getMarketSelectorPairName(market);
	const priceText = formatNumber(market.markPx, {
		minimumFractionDigits: 0,
		maximumFractionDigits: priceDecimals,
	});
	const changePercent = get24hChange(market.prevDayPx, market.markPx);
	const priceChange = get24hPriceChange(market.prevDayPx, market.markPx);
	const changeClass = cn(
		"font-semibold tabular-nums",
		changePercent === null ? "text-trading-panel-subtle" : getMarketValueColorClass(changePercent),
	);
	const changePercentText = formatPercent(changePercent !== null ? changePercent / 100 : null);
	const changeText =
		changePercent === null || mobile
			? changePercentText
			: `${formatNumber(priceChange, {
					maximumFractionDigits: priceDecimals,
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
	const mobileOiText = formatUSD(oiValue, {
		compact: true,
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	});
	const volumeText = formatUSD(market.dayNtlVlm, {
		compact: false,
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	});
	const mobileVolumeText = formatUSD(market.dayNtlVlm, {
		compact: true,
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
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
	const mobileSpotMarketCapText =
		spotMarketCap === null
			? "--"
			: formatUSD(spotMarketCap, {
					compact: true,
					minimumFractionDigits: 0,
					maximumFractionDigits: 2,
				});
	const favoriteButton = (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onToggleFavorite(market.name);
			}}
			className="relative flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[4px] after:absolute after:inset-x-0 after:inset-y-[-10px] after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
			aria-label={isFav ? t`Remove ${displayPairName} from favorites` : t`Add ${displayPairName} to favorites`}
			aria-pressed={isFav}
		>
			<StarIcon
				weight={isFav ? "fill" : "regular"}
				className={cn(
					"size-3.5 transition-colors duration-[120ms]",
					isFav ? "text-trading-panel-warning" : "text-trading-panel-stroke-control hover:text-trading-panel-warning",
				)}
			/>
		</button>
	);
	let secondaryMobileMetric: { text: string; title?: string } = { text: "--" };
	if (showSpotMarketCap) {
		secondaryMobileMetric = { text: mobileSpotMarketCapText, title: spotMarketCapText };
	} else if (showDerivativesMetrics && !isSpot) {
		secondaryMobileMetric = { text: mobileOiText, title: oiText };
	}

	if (mobile) {
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
					"absolute top-0 left-0 grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_102px_84px] items-center gap-x-2 border-b border-trading-panel-stroke-row px-4 transition-colors duration-[120ms] hover:bg-trading-panel-card",
					isSelected && !isHighlighted && "bg-trading-panel-hover",
					isHighlighted && "bg-trading-panel-hover",
				)}
				style={{ height: `${height}px`, transform: `translateY(${top}px)` }}
			>
				<div className="flex min-w-0 items-center gap-[9px]">
					<AssetDisplay coin={market.name} iconUrl={market.iconUrl} hideName iconClassName="size-[26px] shrink-0" />
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 items-center gap-1">
							<span
								title={displayPairName}
								className="min-w-0 truncate whitespace-nowrap text-[13px] font-bold tracking-tight text-trading-panel-fg"
							>
								{displayPairName}
							</span>
							{isTokenInCategory(market.shortName, "new") ? (
								<span className="shrink-0 whitespace-nowrap rounded-[4px] bg-trading-panel-control px-1 py-px text-[10px] font-bold leading-none text-trading-panel-on-control">
									{t`NEW`}
								</span>
							) : null}
							{favoriteButton}
						</div>
						<div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] leading-none">
							{getMaxLeverage(market) ? (
								<span className="whitespace-nowrap rounded-[4px] bg-trading-panel-stroke-row px-1.5 py-0.5 font-semibold text-trading-panel-muted tabular-nums">
									{getMaxLeverage(market)}x
								</span>
							) : null}
							{isSpot ? (
								<span className="whitespace-nowrap rounded-[4px] bg-trading-panel-success-soft px-1.5 py-0.5 font-semibold text-trading-panel-success">
									{t`Spot`}
								</span>
							) : null}
							{spotApiToken && spotApiToken !== market.shortName ? (
								<span className="truncate font-mono text-trading-panel-subtle">{spotApiToken}</span>
							) : null}
							{isHip3 ? <span className="truncate text-trading-panel-warning">{getDex(market)}</span> : null}
						</div>
					</div>
				</div>

				<div className="flex min-w-0 flex-col items-end gap-0.5 text-right leading-4 tabular-nums">
					<span
						className="w-full truncate whitespace-nowrap text-[13px] font-semibold text-trading-panel-fg"
						title={volumeText}
					>
						{mobileVolumeText}
					</span>
					<span
						className="w-full truncate whitespace-nowrap text-[11px] text-trading-panel-subtle"
						title={secondaryMobileMetric.title}
					>
						{secondaryMobileMetric.text}
					</span>
				</div>

				<div className="flex min-w-0 flex-col items-end gap-0.5 text-right leading-4 tabular-nums">
					<span
						className="w-full truncate whitespace-nowrap text-[13px] font-bold text-trading-panel-fg"
						title={priceText}
					>
						{priceText}
					</span>
					<span className={cn(changeClass, "w-full truncate whitespace-nowrap text-[11px]")} title={changeText}>
						{changeText}
					</span>
				</div>
			</div>
		);
	}

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
				"absolute top-0 left-0 grid w-full cursor-pointer items-center gap-x-3 border-b border-trading-panel-stroke-row px-4 transition-colors duration-[120ms] hover:bg-trading-panel-card",
				getMarketTableGridClass(tableLayout),
				isSelected && !isHighlighted && "bg-trading-panel-hover",
				isHighlighted && "bg-trading-panel-hover",
			)}
			style={{ height: `${height}px`, transform: `translateY(${top}px)` }}
		>
			<div className="flex min-w-0 items-center gap-2.5">
				{favoriteButton}
				<AssetDisplay coin={market.name} iconUrl={market.iconUrl} hideName iconClassName="size-[26px] shrink-0" />
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-1">
						<span
							title={displayPairName}
							className="min-w-0 truncate whitespace-nowrap text-[13px] font-bold leading-snug tracking-tight text-trading-panel-fg"
						>
							{displayPairName}
						</span>
						{isSpot ? (
							<span className="shrink-0 whitespace-nowrap rounded-[4px] bg-trading-panel-success-soft px-1 py-px text-[10px] font-semibold text-trading-panel-success">
								{t`Spot`}
							</span>
						) : null}
						{isTokenInCategory(market.shortName, "new") && (
							<span className="shrink-0 whitespace-nowrap rounded-[4px] bg-trading-panel-control px-1 py-px text-[10px] font-bold leading-none text-trading-panel-on-control">
								{t`NEW`}
							</span>
						)}
					</div>
					<div className="flex items-center gap-1.5 text-[11px] text-trading-panel-subtle">
						{getMaxLeverage(market) && (
							<span className="whitespace-nowrap tabular-nums">{getMaxLeverage(market)}x</span>
						)}
						{spotApiToken && spotApiToken !== market.shortName && (
							<span className="truncate font-mono">{spotApiToken}</span>
						)}
						{isHip3 && <span className="truncate text-trading-panel-warning">{getDex(market)}</span>}
					</div>
				</div>
			</div>
			<div className="min-w-0 text-right">
				<span className="whitespace-nowrap text-[13px] font-semibold text-trading-panel-fg tabular-nums">
					{priceText}
				</span>
			</div>
			<div className="min-w-0 text-right">
				<span className={cn(changeClass, "whitespace-nowrap text-xs")} title={changeText}>
					{changeText}
				</span>
			</div>
			{showDerivativesMetrics ? (
				<div className="min-w-0 text-right">
					<div className="flex items-center justify-end gap-1">
						<ArrowsClockwiseIcon className="size-2.5 shrink-0 text-trading-panel-subtle" />
						<span
							className={cn(
								"whitespace-nowrap text-xs font-semibold tabular-nums",
								isSpot || eightHourFunding === null
									? "text-trading-panel-subtle"
									: getMarketValueColorClass(eightHourFunding),
							)}
						>
							{isSpot ? "--" : formatPercent(eightHourFunding, { minimumFractionDigits: 4, signDisplay: "exceptZero" })}
						</span>
					</div>
				</div>
			) : null}
			<div className="min-w-0 text-right">
				<span className="whitespace-nowrap text-[13px] text-trading-panel-fg tabular-nums">{volumeText}</span>
			</div>
			{showSpotMarketCap ? (
				<div className="min-w-0 text-right">
					<span className="whitespace-nowrap text-[13px] text-trading-panel-fg tabular-nums">{spotMarketCapText}</span>
				</div>
			) : null}
			{showDerivativesMetrics ? (
				<div className="min-w-0 text-right">
					<span className="whitespace-nowrap text-[13px] text-trading-panel-fg tabular-nums" title={oiText}>
						{isSpot ? "--" : oiText}
					</span>
				</div>
			) : null}
		</div>
	);
}
