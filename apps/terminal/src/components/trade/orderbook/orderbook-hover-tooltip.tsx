import { Tooltip } from "@base-ui/react/tooltip";
import { useLingui } from "@lingui/react/macro";
import { tooltipPopupVariants } from "@sairn/ui";
import { isLiveMarkPriceReady } from "@/domain/trade/market-price";
import type { OrderbookHoverController } from "@/hooks/trade/use-orderbook-hover";
import { cn } from "@/lib/cn";
import { formatNumber, szDecimalsToPriceDecimals } from "@/lib/format";
import { useMarketsInfo } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { getOrderbookQuoteDecimals } from "@/lib/trade/orderbook";
import { getOrderbookHoverPriceDecimals, getOrderbookHoverSummary } from "@/lib/trade/orderbook-hover";

interface Props {
	hover: OrderbookHoverController;
	marketName: string;
	baseAsset: string;
	quoteAsset: string;
	szDecimals: number;
	priceDecimals: number;
}

export function OrderbookHoverTooltip({ hover, marketName, baseAsset, quoteAsset, szDecimals, priceDecimals }: Props) {
	const { t } = useLingui();
	useNumberFormatRevision();
	const { getMarketByName } = useMarketsInfo();
	const market = getMarketByName(marketName);
	const referencePrice =
		market && isLiveMarkPriceReady(market.markPriceStatus, market.midPx ?? undefined, market.midPriceReceivedAt)
			? (market.midPx ?? undefined)
			: undefined;
	const summary = hover.activeLevel ? getOrderbookHoverSummary(hover.activeLevel, referencePrice) : undefined;
	const averageDecimals = getOrderbookHoverPriceDecimals(
		summary?.averagePrice,
		market ? szDecimalsToPriceDecimals(szDecimals, market.kind === "spot" ? "spot" : "perp") : priceDecimals,
	);
	if (!summary) return null;
	const entries = [
		[
			"distance",
			t`Distance from mid`,
			summary.distancePercent === undefined
				? "—"
				: `${formatNumber(summary.distancePercent, { decimals: 4, compact: false })}%`,
		],
		[
			"average",
			t`Average Price`,
			summary.averagePrice === undefined
				? "—"
				: formatNumber(summary.averagePrice, { decimals: averageDecimals, compact: false }),
		],
		["base", `${t`Total`} (${baseAsset})`, formatNumber(summary.total, { decimals: szDecimals, compact: false })],
		[
			"quote",
			`${t`Total`} (${quoteAsset})`,
			formatNumber(summary.quoteTotal, {
				decimals: quoteAsset === "USDC" ? 0 : getOrderbookQuoteDecimals(summary.quoteTotal),
				compact: false,
			}),
		],
	];

	return (
		<Tooltip.Root open disableHoverablePopup>
			<Tooltip.Portal>
				<Tooltip.Positioner
					anchor={hover.anchor}
					positionMethod="fixed"
					side="left"
					align="center"
					sideOffset={8}
					collisionPadding={10}
					className="pointer-events-none z-[var(--z-tooltip)] data-[anchor-hidden]:hidden"
				>
					<Tooltip.Popup
						id={hover.tooltipId}
						role="tooltip"
						data-slot="orderbook-cumulative-tooltip"
						className={cn(tooltipPopupVariants(), "pointer-events-none w-[228px] max-w-[calc(100vw-20px)]")}
					>
						<dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 tabular-nums">
							{entries.map(([id, label, value]) => (
								<div key={id} className="contents">
									<dt>{label}</dt>
									<dd className="text-right font-medium">{value}</dd>
								</div>
							))}
						</dl>
					</Tooltip.Popup>
				</Tooltip.Positioner>
			</Tooltip.Portal>
		</Tooltip.Root>
	);
}
