import { useEffect, useRef, useState } from "react";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { get24hChange } from "@/domain/market";
import { useOrderbookMidPrice } from "@/hooks/trade/use-orderbook-mid-price";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useSelectedMarketInfo } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useMarketActions } from "@/stores/use-market-store";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import { TokenSelector } from "../chart/token-selector";

type PriceDirection = "up" | "down";

interface PriceFlashState {
	sequence: number;
	direction: PriceDirection | null;
}

interface Props {
	className?: string;
}

export function MobileMarketBar({ className }: Props) {
	const { data: market } = useSelectedMarketInfo();
	const { scope } = useExchangeScope();
	const { setSelectedMarket } = useMarketActions();
	const { resetPrices } = useOrderEntryActions();

	function handleMarketChange(name: string) {
		setSelectedMarket(scope, name);
		resetPrices();
	}

	const { midPx } = useOrderbookMidPrice(market?.name);
	const prevDayPx = market?.prevDayPx;

	const [priceFlash, setPriceFlash] = useState<PriceFlashState>({ sequence: 0, direction: null });
	const previousMidPxRef = useRef<number | undefined>(undefined);

	useEffect(() => {
		const previous = previousMidPxRef.current;
		previousMidPxRef.current = midPx;
		if (typeof midPx !== "number" || typeof previous !== "number" || midPx === previous) return;
		setPriceFlash((state) => ({
			sequence: state.sequence + 1,
			direction: midPx > previous ? "up" : "down",
		}));
	}, [midPx]);

	const change24h = get24hChange(prevDayPx, midPx);
	const changeAmount = getPriceChangeAmount(midPx, prevDayPx);
	const changeColorClass = getPriceChangeColorClass(change24h);
	const priceText = formatNumber(midPx, 2);
	const changeAmountText = formatSignedFixed(changeAmount, PRICE_DECIMALS);
	const changePercentText = formatSignedPercent(change24h);
	const maxLeverage = market && "maxLeverage" in market ? market.maxLeverage : undefined;
	const hasLeverage = typeof maxLeverage === "number" && maxLeverage > 0;

	return (
		<div
			className={cn(
				"shrink-0 w-full max-w-full min-w-0 overflow-hidden bg-surface border-b border-stroke-weak/60",
				className,
			)}
		>
			<div className="h-full min-w-0 px-2 py-1.5 min-[390px]:px-2.5 flex items-center justify-between gap-1.5 min-[390px]:gap-2">
				<div className="flex items-center gap-1.5 min-[390px]:gap-2 min-w-0">
					<TokenSelector selectedMarket={market} onValueChange={handleMarketChange} />
					{hasLeverage && (
						<span className="shrink-0 rounded-xs bg-fill-weak px-1.5 py-1 text-xs font-medium leading-none tabular-nums text-fg-muted">
							{maxLeverage}x
						</span>
					)}
				</div>

				<div data-boneyard="market-price" className="relative shrink-0">
					<div className="grid w-[102px] min-[390px]:w-[132px] min-[400px]:w-[148px] grid-cols-[1fr_0px] min-[390px]:grid-cols-[1fr_32px] items-center">
						<div className="min-w-0 text-right">
							<span
								key={priceFlash.sequence}
								data-direction={priceFlash.direction ?? undefined}
								className={cn(
									"block h-7 font-sans text-lg leading-7 font-medium text-fg tabular-nums",
									priceFlash.direction && "use-color-change",
								)}
							>
								{priceText}
							</span>
							<div
								className={cn(
									"h-4 font-sans text-2xs leading-4 tabular-nums",
									changeAmountText === FALLBACK_VALUE_PLACEHOLDER || changePercentText === FALLBACK_VALUE_PLACEHOLDER
										? "invisible text-fg-muted"
										: changeColorClass,
								)}
							>
								{changeAmountText !== FALLBACK_VALUE_PLACEHOLDER && changePercentText !== FALLBACK_VALUE_PLACEHOLDER
									? `${changeAmountText} / ${changePercentText}`
									: "0.00 / 0.00%"}
							</div>
						</div>
						<div className="h-8 w-0 min-[390px]:w-8" aria-hidden="true" />
					</div>
				</div>
			</div>
		</div>
	);
}

const PRICE_DECIMALS = 2;

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
