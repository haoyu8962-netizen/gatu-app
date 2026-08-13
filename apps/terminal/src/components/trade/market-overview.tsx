import { Tooltip } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { ArrowSquareOutIcon, CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	type FundingPeriodRates,
	get24hChange,
	get24hPriceChange,
	getFundingPeriodRates,
	getMarketCapUsd,
	getOiUsd,
} from "@/domain/market";
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
	type SpotMarketInfo,
	type UnifiedMarketInfo,
	useSelectedMarketInfo,
	useSubscription,
} from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { type Numeric, toBig } from "@/lib/trade/numbers";
import { StatBlock } from "./chart/stat-block";

const HOUR_MS = 3_600_000;
const MARKET_OVERVIEW_COMFORTABLE_WIDTH_PX = 600;
const MARKET_OVERVIEW_COMPACT_WIDTH_PX = 480;
const MARKET_OVERVIEW_GAP_PX = {
	comfortable: 24,
	compact: 16,
	tight: 12,
} as const;

type MarketOverviewStatId =
	| "price"
	| "oracle"
	| "change24h"
	| "volume24h"
	| "openInterest"
	| "funding"
	| "marketCap"
	| "contract";

const PERP_STAT_PRIORITY: readonly MarketOverviewStatId[] = [
	"price",
	"change24h",
	"funding",
	"oracle",
	"volume24h",
	"openInterest",
];
const SPOT_STAT_PRIORITY: readonly MarketOverviewStatId[] = [
	"price",
	"change24h",
	"volume24h",
	"marketCap",
	"contract",
];

interface MarketOverviewLayout {
	gapPx: number;
	visibleKey: string;
}

function getMarketOverviewGap(containerWidth: number): number {
	if (containerWidth >= MARKET_OVERVIEW_COMFORTABLE_WIDTH_PX) return MARKET_OVERVIEW_GAP_PX.comfortable;
	if (containerWidth >= MARKET_OVERVIEW_COMPACT_WIDTH_PX) return MARKET_OVERVIEW_GAP_PX.compact;
	return MARKET_OVERVIEW_GAP_PX.tight;
}

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

function getSpotCirculatingSupply(market: UnifiedMarketInfo | undefined): string | number | null | undefined {
	if (market?.kind !== "spot") return null;
	return (market as SpotMarketInfo).circulatingSupply;
}

export function MarketOverview() {
	useNumberFormatRevision();
	const { data: selectedMarketInfo } = useSelectedMarketInfo();
	const isSpot = selectedMarketInfo?.kind === "spot";
	const { midPx } = useOrderbookMidPrice(isSpot ? selectedMarketInfo?.name : undefined);
	const { copied: copiedSpotTokenAddress, copy: copySpotTokenAddress } = useCopyToClipboard(1500);

	const perpCoin = getMarketApiCoin(selectedMarketInfo);
	const spotCoin = getSpotMarketApiCoin(selectedMarketInfo);

	const { data: perpCtxEvent } = useSubscription(
		"activeAssetCtx",
		{ coin: perpCoin },
		{ enabled: !!perpCoin && !isSpot },
	);
	const { data: spotCtxEvent } = useSubscription(
		"activeSpotAssetCtx",
		{ coin: spotCoin },
		{ enabled: !!spotCoin && isSpot },
	);

	const liveCtx = isSpot ? spotCtxEvent?.ctx : perpCtxEvent?.ctx;
	const perpCtx = perpCtxEvent?.ctx;

	const perpMarkPx = perpCtx?.markPx ?? selectedMarketInfo?.markPx;
	const displayPrice = isSpot ? (midPx ?? liveCtx?.markPx ?? selectedMarketInfo?.markPx) : perpMarkPx;
	const dayNtlVlm = liveCtx?.dayNtlVlm ?? selectedMarketInfo?.dayNtlVlm;
	const oraclePx = perpCtx?.oraclePx ?? selectedMarketInfo?.oraclePx;
	const openInterest = perpCtx?.openInterest ?? selectedMarketInfo?.openInterest;
	const markPx = perpMarkPx;
	const funding = perpCtx?.funding ?? selectedMarketInfo?.funding;

	const prevDayForChange = liveCtx?.prevDayPx ?? selectedMarketInfo?.prevDayPx;

	const fundingRate = toBig(funding)?.toString() ?? null;
	const change24h = get24hChange(prevDayForChange, displayPrice);
	const priceChange24h = get24hPriceChange(prevDayForChange, displayPrice);
	const oiUsd = getOiUsd(openInterest, markPx);
	const spotTokenAddress = getSpotTokenAddress(selectedMarketInfo);
	const spotPrice = isSpot ? (spotCtxEvent?.ctx?.markPx ?? selectedMarketInfo?.markPx ?? midPx) : undefined;
	const spotCirculatingSupply = isSpot
		? (spotCtxEvent?.ctx?.circulatingSupply ?? getSpotCirculatingSupply(selectedMarketInfo))
		: null;
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
	const containerRef = useRef<HTMLDivElement | null>(null);
	const statNodesRef = useRef(new Map<MarketOverviewStatId, HTMLDivElement>());
	const [overviewLayout, setOverviewLayout] = useState<MarketOverviewLayout>({
		gapPx: MARKET_OVERVIEW_GAP_PX.tight,
		visibleKey: "price",
	});
	const visibleStats = new Set(overviewLayout.visibleKey.split("|") as MarketOverviewStatId[]);

	useLayoutEffect(() => {
		const observedContainer = containerRef.current;
		if (!observedContainer) return;
		const containerElement: HTMLDivElement = observedContainer;
		const priority = isSpot ? SPOT_STAT_PRIORITY : PERP_STAT_PRIORITY;

		function updateLayout() {
			const containerWidth = containerElement.clientWidth || containerElement.getBoundingClientRect().width;
			if (!Number.isFinite(containerWidth) || containerWidth <= 0) return;

			const gapPx = getMarketOverviewGap(containerWidth);
			const visible: MarketOverviewStatId[] = [];
			let occupiedWidth = 0;

			for (const id of priority) {
				const node = statNodesRef.current.get(id);
				const itemWidth = node ? node.getBoundingClientRect().width || node.scrollWidth : 0;
				if (!Number.isFinite(itemWidth) || itemWidth <= 0) break;

				const candidateWidth = occupiedWidth + (visible.length > 0 ? gapPx : 0) + itemWidth;
				if (visible.length > 0 && candidateWidth > containerWidth) break;
				visible.push(id);
				occupiedWidth = candidateWidth;
			}

			const visibleKey = (visible.length > 0 ? visible : ["price"]).join("|");
			setOverviewLayout((current) =>
				current.gapPx === gapPx && current.visibleKey === visibleKey ? current : { gapPx, visibleKey },
			);
		}

		updateLayout();
		window.addEventListener("resize", updateLayout);
		if (typeof ResizeObserver === "undefined") {
			return () => window.removeEventListener("resize", updateLayout);
		}

		const observer = new ResizeObserver(updateLayout);
		observer.observe(containerElement);
		for (const node of statNodesRef.current.values()) observer.observe(node);
		return () => {
			window.removeEventListener("resize", updateLayout);
			observer.disconnect();
		};
	}, [isSpot]);

	function renderStat(id: MarketOverviewStatId, content: ReactNode) {
		const isVisible = visibleStats.has(id);
		return (
			<div
				key={id}
				ref={(node) => {
					if (node) statNodesRef.current.set(id, node);
					else statNodesRef.current.delete(id);
				}}
				data-market-stat={id}
				aria-hidden={isVisible ? undefined : true}
				inert={isVisible ? undefined : true}
				className={cn("shrink-0", !isVisible && "pointer-events-none invisible absolute top-0 left-0")}
			>
				{content}
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			data-market-overview=""
			className="relative w-full min-w-0 overflow-hidden font-market-close text-[13px]"
		>
			<div
				data-market-overview-row=""
				className="relative flex w-max min-w-0 items-center"
				style={{ columnGap: overviewLayout.gapPx }}
			>
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
								value={createSpotTokenContractValue(spotTokenAddress, copiedSpotTokenAddress, copySpotTokenAddress)}
							/>,
						)}
					</>
				)}
			</div>
		</div>
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
