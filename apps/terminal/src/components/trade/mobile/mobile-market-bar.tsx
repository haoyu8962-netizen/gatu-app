import { Tooltip } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { get24hChange, getOiUsd } from "@/domain/market";
import { useOrderbookMidPrice } from "@/hooks/trade/use-orderbook-mid-price";
import { cn } from "@/lib/cn";
import { formatClockDuration, formatNumber, formatPercent, formatUSD, szDecimalsToPriceDecimals } from "@/lib/format";
import {
	type SpotMarketInfo,
	type SubParams,
	type UnifiedMarketInfo,
	useSelectedMarketInfo,
	useSubscription,
} from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useMarketActions } from "@/stores/use-market-store";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import { TokenSelector } from "../chart/token-selector";

type PriceDirection = "up" | "down";

const HOUR_MS = 3_600_000;

interface PriceFlashState {
	sequence: number;
	direction: PriceDirection | null;
}

interface Props {
	className?: string;
}

interface DetailCellProps {
	label: ReactNode;
	tooltipContent?: ReactNode;
	value: ReactNode;
}

type AllMidsParams = SubParams<"allMids">;

export function MobileMarketBar({ className }: Props) {
	const { data: market } = useSelectedMarketInfo();
	const { scope } = useExchangeScope();
	const { setSelectedMarket } = useMarketActions();
	const { resetPrices } = useOrderEntryActions();
	const [expanded, setExpanded] = useState(false);
	const [fundingRemaining, setFundingRemaining] = useState(() => HOUR_MS - (Date.now() % HOUR_MS));

	function handleMarketChange(name: string) {
		setSelectedMarket(scope, name);
		resetPrices();
	}

	const { midPx } = useOrderbookMidPrice(market?.name);
	const isSpot = market?.kind === "spot";
	const perpCoin = market?.name ?? "";
	const spotCoin = getSpotSubscriptionCoin(market);
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

	useEffect(() => {
		if (!expanded) return;
		setFundingRemaining(HOUR_MS - (Date.now() % HOUR_MS));
		const id = setInterval(() => setFundingRemaining(HOUR_MS - (Date.now() % HOUR_MS)), 1000);
		return () => clearInterval(id);
	}, [expanded]);

	const prevDayPx = liveCtx?.prevDayPx ?? market?.prevDayPx;
	const priceDecimals = getPriceDecimals(market);
	const oraclePx = perpCtx?.oraclePx ?? market?.oraclePx;
	const dayNtlVlm = liveCtx?.dayNtlVlm ?? market?.dayNtlVlm;
	const openInterest = perpCtx?.openInterest ?? market?.openInterest;
	const funding = perpCtx?.funding ?? market?.funding;
	const fundingNum = toBig(funding)?.toNumber() ?? 0;
	const change24h = get24hChange(prevDayPx, displayPrice);
	const changeAmount = getPriceChangeAmount(displayPrice, prevDayPx);
	const changeColorClass = getPriceChangeColorClass(change24h);
	const priceText = formatDisplayPrice(displayPrice, priceDecimals);
	const changeAmountText = formatSignedFixed(changeAmount, priceDecimals);
	const changePercentText = formatSignedPercent(change24h);
	const oiUsd = getOiUsd(openInterest, marketMarkPx);

	return (
		<div
			className={cn(
				"shrink-0 w-full max-w-full min-w-0 overflow-hidden bg-surface border-b border-stroke-weak/60",
				className,
			)}
		>
			<div className="min-w-0 px-2 py-1.5 min-[390px]:px-2.5">
				<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(6.75rem,auto)_2rem] items-center gap-1.5 min-[390px]:gap-2">
					<div className="flex min-w-0 items-center gap-1.5 min-[390px]:gap-2">
						<TokenSelector selectedMarket={market} onValueChange={handleMarketChange} />
					</div>

					<div data-boneyard="market-price" className="min-w-0 text-left">
						<div className="flex min-w-0 flex-col items-start gap-1">
							<span
								key={priceFlash.sequence}
								data-direction={priceFlash.direction ?? undefined}
								className={cn(
									"block truncate font-sans text-base leading-none font-normal text-fg tabular-nums",
									priceFlash.direction && "use-color-change",
								)}
								title={priceText}
							>
								{priceText}
							</span>
							<div
								className={cn(
									"truncate font-sans text-xs leading-none tabular-nums",
									changeAmountText === FALLBACK_VALUE_PLACEHOLDER || changePercentText === FALLBACK_VALUE_PLACEHOLDER
										? "invisible text-fg-muted"
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
						className="flex size-8 shrink-0 items-center justify-center rounded-xs border border-stroke-weak bg-fill-weak text-icon hover:bg-fill-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
						aria-expanded={expanded}
						aria-label={expanded ? t`Collapse market details` : t`Expand market details`}
					>
						{expanded ? <CaretUpIcon className="size-4" /> : <CaretDownIcon className="size-4" />}
					</button>
				</div>

				{expanded && (
					<div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 pb-0.5">
						{!isSpot && (
							<>
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
										<span className="inline-flex items-center gap-2">
											<span className={getPriceChangeColorClass(fundingNum)}>
												{formatPercent(fundingNum, { minimumFractionDigits: 4, signDisplay: "exceptZero" })}
											</span>
											<span>{formatClockDuration(fundingRemaining)}</span>
										</span>
									}
								/>
							</>
						)}
						{isSpot && (
							<>
								<DetailCell label={t`Mark`} value={formatDisplayPrice(marketMarkPx ?? midPx, priceDecimals)} />
								<DetailCell label={t`24H VOL`} value={formatUSD(dayNtlVlm, { compact: false })} />
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function DetailCell({ label, tooltipContent, value }: DetailCellProps) {
	return (
		<div className="min-w-0">
			<div className="truncate text-2xs font-medium leading-4 text-fg-muted">
				{tooltipContent ? (
					<Tooltip
						content={<div className="leading-4 break-words">{tooltipContent}</div>}
						side="bottom"
						align="start"
						sideOffset={4}
						arrow={false}
						collisionBoundary={getTooltipCollisionBoundary()}
						collisionPadding={8}
						collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }}
						className="box-border w-[min(20rem,calc(100vw-2rem))] max-w-[var(--available-width)] text-2xs"
					>
						<button
							type="button"
							className="max-w-full cursor-help truncate border-0 bg-transparent p-0 text-left text-current underline decoration-dashed underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
						>
							{label}
						</button>
					</Tooltip>
				) : (
					label
				)}
			</div>
			<div
				className="truncate text-xs font-semibold leading-5 text-fg tabular-nums"
				title={typeof value === "string" ? value : undefined}
			>
				{value}
			</div>
		</div>
	);
}

function getSpotSubscriptionCoin(market: UnifiedMarketInfo | undefined): string {
	if (market?.kind !== "spot") return "";
	return `@${(market as SpotMarketInfo).index}`;
}

function getTooltipCollisionBoundary(): HTMLElement | undefined {
	if (typeof document === "undefined") return undefined;
	return document.body;
}

function getAllMidsCoin(market: UnifiedMarketInfo | undefined): string {
	if (!market) return "";
	if (market.kind === "spot") return `@${(market as SpotMarketInfo).index}`;
	return market.name;
}

function getAllMidsParams(market: UnifiedMarketInfo | undefined): AllMidsParams {
	if (market?.kind !== "builderPerp") return undefined;
	return { dex: market.dex };
}

function getPriceDecimals(market: UnifiedMarketInfo | undefined): number {
	if (!market) return 2;
	return szDecimalsToPriceDecimals(market.szDecimals);
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
	if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return "text-fg-muted";
	return value < 0 ? "text-error" : "text-success";
}
