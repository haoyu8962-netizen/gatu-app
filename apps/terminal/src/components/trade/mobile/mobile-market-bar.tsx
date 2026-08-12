import { t } from "@lingui/core/macro";
import { ArrowSquareOutIcon, CaretDownIcon, CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { type PointerEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { get24hChange, getMarketCapUsd, getOiUsd } from "@/domain/market";
import { getSpotAssetSocials, hasSpotSocialLinks, type SpotAssetSocials } from "@/domain/market/spot-asset-info";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
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
	type SubParams,
	type UnifiedMarketInfo,
	useSelectedMarketInfo,
	useSubscription,
} from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { toBig } from "@/lib/trade/numbers";
import { TokenSelector } from "../chart/token-selector";
import { MarketAssetInfo } from "../components/market-asset-info";
import { SpotMarketSocialIconLinks } from "../components/spot-market-social-links";

type PriceDirection = "up" | "down";

const HOUR_MS = 3_600_000;
const TOOLTIP_WIDTH_PX = 320;
const TOOLTIP_VIEWPORT_PADDING_PX = 16;
const TOOLTIP_SIDE_OFFSET_PX = 4;
const TOOLTIP_ESTIMATED_HEIGHT_PX = 144;

interface PriceFlashState {
	sequence: number;
	direction: PriceDirection | null;
}

interface Props {
	className?: string;
}

interface DetailCellProps {
	label: ReactNode;
	multiline?: boolean;
	tooltipContent?: ReactNode;
	value: ReactNode;
}

interface TooltipPosition {
	left: number;
	top: number;
	width: number;
}

type AllMidsParams = SubParams<"allMids">;

export function MobileMarketBar({ className }: Props) {
	useNumberFormatRevision();
	const { data: market } = useSelectedMarketInfo();
	const navigateToMarket = useMarketNavigation();
	const { copied: copiedSpotTokenAddress, copy: copySpotTokenAddress } = useCopyToClipboard(1500);
	const [expanded, setExpanded] = useState(false);
	const [fundingRemaining, setFundingRemaining] = useState(() => HOUR_MS - (Date.now() % HOUR_MS));

	function handleMarketChange(name: string, nextMarket?: UnifiedMarketInfo) {
		navigateToMarket(name, nextMarket);
	}

	const { midPx } = useOrderbookMidPrice(market?.name);
	const isSpot = market?.kind === "spot";
	const perpCoin = getMarketApiCoin(market);
	const spotCoin = getSpotMarketApiCoin(market);
	const midsCoin = getAllMidsCoin(market);
	const { data: allMidsEvent } = useSubscription("allMids", getAllMidsParams(market), { enabled: !!midsCoin });
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

	const [priceFlash, setPriceFlash] = useState<PriceFlashState>({ sequence: 0, direction: null });
	const previousMidPxRef = useRef<number | undefined>(undefined);

	const liveCtx = isSpot ? spotCtxEvent?.ctx : perpCtxEvent?.ctx;
	const perpCtx = isSpot ? undefined : perpCtxEvent?.ctx;
	const midsPrice = midsCoin ? allMidsEvent?.mids?.[midsCoin] : undefined;
	const marketMarkPx = perpCtx?.markPx ?? market?.markPx;
	const displayPrice = midPx ?? midsPrice ?? liveCtx?.markPx ?? marketMarkPx;
	const displayPriceNumber = toBig(displayPrice)?.toNumber();

	useEffect(() => {
		const previous = previousMidPxRef.current;
		previousMidPxRef.current = displayPriceNumber;
		if (typeof displayPriceNumber !== "number" || typeof previous !== "number" || displayPriceNumber === previous) {
			return;
		}
		setPriceFlash((state) => ({
			sequence: state.sequence + 1,
			direction: displayPriceNumber > previous ? "up" : "down",
		}));
	}, [displayPriceNumber]);

	const prevDayPx = liveCtx?.prevDayPx ?? market?.prevDayPx;
	const priceDecimals = getPriceDecimals(market);
	const oraclePx = perpCtx?.oraclePx ?? market?.oraclePx;
	const dayNtlVlm = liveCtx?.dayNtlVlm ?? market?.dayNtlVlm;
	const openInterest = perpCtx?.openInterest ?? market?.openInterest;
	const funding = perpCtx?.funding ?? market?.funding;
	const spotMarkPx = isSpot ? (spotCtxEvent?.ctx?.markPx ?? market?.markPx ?? midPx ?? midsPrice) : undefined;
	const spotCirculatingSupply = isSpot
		? (spotCtxEvent?.ctx?.circulatingSupply ?? getSpotCirculatingSupply(market))
		: null;
	const fundingNum = toBig(funding)?.toNumber() ?? null;
	const shouldRunFundingCountdown = expanded && !isSpot && fundingNum !== null;
	useEffect(() => {
		if (!shouldRunFundingCountdown) return;
		setFundingRemaining(HOUR_MS - (Date.now() % HOUR_MS));
		const id = setInterval(() => setFundingRemaining(HOUR_MS - (Date.now() % HOUR_MS)), 1000);
		return () => clearInterval(id);
	}, [shouldRunFundingCountdown]);
	const change24h = get24hChange(prevDayPx, displayPrice);
	const changeAmount = getPriceChangeAmount(displayPrice, prevDayPx);
	const changeColorClass = getPriceChangeColorClass(change24h);
	const priceText = formatDisplayPrice(displayPrice, priceDecimals);
	const changeAmountText = formatSignedFixed(changeAmount, priceDecimals);
	const changePercentText = formatSignedPercent(change24h);
	const oiUsd = getOiUsd(openInterest, marketMarkPx);
	const spotMarketCap = getMarketCapUsd(spotCirculatingSupply, spotMarkPx);
	const spotTokenAddress = getSpotTokenAddress(market);
	const spotSocials = getSpotAssetSocials(market);
	const spotQuoteToken =
		market?.kind === "spot" ? (market.tokensInfo[1]?.displayName ?? market.tokensInfo[1]?.name ?? "USDC") : "USDC";
	const spotVolumeText = formatQuoteAmount(dayNtlVlm, spotQuoteToken, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	const spotMarketCapText = formatQuoteAmount(spotMarketCap, spotQuoteToken, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	});

	return (
		<div
			className={cn(
				"w-full max-w-full min-w-0 shrink-0 overflow-hidden border-b border-trading-panel-stroke-row bg-surface font-market-close text-trading-panel-fg",
				className,
			)}
		>
			<div className="min-w-0">
				<div className="grid min-h-[61px] min-w-0 grid-cols-2 items-center gap-x-4 px-4 py-2.5 max-[360px]:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] max-[360px]:gap-x-1 max-[360px]:px-2.5">
					<div className="flex min-w-0 items-center gap-0">
						<div className="flex shrink-0 [&>span]:size-11 [&_button]:size-11 [&_.relative.inline-flex]:size-7">
							<MarketAssetInfo key={market?.name} market={market} />
						</div>
						<TokenSelector selectedMarket={market} onValueChange={handleMarketChange} showAssetIcon={false} />
					</div>

					<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_36px] items-center gap-2 overflow-visible max-[360px]:gap-1">
						<div data-boneyard="market-price" className="min-w-0 text-left">
							<div className="flex min-w-0 flex-col items-start">
								<span
									key={priceFlash.sequence}
									data-direction={priceFlash.direction ?? undefined}
									className={cn(
										"block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[18px] leading-[22px] font-bold text-trading-panel-fg tabular-nums max-[360px]:text-base max-[360px]:leading-5",
										priceFlash.direction && "use-color-change",
									)}
									title={priceText}
								>
									{priceText}
								</span>
								<div
									className={cn(
										"max-w-full whitespace-normal text-[11px] leading-[15px] font-semibold tabular-nums",
										changeAmountText === FALLBACK_VALUE_PLACEHOLDER || changePercentText === FALLBACK_VALUE_PLACEHOLDER
											? "invisible text-trading-panel-subtle"
											: changeColorClass,
									)}
									title={`${changeAmountText} / ${changePercentText}`}
								>
									{changeAmountText !== FALLBACK_VALUE_PLACEHOLDER && changePercentText !== FALLBACK_VALUE_PLACEHOLDER
										? `${changeAmountText} / ${changePercentText}`
										: "0.00 / 0.00%"}
								</div>
							</div>
						</div>

						<button
							type="button"
							onClick={() => setExpanded((value) => !value)}
							className={cn(
								"relative flex h-[30px] w-9 shrink-0 items-center justify-center rounded-[8px] border bg-transparent after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:bg-trading-panel-hover active:bg-fill-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
								expanded
									? "border-trading-panel-control text-trading-panel-fg"
									: "border-trading-panel-stroke-input text-trading-panel-muted",
							)}
							aria-expanded={expanded}
							aria-label={expanded ? t`Collapse market details` : t`Expand market details`}
						>
							<CaretDownIcon
								className={cn(
									"size-3.5 transition-transform duration-200 ease-out motion-reduce:transition-none",
									expanded && "rotate-180",
								)}
							/>
						</button>
					</div>
				</div>

				{expanded && (
					<div className="mx-4 border-t border-trading-panel-stroke-row">
						{!isSpot && (
							<>
								<div className="grid grid-cols-2 gap-x-4 py-2.5">
									<DetailCell
										label={
											<>
												{t`Mark`}/{t`ORACLE`}
											</>
										}
										tooltipContent={t`Mark price: used for margin calculations, unrealized PnL, liquidations, and triggering TP/SL orders. Oracle price: reference price for funding payments. See the HIP-3 deployer's documentation for details.`}
										value={`${formatDisplayPrice(marketMarkPx, priceDecimals)} / ${formatDisplayPrice(oraclePx, priceDecimals)}`}
									/>
									<DetailCell label={t`24H VOL`} value={formatUSD(dayNtlVlm, { compact: false })} />
								</div>
								<div className="grid grid-cols-2 gap-x-4 border-t border-trading-panel-stroke-row pt-2.5 pb-3.5">
									<DetailCell
										label={t`OPEN INT`}
										tooltipContent={t`Two-sided open interest: the sum of long and short positions on this contract.`}
										value={formatUSD(oiUsd, { compact: false })}
									/>
									<DetailCell
										label={
											<>
												{t`FUNDING`}/{t`Resets in`}
											</>
										}
										tooltipContent={t`Hourly rate paid by longs to shorts (if negative, shorts pay longs). Funding has no associated fee; it is a peer-to-peer transfer between users to push the price toward the spot price. See the documentation for details.`}
										value={
											fundingNum === null ? (
												FALLBACK_VALUE_PLACEHOLDER
											) : (
												<span className="inline-flex items-center gap-2">
													<span className={getPriceChangeColorClass(fundingNum)}>
														{formatPercent(fundingNum, {
															minimumFractionDigits: 4,
															signDisplay: "exceptZero",
														})}
													</span>
													<span>{formatClockDuration(fundingRemaining)}</span>
												</span>
											)
										}
									/>
								</div>
							</>
						)}
						{isSpot && (
							<>
								<div className="grid grid-cols-2 gap-x-4 py-2.5">
									<DetailCell label={t`Price`} value={formatDisplayPrice(displayPrice, priceDecimals)} />
									<DetailCell label={t`24H VOL`} value={spotVolumeText} />
								</div>
								<div className="grid grid-cols-2 gap-x-4 border-t border-trading-panel-stroke-row pt-2.5 pb-3.5">
									<DetailCell label={t`Market Cap`} value={spotMarketCapText} />
									<DetailCell
										label={t`More Info`}
										value={createSpotTokenInfo(
											spotTokenAddress,
											copiedSpotTokenAddress,
											copySpotTokenAddress,
											spotSocials,
										)}
										multiline
									/>
								</div>
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function createSpotTokenInfo(
	address: string | null,
	copied: boolean,
	onCopy: (value: string) => void,
	socials: SpotAssetSocials | null,
) {
	if (!address && !hasSpotSocialLinks(socials)) return FALLBACK_VALUE_PLACEHOLDER;

	function handleCopy() {
		if (!address) return;
		onCopy(address);
	}

	return (
		<span data-slot="mobile-spot-token-info" className="flex min-w-0 max-w-full flex-col items-start">
			{address ? (
				<span className="block min-w-0 max-w-20 truncate text-[12px] font-semibold tabular-nums" title={address}>
					{shortenAddress(address, 4, 4)}
				</span>
			) : null}
			<span data-slot="mobile-spot-token-actions" className="flex min-w-0 max-w-full flex-wrap items-center">
				{address ? (
					<>
						<a
							href={getExplorerTokenUrl(address)}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={t`Open token in explorer`}
							className="inline-flex size-11 shrink-0 items-center justify-center rounded-[7px] text-trading-panel-muted transition-colors duration-150 hover:bg-trading-panel-hover hover:text-trading-panel-fg active:bg-fill-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus motion-reduce:transition-none"
						>
							<ArrowSquareOutIcon className="size-3" aria-hidden="true" />
						</a>
						<button
							type="button"
							onClick={handleCopy}
							aria-label={copied ? t`Copied` : t`Copy token address`}
							className="inline-flex size-11 shrink-0 items-center justify-center rounded-[7px] text-trading-panel-muted transition-colors duration-150 hover:bg-trading-panel-hover hover:text-trading-panel-fg active:bg-fill-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus motion-reduce:transition-none"
						>
							{copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
						</button>
					</>
				) : null}
				<SpotMarketSocialIconLinks socials={socials} showTooltips={false} targetSize="touch" />
			</span>
		</span>
	);
}

function DetailCell({ label, multiline = false, tooltipContent, value }: DetailCellProps) {
	const triggerRef = useRef<HTMLButtonElement>(null);
	const tooltipId = useId();
	const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);

	function openTooltip() {
		const trigger = triggerRef.current;
		if (!trigger || typeof window === "undefined") return;

		const rect = trigger.getBoundingClientRect();
		const maxWidth = Math.max(0, window.innerWidth - TOOLTIP_VIEWPORT_PADDING_PX * 2);
		const width = Math.min(TOOLTIP_WIDTH_PX, maxWidth);
		const left = Math.min(
			Math.max(TOOLTIP_VIEWPORT_PADDING_PX, rect.left),
			Math.max(TOOLTIP_VIEWPORT_PADDING_PX, window.innerWidth - width - TOOLTIP_VIEWPORT_PADDING_PX),
		);
		const belowTop = rect.bottom + TOOLTIP_SIDE_OFFSET_PX;
		const aboveTop = rect.top - TOOLTIP_ESTIMATED_HEIGHT_PX - TOOLTIP_SIDE_OFFSET_PX;
		const top =
			belowTop + TOOLTIP_ESTIMATED_HEIGHT_PX > window.innerHeight - TOOLTIP_VIEWPORT_PADDING_PX
				? Math.max(TOOLTIP_VIEWPORT_PADDING_PX, aboveTop)
				: belowTop;

		setTooltipPosition({
			left,
			top,
			width,
		});
	}

	function closeTooltip() {
		setTooltipPosition(null);
	}

	function handlePointerEnter(event: PointerEvent<HTMLButtonElement>) {
		if (!isHoverPointer(event.pointerType)) return;
		openTooltip();
	}

	function handlePointerLeave(event: PointerEvent<HTMLButtonElement>) {
		if (!isHoverPointer(event.pointerType)) return;
		closeTooltip();
	}

	function handleTooltipClick() {
		if (tooltipPosition) {
			closeTooltip();
			return;
		}
		openTooltip();
	}

	useEffect(() => {
		if (!tooltipPosition || typeof document === "undefined" || typeof window === "undefined") return;

		function closeOpenTooltip() {
			setTooltipPosition(null);
		}

		function handlePointerDown(event: globalThis.PointerEvent) {
			const trigger = triggerRef.current;
			if (trigger?.contains(event.target as Node)) return;
			closeOpenTooltip();
		}

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") closeOpenTooltip();
		}

		document.addEventListener("pointerdown", handlePointerDown, true);
		document.addEventListener("keydown", handleKeyDown);
		window.addEventListener("scroll", closeOpenTooltip, true);
		window.addEventListener("resize", closeOpenTooltip);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown, true);
			document.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("scroll", closeOpenTooltip, true);
			window.removeEventListener("resize", closeOpenTooltip);
		};
	}, [tooltipPosition]);

	return (
		<div className="min-w-0">
			<div className="text-[10px] leading-4 text-trading-panel-subtle">
				{tooltipContent ? (
					<>
						<button
							ref={triggerRef}
							type="button"
							onPointerEnter={handlePointerEnter}
							onPointerLeave={handlePointerLeave}
							onBlur={closeTooltip}
							onClick={handleTooltipClick}
							aria-describedby={tooltipPosition ? tooltipId : undefined}
							className="relative inline-flex max-w-full cursor-help border-0 border-b border-dashed border-trading-panel-stroke-control bg-transparent p-0 text-left text-current after:absolute after:top-1/2 after:left-1/2 after:h-11 after:min-w-11 after:w-full after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
						>
							<span className="truncate">{label}</span>
						</button>
						{tooltipPosition && createMarketDetailTooltip(tooltipId, tooltipContent, tooltipPosition)}
					</>
				) : (
					label
				)}
			</div>
			<div
				className={cn(
					"text-[13px] leading-5 font-semibold text-trading-panel-fg tabular-nums",
					multiline ? "whitespace-normal" : "truncate",
				)}
				title={typeof value === "string" ? value : undefined}
			>
				{value}
			</div>
		</div>
	);
}

function isHoverPointer(pointerType: string): boolean {
	return pointerType === "mouse" || pointerType === "pen";
}

function createMarketDetailTooltip(id: string, content: ReactNode, position: TooltipPosition) {
	if (typeof document === "undefined") return null;

	return createPortal(
		<div
			id={id}
			role="tooltip"
			className="fixed z-[var(--z-tooltip)] box-border rounded-xs border border-stroke-weak bg-overlay px-3 py-2 text-2xs leading-4 text-fg shadow-overlay"
			style={{ left: position.left, top: position.top, width: position.width }}
		>
			{content}
		</div>,
		document.body,
	);
}

function getSpotCirculatingSupply(market: UnifiedMarketInfo | undefined): string | number | null | undefined {
	if (market?.kind !== "spot") return null;
	return (market as SpotMarketInfo).circulatingSupply;
}

function getSpotTokenAddress(market: UnifiedMarketInfo | undefined): string | null {
	if (market?.kind !== "spot") return null;
	const baseToken = market.tokensInfo[0];
	if (!baseToken) return null;
	const tokenId = (baseToken as { tokenId?: string }).tokenId;
	if (!tokenId?.startsWith("0x")) return null;
	return tokenId;
}

function getAllMidsCoin(market: UnifiedMarketInfo | undefined): string {
	return getMarketApiCoin(market);
}

function getAllMidsParams(market: UnifiedMarketInfo | undefined): AllMidsParams {
	if (market?.kind !== "builderPerp") return undefined;
	return { dex: market.dex };
}

function getPriceDecimals(market: UnifiedMarketInfo | undefined): number {
	if (!market) return 2;
	return szDecimalsToPriceDecimals(market.szDecimals, market.kind === "spot" ? "spot" : "perp");
}

function formatDisplayPrice(value: string | number | null | undefined, decimals: number): string {
	return formatNumber(value, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});
}

function getPriceChangeAmount(
	price: string | number | null | undefined,
	prevDayPx: string | number | null | undefined,
) {
	const current = toBig(price);
	const previous = toBig(prevDayPx);
	if (!current || !previous) return null;
	return current.minus(previous);
}

function formatSignedFixed(value: ReturnType<typeof getPriceChangeAmount>, decimals: number): string {
	if (!value) return FALLBACK_VALUE_PLACEHOLDER;
	const rounded = value.round(decimals);
	if (rounded.eq(0)) return rounded.toFixed(decimals);
	const sign = rounded.gt(0) ? "+" : "";
	return `${sign}${rounded.toFixed(decimals)}`;
}

function formatSignedPercent(value: number | null): string {
	if (typeof value !== "number" || !Number.isFinite(value)) return FALLBACK_VALUE_PLACEHOLDER;
	if (Math.abs(value) < 0.005) return "0.00%";
	const sign = value > 0 ? "+" : "";
	return `${sign}${value.toFixed(2)}%`;
}

function getPriceChangeColorClass(value: number | null): string {
	if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return "text-trading-panel-subtle";
	return value < 0 ? "text-trading-panel-error" : "text-trading-panel-success";
}
