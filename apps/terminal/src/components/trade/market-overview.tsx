import { Tooltip } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { ArrowSquareOutIcon, CheckIcon, CopyIcon, FireIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { get24hChange, get24hPriceChange, getMarketCapUsd, getOiUsd } from "@/domain/market";
import { useOrderbookMidPrice } from "@/hooks/trade/use-orderbook-mid-price";
import { useCopyToClipboard } from "@/hooks/ui/use-copy-to-clipboard";
import { cn } from "@/lib/cn";
import {
	formatClockDuration,
	formatNumber,
	formatPercent,
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
import { getValueColorClass } from "@/lib/ui/value-color";
import { StatBlock } from "./chart/stat-block";

const HOUR_MS = 3_600_000;

function FundingTooltipContent({ fundingNum }: { fundingNum: number }) {
	const [remaining, setRemaining] = useState(() => HOUR_MS - (Date.now() % HOUR_MS));

	useEffect(() => {
		const id = setInterval(() => setRemaining(HOUR_MS - (Date.now() % HOUR_MS)), 1000);
		return () => clearInterval(id);
	}, []);

	const rows = [
		{ label: t`7 days`, rate: fundingNum * 24 * 7 },
		{ label: t`30 days`, rate: fundingNum * 24 * 30 },
		{ label: t`1 year`, rate: fundingNum * 24 * 365 },
	];

	return (
		<div className="min-w-[9rem] space-y-2">
			<div className="flex items-center justify-between gap-4">
				<span className="text-2xs uppercase tracking-wide text-fg-muted">{t`Resets in`}</span>
				<span className="font-mono text-xs tabular-nums text-fg">{formatClockDuration(remaining)}</span>
			</div>
			<div className="border-t border-stroke-weak pt-2 space-y-1.5">
				{rows.map(({ label, rate }) => (
					<div key={label} className="flex items-center justify-between gap-4">
						<span className="text-2xs text-fg-muted">{label}</span>
						<span className={cn("text-xs font-medium tabular-nums", getValueColorClass(rate))}>
							{formatPercent(rate, { signDisplay: "exceptZero" })}
						</span>
					</div>
				))}
			</div>
		</div>
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

	const fundingNum = toBig(funding)?.toNumber() ?? 0;
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
			? `${formatNumber(dayNtlVlm, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${quoteToken}`
			: "—";
	const spotMarketCapText =
		spotMarketCap != null
			? `${formatNumber(spotMarketCap, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${quoteToken}`
			: "—";

	return (
		<div className="grid h-11 w-max min-w-0 auto-cols-max grid-flow-col items-center gap-8 text-xs">
			<StatBlock label={t`Price`} value={priceText} valueClass="text-fg" />
			<StatBlock
				label={t({ message: "24h Change", context: "Market overview" })}
				value={changeText}
				valueClass={change24h === null ? "text-fg-muted" : getValueColorClass(change24h)}
			/>

			{!isSpot && (
				<>
					<StatBlock label={t`ORACLE`} value={formatUSD(oraclePx)} />
					<StatBlock
						label={t({ message: "24H VOL", context: "Market overview" })}
						value={formatUSD(dayNtlVlm, { compact: false })}
					/>
					<StatBlock label={t`OPEN INT`} value={formatUSD(oiUsd, { compact: false })} />
					<Tooltip content={<FundingTooltipContent fundingNum={fundingNum} />} side="bottom">
						<span>
							<StatBlock
								label={t`FUNDING`}
								value={formatPercent(fundingNum, {
									minimumFractionDigits: 4,
									signDisplay: "exceptZero",
								})}
								valueClass={cn(
									"underline decoration-dashed underline-offset-2 cursor-pointer",
									getValueColorClass(fundingNum),
								)}
								icon={<FireIcon className={cn("size-2.5 shrink-0", getValueColorClass(fundingNum))} />}
							/>
						</span>
					</Tooltip>
				</>
			)}
			{isSpot && (
				<>
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
				className="inline-flex items-center gap-0.5 font-sans text-xs font-medium tabular-nums text-fg transition-colors hover:text-brand"
				aria-label={t`Open token in explorer`}
			>
				{shortenAddress(address, 4, 4)}
				<ArrowSquareOutIcon className="size-2.5 shrink-0 text-brand" aria-hidden="true" />
			</a>
			<button
				type="button"
				onClick={handleCopy}
				aria-label={copied ? t`Copied` : t`Copy token address`}
				className="inline-flex size-3.5 shrink-0 items-center justify-center text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
			>
				{copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
			</button>
		</span>
	);
}
