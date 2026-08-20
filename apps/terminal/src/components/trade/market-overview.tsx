import { Tooltip } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { ArrowSquareOutIcon, CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";
import {
	type FundingPeriodRates,
	get24hChange,
	get24hPriceChange,
	getFundingPeriodRates,
	getMarketCapUsd,
	getOiUsd,
} from "@/domain/market";
import { isLiveMarkPriceReady, resolveActiveMarketPrice } from "@/domain/trade/market-price";
import { useOrderbookMidPrice } from "@/hooks/trade/use-orderbook-mid-price";
import { useCopyToClipboard } from "@/hooks/ui/use-copy-to-clipboard";
import { cn } from "@/lib/cn";
import {
	formatClockDuration,
	formatNumber,
	formatPercent,
	formatQuoteAmount,
	formatUSD,
	shortenAddress,
	szDecimalsToPriceDecimals,
} from "@/lib/format";
import {
	getExplorerTokenUrl,
	getMarketApiCoin,
	getSpotMarketApiCoin,
	type UnifiedMarketInfo,
	useMarketsInfo,
	useSelectedMarketInfo,
	useSubscription,
} from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { type Numeric, toBig } from "@/lib/trade/numbers";
import { StatBlock } from "./chart/stat-block";

const HOUR_MS = 3_600_000;

type MarketOverviewStatId =
	| "price"
	| "oracle"
	| "change24h"
	| "volume24h"
	| "openInterest"
	| "funding"
	| "marketCap"
	| "contract";

const MARKET_OVERVIEW_STAT_WIDTH_CLASS: Record<MarketOverviewStatId, string> = {
	price: "min-w-[90px]",
	oracle: "min-w-[90px]",
	change24h: "min-w-[170px]",
	volume24h: "min-w-[136px]",
	openInterest: "min-w-[136px]",
	funding: "min-w-[128px]",
	marketCap: "min-w-[136px]",
	contract: "min-w-[112px]",
};

const KEYBOARD_SCROLL_REGION_PROPS = { tabIndex: 0 } as const;

function FundingTooltipContent({ rates, remaining }: { rates: FundingPeriodRates; remaining: number }) {
	useNumberFormatRevision();
	const rows = [
		{ label: t`7 days`, rate: rates.sevenDays },
		{ label: t`30 days`, rate: rates.thirtyDays },
		{ label: t`1 year`, rate: rates.oneYear },
	];

	return (
		<div className="min-w-[9rem] space-y-2 font-market-close">
			<div className="flex items-center justify-between gap-4">
				<span className="text-2xs uppercase tracking-wide text-fg-muted">{t`Resets in`}</span>
				<span className="font-mono text-xs tabular-nums text-fg">{formatClockDuration(remaining)}</span>
			</div>
			<div className="border-t border-stroke-weak pt-2 space-y-1.5">
				{rows.map(({ label, rate }) => (
					<div key={label} className="flex items-center justify-between gap-4">
						<span className="text-2xs text-fg-muted">{label}</span>
						<span className={cn("text-xs font-medium tabular-nums", getMarketValueColorClass(rate))}>
							{formatPercent(rate, { signDisplay: "exceptZero" })}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function FundingStatBlock({ fundingRate }: { fundingRate: string | null }) {
	useNumberFormatRevision();
	const [remaining, setRemaining] = useState(() => HOUR_MS - (Date.now() % HOUR_MS));
	const periodRates = getFundingPeriodRates(fundingRate);
	const hasFunding = periodRates !== null;

	useEffect(() => {
		if (!hasFunding) return;
		const updateRemaining = () => setRemaining(HOUR_MS - (Date.now() % HOUR_MS));
		updateRemaining();
		const id = setInterval(updateRemaining, 1000);
		return () => clearInterval(id);
	}, [hasFunding]);

	const block = (
		<span>
			<StatBlock
				label={
					<>
						{t`FUNDING`} / {t`Resets in`}
					</>
				}
				labelClass="cursor-help border-b border-dashed border-trading-panel-stroke-control"
				value={
					fundingRate === null ? (
						"—"
					) : (
						<>
							<span className={getMarketValueColorClass(fundingRate)}>
								{formatPercent(fundingRate, {
									minimumFractionDigits: 4,
									signDisplay: "exceptZero",
								})}
							</span>
							<span className="ml-1 text-trading-panel-fg">{formatClockDuration(remaining)}</span>
						</>
					)
				}
			/>
		</span>
	);

	if (!periodRates) return block;

	return (
		<Tooltip content={<FundingTooltipContent rates={periodRates} remaining={remaining} />} side="bottom">
			{block}
		</Tooltip>
	);
}

function getSpotTokenAddress(market: UnifiedMarketInfo | undefined): string | null {
	if (market?.kind !== "spot") return null;
	const baseToken = market.tokensInfo[0];
	if (!baseToken) return null;
	const tokenId = (baseToken as { tokenId?: string }).tokenId;
	if (!tokenId?.startsWith("0x")) return null;
	return tokenId;
}

export function MarketOverview() {
	useNumberFormatRevision();
	const { data: selectedMarketInfo } = useSelectedMarketInfo();
	const { getMarketByName } = useMarketsInfo();
	const isSpot = selectedMarketInfo?.kind === "spot";
	const { midPx } = useOrderbookMidPrice(isSpot ? selectedMarketInfo?.name : undefined);
	const { copiedValue: copiedSpotTokenAddress, copy: copySpotTokenAddress } = useCopyToClipboard(1500);

	const perpCoin = getMarketApiCoin(selectedMarketInfo);
	const spotCoin = getSpotMarketApiCoin(selectedMarketInfo);

	const {
		data: perpCtxEvent,
		status: perpCtxStatus,
		isStale: perpCtxIsStale,
		lastMessageAt: perpCtxReceivedAt,
	} = useSubscription("activeAssetCtx", { coin: perpCoin }, { enabled: !!perpCoin && !isSpot });
	const {
		data: spotCtxEvent,
		status: spotCtxStatus,
		isStale: spotCtxIsStale,
		lastMessageAt: spotCtxReceivedAt,
	} = useSubscription("activeSpotAssetCtx", { coin: spotCoin }, { enabled: !!spotCoin && isSpot });

	const perpPrice = resolveActiveMarketPrice({
		coin: perpCoin,
		enabled: !!perpCoin && !isSpot,
		data: perpCtxEvent,
		subscriptionStatus: perpCtxStatus,
		isStale: perpCtxIsStale,
		lastMessageAt: perpCtxReceivedAt,
	});
	const spotPriceSnapshot = resolveActiveMarketPrice({
		coin: spotCoin,
		enabled: !!spotCoin && isSpot,
		data: spotCtxEvent,
		subscriptionStatus: spotCtxStatus,
		isStale: spotCtxIsStale,
		lastMessageAt: spotCtxReceivedAt,
	});
	const hasFreshPerpCtx = isLiveMarkPriceReady(perpPrice.status, perpPrice.markPx, perpPrice.receivedAt);
	const hasFreshSpotCtx = isLiveMarkPriceReady(
		spotPriceSnapshot.status,
		spotPriceSnapshot.markPx,
		spotPriceSnapshot.receivedAt,
	);
	const spotCtx = hasFreshSpotCtx ? spotCtxEvent?.ctx : undefined;
	const perpCtx = hasFreshPerpCtx ? perpCtxEvent?.ctx : undefined;
	const liveCtx = isSpot ? spotCtx : perpCtx;
	const hasFreshSelectedMark = isLiveMarkPriceReady(
		selectedMarketInfo?.markPriceStatus ?? "loading",
		selectedMarketInfo?.markPx,
		selectedMarketInfo?.markPriceReceivedAt,
	);
	const fastMarketInfo = selectedMarketInfo?.name ? getMarketByName(selectedMarketInfo.name) : undefined;
	const hasFreshFastMark =
		fastMarketInfo?.name === selectedMarketInfo?.name &&
		isLiveMarkPriceReady(
			fastMarketInfo?.markPriceStatus ?? "loading",
			fastMarketInfo?.markPx,
			fastMarketInfo?.markPriceReceivedAt,
		);
	const selectedLiveMark = hasFreshSelectedMark
		? selectedMarketInfo?.markPx
		: hasFreshFastMark
			? fastMarketInfo?.markPx
			: undefined;

	const perpMarkPx = perpCtx?.markPx ?? selectedLiveMark;
	const displayPrice = isSpot ? (midPx ?? liveCtx?.markPx ?? selectedLiveMark) : perpMarkPx;
	const dayNtlVlm = liveCtx?.dayNtlVlm;
	const oraclePx = perpCtx?.oraclePx;
	const openInterest = perpCtx?.openInterest;
	const markPx = perpMarkPx;
	const funding = perpCtx?.funding;

	const prevDayForChange = liveCtx?.prevDayPx;

	const fundingRate = toBig(funding)?.toString() ?? null;
	const change24h = get24hChange(prevDayForChange, displayPrice);
	const priceChange24h = get24hPriceChange(prevDayForChange, displayPrice);
	const oiUsd = getOiUsd(openInterest, markPx);
	const spotTokenAddress = getSpotTokenAddress(selectedMarketInfo);
	const spotPrice = isSpot ? (liveCtx?.markPx ?? selectedLiveMark ?? midPx) : undefined;
	const spotCirculatingSupply = isSpot ? spotCtx?.circulatingSupply : null;
	const spotMarketCap = getMarketCapUsd(spotCirculatingSupply, spotPrice);
	const marketType = isSpot ? "spot" : "perp";
	const priceDecimals = szDecimalsToPriceDecimals(selectedMarketInfo?.szDecimals ?? 2, marketType);
	const priceText = formatNumber(displayPrice, {
		minimumFractionDigits: 0,
		maximumFractionDigits: priceDecimals,
	});
	const changePct = change24h !== null ? formatPercent(change24h / 100, { signDisplay: "exceptZero" }) : "—";
	const priceChangeText =
		priceChange24h !== null
			? formatNumber(priceChange24h, {
					minimumFractionDigits: 0,
					maximumFractionDigits: priceDecimals,
					signDisplay: "exceptZero",
				})
			: "—";
	const changeText = change24h === null ? "—" : `${priceChangeText} / ${changePct}`;
	const quoteToken =
		selectedMarketInfo?.kind === "spot"
			? (selectedMarketInfo.tokensInfo[1]?.displayName ?? selectedMarketInfo.tokensInfo[1]?.name ?? "USDC")
			: "USDC";
	const spotVolumeText =
		dayNtlVlm != null
			? formatQuoteAmount(dayNtlVlm, quoteToken, {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				})
			: "—";
	const spotMarketCapText =
		spotMarketCap != null
			? formatQuoteAmount(spotMarketCap, quoteToken, {
					minimumFractionDigits: 0,
					maximumFractionDigits: 0,
				})
			: "—";
	function renderStat(id: MarketOverviewStatId, content: ReactNode) {
		return (
			<div key={id} data-market-stat={id} className={cn("shrink-0", MARKET_OVERVIEW_STAT_WIDTH_CLASS[id])}>
				{content}
			</div>
		);
	}

	return (
		<section
			data-market-overview=""
			aria-label={t`Market`}
			{...KEYBOARD_SCROLL_REGION_PROPS}
			className="relative w-full min-w-0 touch-pan-x overflow-x-auto overflow-y-hidden overscroll-x-contain font-market-close text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-stroke-focus [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			<div data-market-overview-row="" className="relative flex w-max min-w-full items-center gap-6">
				{renderStat(
					"price",
					<StatBlock label={isSpot ? t`Price` : t`Mark`} value={priceText} valueClass="text-trading-panel-fg" />,
				)}
				{!isSpot && (
					<>
						{renderStat(
							"oracle",
							<StatBlock
								label={t`ORACLE`}
								value={formatNumber(oraclePx, {
									minimumFractionDigits: 0,
									maximumFractionDigits: priceDecimals,
								})}
							/>,
						)}
						{renderStat(
							"change24h",
							<StatBlock
								label={t({ message: "24h Change", context: "Market overview" })}
								value={changeText}
								valueClass={change24h === null ? "text-trading-panel-subtle" : getMarketValueColorClass(change24h)}
							/>,
						)}
						{renderStat(
							"volume24h",
							<StatBlock
								label={t({ message: "24H VOL", context: "Market overview" })}
								value={formatUSD(dayNtlVlm, { compact: false })}
							/>,
						)}
						{renderStat("openInterest", <StatBlock label={t`OPEN INT`} value={formatUSD(oiUsd, { compact: false })} />)}
						{renderStat("funding", <FundingStatBlock fundingRate={fundingRate} />)}
					</>
				)}
				{isSpot && (
					<>
						{renderStat(
							"change24h",
							<StatBlock
								label={t({ message: "24h Change", context: "Market overview" })}
								value={changeText}
								valueClass={change24h === null ? "text-trading-panel-subtle" : getMarketValueColorClass(change24h)}
							/>,
						)}
						{renderStat(
							"volume24h",
							<StatBlock label={t({ message: "24H VOL", context: "Market overview" })} value={spotVolumeText} />,
						)}
						{renderStat("marketCap", <StatBlock label={t`Market Cap`} value={spotMarketCapText} />)}
						{renderStat(
							"contract",
							<StatBlock
								label={t`Contract`}
								value={createSpotTokenContractValue(
									spotTokenAddress,
									copiedSpotTokenAddress === spotTokenAddress,
									copySpotTokenAddress,
								)}
							/>,
						)}
					</>
				)}
			</div>
		</section>
	);
}

function createSpotTokenContractValue(address: string | null, copied: boolean, onCopy: (value: string) => void) {
	function handleCopy() {
		if (!address) return;
		onCopy(address);
	}

	if (!address) {
		return "—";
	}

	return (
		<span className="flex items-center gap-1 whitespace-nowrap">
			<a
				href={getExplorerTokenUrl(address)}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex items-center gap-1 text-[13px] font-semibold tabular-nums text-trading-panel-fg transition-colors duration-150 hover:text-trading-panel-muted"
				aria-label={t`Open token in explorer`}
			>
				{shortenAddress(address, 4, 4)}
				<ArrowSquareOutIcon className="size-3 shrink-0 text-trading-panel-muted" aria-hidden="true" />
			</a>
			<button
				type="button"
				onClick={handleCopy}
				aria-label={copied ? t`Copied` : t`Copy token address`}
				className="inline-flex size-5 shrink-0 items-center justify-center rounded-[7px] text-trading-panel-muted transition-colors duration-150 hover:bg-trading-panel-hover hover:text-trading-panel-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
			>
				{copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
			</button>
		</span>
	);
}

function getMarketValueColorClass(value: Numeric): string {
	const numericValue = toBig(value);
	if (!numericValue || numericValue.eq(0)) return "text-trading-panel-subtle";
	return numericValue.lt(0) ? "text-trading-panel-error" : "text-trading-panel-success";
}
