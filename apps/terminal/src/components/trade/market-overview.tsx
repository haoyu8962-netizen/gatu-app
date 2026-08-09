import { Tooltip } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { ArrowSquareOutIcon, CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { get24hChange, get24hPriceChange, getMarketCapUsd, getOiUsd } from "@/domain/market";
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
import { toBig } from "@/lib/trade/numbers";
import { StatBlock } from "./chart/stat-block";

const HOUR_MS = 3_600_000;

function FundingTooltipContent({ fundingNum, remaining }: { fundingNum: number; remaining: number }) {
	const rows = [
		{ label: t`7 days`, rate: fundingNum * 24 * 7 },
		{ label: t`30 days`, rate: fundingNum * 24 * 30 },
		{ label: t`1 year`, rate: fundingNum * 24 * 365 },
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

function FundingStatBlock({ fundingNum }: { fundingNum: number | null }) {
	const [remaining, setRemaining] = useState(() => HOUR_MS - (Date.now() % HOUR_MS));
	const hasFunding = fundingNum !== null;

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
					fundingNum === null ? (
						"—"
					) : (
						<>
							<span className={getMarketValueColorClass(fundingNum)}>
								{formatPercent(fundingNum, {
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

	if (fundingNum === null) return block;

	return (
		<Tooltip content={<FundingTooltipContent fundingNum={fundingNum} remaining={remaining} />} side="bottom">
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
	const { data: selectedMarketInfo } = useSelectedMarketInfo();
	const { midPx } = useOrderbookMidPrice(selectedMarketInfo?.name);
	const { copied: copiedSpotTokenAddress, copy: copySpotTokenAddress } = useCopyToClipboard(1500);

	const isSpot = selectedMarketInfo?.kind === "spot";
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

	const displayPrice = midPx ?? liveCtx?.markPx ?? selectedMarketInfo?.markPx;
	const dayNtlVlm = liveCtx?.dayNtlVlm ?? selectedMarketInfo?.dayNtlVlm;
	const oraclePx = perpCtx?.oraclePx ?? selectedMarketInfo?.oraclePx;
	const openInterest = perpCtx?.openInterest ?? selectedMarketInfo?.openInterest;
	const markPx = perpCtx?.markPx ?? selectedMarketInfo?.markPx;
	const funding = perpCtx?.funding ?? selectedMarketInfo?.funding;

	const prevDayForChange = liveCtx?.prevDayPx ?? selectedMarketInfo?.prevDayPx;

	const fundingNum = toBig(funding)?.toNumber() ?? null;
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

	return (
		<div className="grid w-max min-w-0 auto-cols-max grid-flow-col items-center gap-6 font-market-close text-[13px]">
			<StatBlock label={t`Price`} value={priceText} valueClass="text-trading-panel-fg" />
			{!isSpot && (
				<>
					<StatBlock
						label={t`ORACLE`}
						value={formatNumber(oraclePx, {
							minimumFractionDigits: 0,
							maximumFractionDigits: priceDecimals,
						})}
					/>
					<StatBlock
						label={t({ message: "24h Change", context: "Market overview" })}
						value={changeText}
						valueClass={change24h === null ? "text-trading-panel-subtle" : getMarketValueColorClass(change24h)}
					/>
					<StatBlock
						label={t({ message: "24H VOL", context: "Market overview" })}
						value={formatUSD(dayNtlVlm, { compact: false })}
					/>
					<StatBlock label={t`OPEN INT`} value={formatUSD(oiUsd, { compact: false })} />
					<FundingStatBlock fundingNum={fundingNum} />
				</>
			)}
			{isSpot && (
				<>
					<StatBlock
						label={t({ message: "24h Change", context: "Market overview" })}
						value={changeText}
						valueClass={change24h === null ? "text-trading-panel-subtle" : getMarketValueColorClass(change24h)}
					/>
					<StatBlock label={t({ message: "24H VOL", context: "Market overview" })} value={spotVolumeText} />
					<StatBlock label={t`Market Cap`} value={spotMarketCapText} />
					<StatBlock
						label={t`Contract`}
						value={createSpotTokenContractValue(spotTokenAddress, copiedSpotTokenAddress, copySpotTokenAddress)}
					/>
				</>
			)}
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

function getMarketValueColorClass(value: number): string {
	if (!Number.isFinite(value) || value === 0) return "text-trading-panel-subtle";
	return value < 0 ? "text-trading-panel-error" : "text-trading-panel-success";
}
