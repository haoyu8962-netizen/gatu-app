import { Dropdown, Tabs, TabsContent, TabsList, TabsTrigger } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { BookBookmarkIcon, ListDashesIcon } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { getBaseQuoteFromPairName } from "@/domain/market";
import { useOrderbookHover } from "@/hooks/trade/use-orderbook-hover";
import { useOrderbookLevelPulses } from "@/hooks/trade/use-orderbook-level-pulses";
import { useOrderbookMidPrice } from "@/hooks/trade/use-orderbook-mid-price";
import { formatNumber, szDecimalsToPriceDecimals } from "@/lib/format";
import { useHyperliquid, useSelectedMarketInfo, useSubscription } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { useRenderCommitTrack } from "@/lib/performance/render-profile";
import { toNumber } from "@/lib/trade/numbers";
import {
	getL2BookSubscriptionParams,
	getPriceGroupingKey,
	getPriceGroupingOptions,
	getRawSpreadInfo,
	getSideMaxTotal,
	getSnapshotPriceDecimals,
	processLevels,
} from "@/lib/trade/orderbook";
import { getOrderbookLadderStyle, getOrderbookPlaceholderKeys } from "@/lib/ui/orderbook-layout";
import { useSizeMode } from "@/stores/use-order-entry-store";
import { OrderbookHoverTooltip } from "./orderbook-hover-tooltip";
import { OrderbookPlaceholderRow } from "./orderbook-placeholder-row";
import { OrderbookRow } from "./orderbook-row";
import { TradesPanel } from "./trades-panel";
import { useOrderbookRows } from "./use-orderbook-rows";

export function OrderbookPanel() {
	useNumberFormatRevision();
	const { t } = useLingui();
	const { env } = useHyperliquid();
	useRenderCommitTrack("orderbook");
	const [selectedOptionKey, setSelectedOptionKey] = useState<string | null>(null);
	const sizeMode = useSizeMode();
	const showOrderbookInQuote = sizeMode === "quote";
	const [{ rowCount: visibleRows, fullRowCount, rowHeightPx }, orderbookContainerRef] = useOrderbookRows();
	const [tab, setTab] = useState("book");

	const { data: selectedMarket } = useSelectedMarketInfo();
	const markPx = toNumber(selectedMarket?.markPx);
	const szDecimals = selectedMarket?.szDecimals ?? 4;
	const marketType = selectedMarket?.kind === "spot" ? "spot" : "perp";
	const maxPriceDecimals = szDecimalsToPriceDecimals(szDecimals, marketType);
	const priceGroupingOptions = useMemo(
		() => getPriceGroupingOptions(markPx ?? undefined, maxPriceDecimals),
		[markPx, maxPriceDecimals],
	);
	const selectedOption = useMemo(
		() => priceGroupingOptions.find((option) => option.key === selectedOptionKey) ?? priceGroupingOptions[0] ?? null,
		[priceGroupingOptions, selectedOptionKey],
	);
	const subscriptionParams = useMemo(
		() => getL2BookSubscriptionParams(selectedMarket?.name ?? "", selectedOption),
		[selectedMarket?.name, selectedOption],
	);

	const {
		data: orderbook,
		isStale: orderbookIsStale,
		status: orderbookStatus,
	} = useSubscription("l2Book", subscriptionParams, {
		enabled: !!selectedMarket?.name,
	});
	const { midPx: bboMidPx } = useOrderbookMidPrice(selectedMarket?.name);
	const hasCurrentSnapshot =
		orderbookStatus === "active" && !orderbookIsStale && !!orderbook && orderbook.coin === subscriptionParams.coin;
	const currentOrderbook = hasCurrentSnapshot ? orderbook : undefined;

	const { baseToken, quoteToken } = useMemo(() => {
		if (!selectedMarket) return { baseToken: "", quoteToken: "" };
		return getBaseQuoteFromPairName(selectedMarket.pairName, selectedMarket.kind);
	}, [selectedMarket]);

	const bids = useMemo(
		() => processLevels(currentOrderbook?.levels[0], visibleRows),
		[currentOrderbook?.levels, visibleRows],
	);
	const asks = useMemo(
		() => processLevels(currentOrderbook?.levels[1], visibleRows),
		[currentOrderbook?.levels, visibleRows],
	);
	const asksReversed = useMemo(() => {
		const reversed = new Array(asks.length);
		for (let i = 0; i < asks.length; i += 1) {
			reversed[i] = asks[asks.length - 1 - i];
		}
		return reversed;
	}, [asks]);
	const bidMaxTotal = useMemo(() => getSideMaxTotal(bids, showOrderbookInQuote), [bids, showOrderbookInQuote]);
	const askMaxTotal = useMemo(() => getSideMaxTotal(asks, showOrderbookInQuote), [asks, showOrderbookInQuote]);
	const fallbackPriceDecimals = selectedOption?.decimals ?? maxPriceDecimals;
	const priceDecimals = useMemo(
		() => getSnapshotPriceDecimals(currentOrderbook?.levels, fallbackPriceDecimals),
		[currentOrderbook?.levels, fallbackPriceDecimals],
	);
	const spreadInfo = useMemo(
		() =>
			getRawSpreadInfo(currentOrderbook?.levels, {
				bboMid: bboMidPx,
				eventSpread: currentOrderbook?.spread,
			}),
		[bboMidPx, currentOrderbook?.levels, currentOrderbook?.spread],
	);
	const spreadText = spreadInfo
		? `${formatNumber(spreadInfo.spread, priceDecimals)} (${formatNumber(spreadInfo.spreadPct, 3)}%)`
		: "—";
	const flashResetKey = `${env}:${subscriptionParams.coin}:${getPriceGroupingKey(subscriptionParams)}:l2Book-full`;
	const visiblePulseLevels = useMemo(
		() => [
			...asks
				.slice(0, fullRowCount)
				.reverse()
				.map((level) => ({ side: "ask" as const, price: level.price })),
			...bids.slice(0, fullRowCount).map((level) => ({ side: "bid" as const, price: level.price })),
		],
		[asks, bids, fullRowCount],
	);
	const { panelRef, getPulse, onAnimationEnd } = useOrderbookLevelPulses({
		identity: flashResetKey,
		snapshot: currentOrderbook,
		visibleLevels: visiblePulseLevels,
		viewKey: `desktop:${tab}:${fullRowCount}`,
		active: tab === "book" && hasCurrentSnapshot && fullRowCount > 0,
	});

	const hoverRootRef = useRef<HTMLDivElement>(null);
	const hover = useOrderbookHover({
		identity: flashResetKey,
		viewKey: `desktop:${tab}:${fullRowCount}:${rowHeightPx}`,
		enabled: tab === "book" && hasCurrentSnapshot && fullRowCount > 0,
		bids,
		asks,
		rootRef: hoverRootRef,
	});

	const displayAsset = showOrderbookInQuote ? quoteToken : baseToken;

	const hasFailure = orderbookStatus === "error" || orderbookIsStale;

	const dropdownItems = priceGroupingOptions.map((option) => ({
		label: option.label,
		active: option.key === selectedOption?.key,
		onSelect: () => setSelectedOptionKey(getPriceGroupingKey(option)),
	}));

	return (
		<Tabs
			ref={panelRef}
			value={tab}
			onValueChange={setTab}
			className="orderbook-panel-container h-full min-h-0 flex flex-col overflow-hidden bg-surface"
			fullWidth
			size="sm"
			variant="underline"
		>
			<div className="flex items-center justify-between">
				<TabsList className="w-full min-w-0">
					<TabsTrigger
						value="book"
						aria-label={t`Order Book`}
						icon={<BookBookmarkIcon className="size-3.5 shrink-0" />}
						className="min-w-0"
					>
						<span className="orderbook-tab-label min-w-0 truncate">{t`Order Book`}</span>
					</TabsTrigger>
					<TabsTrigger
						value="trades"
						aria-label={t`Recent Trades`}
						icon={<ListDashesIcon className="size-3.5 shrink-0" />}
						className="min-w-0"
					>
						<span className="orderbook-tab-label min-w-0 truncate">{t`Trades`}</span>
					</TabsTrigger>
				</TabsList>
			</div>

			<TabsContent
				value="book"
				ref={hoverRootRef}
				{...hover.containerProps}
				aria-busy={!hasCurrentSnapshot && !hasFailure}
				className="flex-1 min-h-0 mt-0 pt-0 flex flex-col"
			>
				<div className="orderbook-grid grid gap-1 px-2 py-1.5 items-center text-xs orderbook-header-text border-b border-stroke-weak shrink-0">
					<div className="min-w-0 flex items-center gap-1 overflow-hidden">
						<span className="orderbook-price-heading shrink-0">{t`Price`}</span>
						<Dropdown
							trigger={
								<span className="block min-w-0 truncate text-xs tabular-nums">
									{selectedOption?.label ?? priceGroupingOptions[0]?.label ?? "—"}
								</span>
							}
							items={dropdownItems}
							size="xxs"
							align="start"
							triggerVariant="minimal"
							triggerAriaLabel={t`Price grouping`}
							triggerClassName="min-w-0 max-w-full"
							className="min-w-0 flex-1 overflow-hidden"
							popupClassName="min-w-0 w-max"
						/>
					</div>
					<div className="min-w-0 truncate">
						<span className="flex min-w-0 items-center justify-end gap-0.5">
							{t`Size`}
							<span className="orderbook-asset-heading text-fg truncate">({displayAsset})</span>
						</span>
					</div>
					<div className="min-w-0 truncate">
						<span className="flex min-w-0 items-center justify-end gap-0.5">
							{t`Total`}
							<span className="orderbook-asset-heading text-fg truncate">({displayAsset})</span>
						</span>
					</div>
				</div>

				<div ref={orderbookContainerRef} className="flex-1 min-h-0 flex flex-col overflow-hidden">
					<div
						data-slot="orderbook-asks"
						data-orderbook-side-container="ask"
						style={getOrderbookLadderStyle(rowHeightPx, fullRowCount > 0)}
						className="flex-1 min-h-0 overflow-hidden flex flex-col justify-end gap-[2px]"
					>
						{hasCurrentSnapshot && asks.length > 0 ? (
							<>
								{getOrderbookPlaceholderKeys(visibleRows - asks.length).map((key) => (
									<OrderbookPlaceholderRow key={key} />
								))}
								{asksReversed.map((level, index) => (
									<OrderbookRow
										key={`ask-${level.price}`}
										rank={asks.length - index - 1}
										hoverState={hover.getHoverState("ask", asks.length - index - 1)}
										tooltipId={
											hover.hoveredSide === "ask" && asks.length - index - 1 === hover.hoveredRank
												? hover.tooltipId
												: undefined
										}
										disabled={asks.length - index - 1 >= fullRowCount}
										flashResetKey={flashResetKey}
										pulse={getPulse("ask", level.price)}
										onPulseEnd={onAnimationEnd}
										level={level}
										marketName={subscriptionParams.coin}
										side="ask"
										maxTotal={askMaxTotal}
										priceDecimals={priceDecimals}
										showInQuote={showOrderbookInQuote}
										szDecimals={szDecimals}
									/>
								))}
							</>
						) : hasCurrentSnapshot ? (
							<OrderbookSideEmpty />
						) : (
							<div className="flex items-center justify-center px-2 py-6 text-xs text-fg">
								{hasFailure ? t`Failed to load order book.` : t`Waiting for order book...`}
							</div>
						)}
					</div>

					<div
						data-slot="orderbook-spread"
						className="orderbook-spread-bg shrink-0 px-2 py-1.5 border-y border-stroke-weak flex items-center justify-between text-xs text-fg"
					>
						<span>{t`Spread`}</span>
						<span className="tabular-nums font-medium text-fg-muted">{spreadText}</span>
					</div>

					<div
						data-slot="orderbook-bids"
						data-orderbook-side-container="bid"
						style={getOrderbookLadderStyle(rowHeightPx, fullRowCount > 0)}
						className="flex-1 min-h-0 overflow-hidden flex flex-col gap-[2px]"
					>
						{hasCurrentSnapshot && bids.length > 0 ? (
							<>
								{bids.map((level, rank) => (
									<OrderbookRow
										key={`bid-${level.price}`}
										rank={rank}
										hoverState={hover.getHoverState("bid", rank)}
										tooltipId={hover.hoveredSide === "bid" && rank === hover.hoveredRank ? hover.tooltipId : undefined}
										disabled={rank >= fullRowCount}
										flashResetKey={flashResetKey}
										pulse={getPulse("bid", level.price)}
										onPulseEnd={onAnimationEnd}
										level={level}
										marketName={subscriptionParams.coin}
										side="bid"
										maxTotal={bidMaxTotal}
										priceDecimals={priceDecimals}
										showInQuote={showOrderbookInQuote}
										szDecimals={szDecimals}
									/>
								))}
								{getOrderbookPlaceholderKeys(visibleRows - bids.length).map((key) => (
									<OrderbookPlaceholderRow key={key} />
								))}
							</>
						) : hasCurrentSnapshot ? (
							<OrderbookSideEmpty />
						) : null}
					</div>
				</div>
				{hover.activeLevel && (
					<OrderbookHoverTooltip
						hover={hover}
						marketName={subscriptionParams.coin}
						baseAsset={baseToken}
						quoteAsset={quoteToken}
						szDecimals={szDecimals}
						priceDecimals={priceDecimals}
					/>
				)}
			</TabsContent>

			<TabsContent value="trades" keepMounted className="flex-1 min-h-0 mt-0 pt-0 flex flex-col">
				<TradesPanel showInQuote={showOrderbookInQuote} />
			</TabsContent>
		</Tabs>
	);
}

function OrderbookSideEmpty() {
	const { t } = useLingui();
	return <div className="flex flex-1 items-center justify-center px-2 py-3 text-xs text-fg-muted">{t`No orders`}</div>;
}
