import { Button, Dropdown, type DropdownItem } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ArrowsClockwiseIcon, ArrowsLeftRightIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { getBaseQuoteFromPairName } from "@/domain/market";
import { isLiveMarkPriceReady } from "@/domain/trade/market-price";
import {
	type OrderbookFeedSnapshot,
	type OrderbookFeedSource,
	useOrderbookFeed,
} from "@/hooks/trade/use-orderbook-feed";
import { useOrderbookHover } from "@/hooks/trade/use-orderbook-hover";
import { useOrderbookLevelPulses } from "@/hooks/trade/use-orderbook-level-pulses";
import { useOrderbookMidPrice } from "@/hooks/trade/use-orderbook-mid-price";
import { cn } from "@/lib/cn";
import { formatNumber, szDecimalsToPriceDecimals } from "@/lib/format";
import { type SubParams, useHyperliquid, useSelectedMarketInfo } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { toBig, toNumber } from "@/lib/trade/numbers";
import {
	type BookLevel,
	getDepthPercentage,
	getL2BookSubscriptionParams,
	getOrderbookQuoteDecimals,
	getPriceGroupingKey,
	getPriceGroupingOptions,
	getRawSpreadInfo,
	getSideMaxTotal,
	getSnapshotPriceDecimals,
	type L2BookPriceGroupOption,
	processLevels,
} from "@/lib/trade/orderbook";
import {
	getOrderbookLadderLayout,
	getOrderbookLadderStyle,
	getOrderbookPlaceholderKeys,
} from "@/lib/ui/orderbook-layout";
import type { OrderbookLevelPulseEvent } from "@/lib/ui/orderbook-level-pulses";
import { tradingPanelDropdownPopupClass } from "@/lib/ui/trading-dropdown";
import { useGlobalSettings, useGlobalSettingsActions } from "@/stores/use-global-settings-store";
import { useOrderbookActions } from "@/stores/use-orderbook-actions-store";
import { OrderbookHoverTooltip } from "../orderbook/orderbook-hover-tooltip";
import { OrderbookLevelPulse } from "../orderbook/orderbook-level-pulse";
import { OrderbookPlaceholderRow } from "../orderbook/orderbook-placeholder-row";
import { OrderbookRow } from "../orderbook/orderbook-row";
import { TradesPanel } from "../orderbook/trades-panel";
import { CompactOrderbookRowPosition } from "./compact-orderbook-row-position";
import { MobileBottomNavSpacer } from "./mobile-bottom-nav";
import {
	COMPACT_ORDERBOOK_DEFAULT_SLOT_COUNT,
	getCompactOrderbookLayout,
	MOBILE_ORDERBOOK_ROW_METRICS,
	type MobileOrderbookRowMetrics,
} from "./mobile-orderbook-layout";

const DEFAULT_LEVEL_COUNT = 12;
const ORDERBOOK_SUBSCRIPTION_KEEP_ALIVE_MS = 10_000;
const ORDERBOOK_SNAPSHOT_CACHE_TTL_MS = 10_000;
const ORDERBOOK_SNAPSHOT_CACHE_MAX_KEYS = 12;

type L2BookParams = SubParams<"l2Book">;
type CachedOrderbookSnapshot = { key: string; data: OrderbookFeedSnapshot; savedAtMonotonic: number };

const orderbookSnapshotCache = new Map<string, CachedOrderbookSnapshot>();

function bookMatchesSource(book: OrderbookFeedSnapshot, source: OrderbookFeedSource): boolean {
	const isFast = "fast" in book && book.fast === true;
	if (source === "l2") return !isFast;
	return isFast === (source === "l2Book-fast");
}

function getOrderbookSnapshotCacheKey(
	env: string,
	params: L2BookParams | null,
	source: OrderbookFeedSource,
): string | null {
	if (!params?.coin) return null;
	return `${env}:${params.coin}:${getPriceGroupingKey(params)}:${source}`;
}

function getFreshOrderbookSnapshotCache(
	key: string | null,
	cacheRevision = 0,
	observedLiveTime?: number,
): CachedOrderbookSnapshot | null {
	if (!key) return null;
	const snapshot = cacheRevision >= 0 ? orderbookSnapshotCache.get(key) : undefined;
	if (!snapshot) return null;
	if (performance.now() - snapshot.savedAtMonotonic > ORDERBOOK_SNAPSHOT_CACHE_TTL_MS) {
		return null;
	}
	// A current or newer live frame makes the cached fallback unnecessary. This
	// also makes the cache read explicitly depend on the live event identity,
	// which prevents React Compiler from reusing an initial cache miss when the
	// subscription later transitions to a no-data state under the same key.
	if (observedLiveTime !== undefined && observedLiveTime >= snapshot.data.time) {
		return null;
	}
	return snapshot;
}

function writeOrderbookSnapshotCache(key: string, data: OrderbookFeedSnapshot): CachedOrderbookSnapshot | null {
	const previousSnapshot = orderbookSnapshotCache.get(key);
	if (!Number.isFinite(data.time) || (previousSnapshot && previousSnapshot.data.time > data.time)) {
		return previousSnapshot ?? null;
	}

	const snapshot = { key, data, savedAtMonotonic: performance.now() };
	orderbookSnapshotCache.delete(key);
	orderbookSnapshotCache.set(key, snapshot);

	for (const [cachedKey, cachedSnapshot] of orderbookSnapshotCache) {
		if (
			orderbookSnapshotCache.size <= ORDERBOOK_SNAPSHOT_CACHE_MAX_KEYS &&
			performance.now() - cachedSnapshot.savedAtMonotonic <= ORDERBOOK_SNAPSHOT_CACHE_TTL_MS
		) {
			break;
		}
		orderbookSnapshotCache.delete(cachedKey);
	}

	return snapshot;
}

function useWarmBoolean(enabled: boolean, keepAliveMs: number) {
	const [isWarm, setIsWarm] = useState(enabled);

	useEffect(() => {
		if (enabled) {
			setIsWarm(true);
			return;
		}

		if (keepAliveMs <= 0) {
			setIsWarm(false);
			return;
		}

		const timeout = setTimeout(() => setIsWarm(false), keepAliveMs);
		return () => clearTimeout(timeout);
	}, [enabled, keepAliveMs]);

	return enabled || isWarm;
}

type View = "book" | "trades";
export type CompactOrderbookMode = "asks" | "both" | "bids";

interface MobileBookViewProps {
	active?: boolean;
	className?: string;
	/** Narrow split-column mode: hide all chrome, render compact 2-col rows. */
	compact?: boolean;
	/** Embedded in a parent tab layout: hide the Book/Trades toggle + bottom spacer; view is parent-controlled. */
	inTabLayout?: boolean;
	/** Controlled display unit for the compact book. Defaults to the global preference. */
	showOrderbookInQuote?: boolean;
	view?: View;
}

export function MobileBookView({
	active = true,
	className,
	compact,
	inTabLayout,
	showOrderbookInQuote: controlledShowOrderbookInQuote,
	view: viewProp,
}: MobileBookViewProps) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const { env } = useHyperliquid();
	const [internalView, setView] = useState<View>("book");
	const view = viewProp ?? internalView;
	const [compactOrderbookMode, setCompactOrderbookMode] = useState<CompactOrderbookMode>("both");
	const [selectedOptionKey, setSelectedOptionKey] = useState<string | null>(null);
	const { showOrderbookInQuote: globalShowOrderbookInQuote } = useGlobalSettings();
	const { setShowOrderbookInQuote } = useGlobalSettingsActions();
	const showOrderbookInQuote = controlledShowOrderbookInQuote ?? globalShowOrderbookInQuote;

	const { data: selectedMarket } = useSelectedMarketInfo();
	const name = selectedMarket?.name ?? "";
	const szDecimals = selectedMarket?.szDecimals ?? 4;
	const marketType = selectedMarket?.kind === "spot" ? "spot" : "perp";
	const maxPriceDecimals = szDecimalsToPriceDecimals(szDecimals, marketType);
	const referencePrice = toNumber(selectedMarket?.markPx) ?? undefined;
	const priceGroupingOptions = useMemo(
		() => getPriceGroupingOptions(referencePrice, maxPriceDecimals),
		[referencePrice, maxPriceDecimals],
	);
	const selectedOption = useMemo(
		() => priceGroupingOptions.find((option) => option.key === selectedOptionKey) ?? priceGroupingOptions[0] ?? null,
		[priceGroupingOptions, selectedOptionKey],
	);
	const priceDecimals = selectedOption?.decimals ?? maxPriceDecimals;
	const subscriptionParams = useMemo<L2BookParams | null>(() => {
		if (!name) return null;
		return getL2BookSubscriptionParams(name, selectedOption, { fast: compact || undefined });
	}, [compact, name, selectedOption]);
	const isBookViewActive = active && view === "book";
	const keepSubscriptionWarm = useWarmBoolean(isBookViewActive, ORDERBOOK_SUBSCRIPTION_KEEP_ALIVE_MS);
	const subscriptionEnabled = keepSubscriptionWarm && !!selectedMarket && !!subscriptionParams;

	const {
		data: liveBook,
		isStale,
		source: bookSource,
		status: bookStatus,
	} = useOrderbookFeed({
		compact: Boolean(compact),
		enabled: subscriptionEnabled,
		env,
		params: subscriptionParams,
	});
	const bookCacheKey = useMemo(
		() => getOrderbookSnapshotCacheKey(env, subscriptionParams, bookSource),
		[bookSource, env, subscriptionParams],
	);
	const matchingLiveBook =
		liveBook &&
		subscriptionParams &&
		liveBook.coin === subscriptionParams.coin &&
		bookMatchesSource(liveBook, bookSource) &&
		Number.isFinite(liveBook.time)
			? liveBook
			: undefined;
	const [cacheRevision, setCacheRevision] = useState(0);
	const observedLiveTime = bookStatus === "active" && !isStale ? matchingLiveBook?.time : undefined;
	const cachedSnapshot = getFreshOrderbookSnapshotCache(bookCacheKey, cacheRevision, observedLiveTime);
	const liveBookIsLatest =
		!!matchingLiveBook &&
		bookStatus === "active" &&
		!isStale &&
		(!cachedSnapshot || matchingLiveBook.time >= cachedSnapshot.data.time);
	const currentLiveBook = liveBookIsLatest ? matchingLiveBook : undefined;
	const {
		midPx: liveBboMid,
		isStale: isBboStale,
		status: bboStatus,
	} = useOrderbookMidPrice(isBookViewActive && !compact ? name : undefined);
	const bboMid = bboStatus === "active" && !isBboStale ? liveBboMid : undefined;

	useEffect(() => {
		if (!bookCacheKey || !currentLiveBook) return;
		writeOrderbookSnapshotCache(bookCacheKey, currentLiveBook);
	}, [bookCacheKey, currentLiveBook]);

	const hasBookFailure = bookStatus === "error" || isStale;
	useEffect(() => {
		if (!isBookViewActive || hasBookFailure || currentLiveBook || !cachedSnapshot) return;
		const remainingMs = ORDERBOOK_SNAPSHOT_CACHE_TTL_MS - (performance.now() - cachedSnapshot.savedAtMonotonic);
		const timeout = setTimeout(
			() => {
				if (orderbookSnapshotCache.get(cachedSnapshot.key) === cachedSnapshot) {
					orderbookSnapshotCache.delete(cachedSnapshot.key);
				}
				setCacheRevision((revision) => revision + 1);
			},
			Math.max(0, remainingMs + 1),
		);
		return () => clearTimeout(timeout);
	}, [cachedSnapshot, currentLiveBook, hasBookFailure, isBookViewActive]);
	const book = hasBookFailure ? undefined : (currentLiveBook ?? cachedSnapshot?.data);
	const hasLiveBook = !!currentLiveBook && bookStatus === "active" && !isStale;
	const isBookInteractive = isBookViewActive && hasLiveBook;
	const isTransitioningBook = isBookViewActive && !hasBookFailure && !hasLiveBook;
	const flashResetKey = bookCacheKey ?? "";

	const bids = useMemo(() => processLevels(book?.levels[0]), [book?.levels]);
	const asks = useMemo(() => processLevels(book?.levels[1]), [book?.levels]);
	const displayPriceDecimals = useMemo(
		() => getSnapshotPriceDecimals(book?.levels, priceDecimals),
		[book?.levels, priceDecimals],
	);
	const spreadInfo = useMemo(
		() => getRawSpreadInfo(book?.levels, { bboMid, eventSpread: book?.spread }),
		[bboMid, book?.levels, book?.spread],
	);
	const serverMid = selectedMarket?.midPx ?? undefined;
	const mid =
		isBookViewActive &&
		isLiveMarkPriceReady(selectedMarket?.markPriceStatus ?? "idle", serverMid, selectedMarket?.midPriceReceivedAt)
			? serverMid
			: undefined;
	const midIdentity = `${env}:${name}`;

	const [midDirection, setMidDirection] = useState<"up" | "down" | "flat">("flat");
	const lastMidRef = useRef<{ key: string | null; value: string | undefined }>({ key: null, value: undefined });

	useEffect(() => {
		const midValue = toBig(mid);
		if (!midValue) {
			lastMidRef.current = { key: null, value: undefined };
			setMidDirection("flat");
			return;
		}
		const key = midIdentity;
		const last = lastMidRef.current;
		if (last.key !== key) {
			setMidDirection("flat");
			lastMidRef.current = { key, value: mid };
			return;
		}

		const lastValue = toBig(last.value);
		if (lastValue) {
			const comparison = midValue.cmp(lastValue);
			if (comparison > 0) setMidDirection("up");
			else if (comparison < 0) setMidDirection("down");
			else setMidDirection("flat");
		}
		lastMidRef.current = { key, value: mid };
	}, [midIdentity, mid]);

	const spreadText = spreadInfo
		? `${formatNumber(spreadInfo.spread, displayPriceDecimals)} (${formatNumber(spreadInfo.spreadPct, 3)}%)`
		: FALLBACK_VALUE_PLACEHOLDER;

	const { baseToken, quoteToken } = useMemo(() => {
		if (!selectedMarket) return { baseToken: "", quoteToken: "" };
		return getBaseQuoteFromPairName(selectedMarket.pairName, selectedMarket.kind);
	}, [selectedMarket]);

	return (
		<div className={cn("flex flex-col min-h-0 flex-1 self-stretch", className)}>
			<div className={cn("shrink-0 px-3 py-2 border-b border-stroke-weak/60 bg-surface", compact && "hidden")}>
				<div className="flex items-center justify-between">
					{!inTabLayout && (
						<div className="flex items-center gap-1 bg-surface rounded-8 p-0.5">
							<Button
								variant={view === "book" ? "filled" : "ghost"}
								intent={view === "book" ? "neutral" : "neutral"}
								size="sm"
								onClick={() => setView("book")}
								className={cn("min-h-11", view !== "book" && "opacity-60")}
							>
								{t`Order Book`}
							</Button>
							<Button
								variant={view === "trades" ? "filled" : "ghost"}
								intent={view === "trades" ? "neutral" : "neutral"}
								size="sm"
								onClick={() => setView("trades")}
								className={cn("min-h-11", view !== "trades" && "opacity-60")}
							>
								{t`Trades`}
							</Button>
						</div>
					)}

					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							intent="neutral"
							size="sm"
							onClick={() => setShowOrderbookInQuote(!showOrderbookInQuote)}
							className="min-h-11"
							aria-label={t`Toggle display units`}
							iconRight={<ArrowsLeftRightIcon className="size-3" />}
						>
							{showOrderbookInQuote ? quoteToken : baseToken}
						</Button>

						{view === "book" && (
							<Dropdown
								size="sm"
								trigger={selectedOption?.label ?? FALLBACK_VALUE_PLACEHOLDER}
								align="end"
								className="font-mono"
								items={priceGroupingOptions.map(
									(option): DropdownItem => ({
										label: option.label,
										onSelect: () => setSelectedOptionKey(getPriceGroupingKey(option)),
									}),
								)}
							/>
						)}
					</div>
				</div>
			</div>

			{view === "book" ? (
				compact ? (
					<CompactOrderbook
						asks={asks}
						bids={bids}
						pulseIdentity={bookCacheKey ?? ""}
						pulseSnapshot={currentLiveBook}
						flashResetKey={flashResetKey}
						hasSnapshot={!!book}
						isInteractive={isBookInteractive}
						isTransitioning={isTransitioningBook}
						priceDecimals={displayPriceDecimals}
						showOrderbookInQuote={showOrderbookInQuote}
						szDecimals={szDecimals}
						mid={mid}
						midDirection={midDirection}
						marketName={name}
						selectedOptionLabel={selectedOption?.label ?? FALLBACK_VALUE_PLACEHOLDER}
						priceGroupingOptions={priceGroupingOptions}
						setSelectedOptionKey={setSelectedOptionKey}
						mode={compactOrderbookMode}
						onModeChange={setCompactOrderbookMode}
						baseToken={baseToken}
						priceToken={quoteToken}
						quoteToken={quoteToken}
						sizeToken={showOrderbookInQuote ? quoteToken : baseToken}
					/>
				) : (
					<SplitOrderbook
						asks={asks}
						bids={bids}
						pulseIdentity={bookCacheKey ?? ""}
						pulseSnapshot={currentLiveBook}
						enabled={isBookViewActive}
						hasSnapshot={!!book}
						isInteractive={isBookInteractive}
						isTransitioning={isTransitioningBook}
						marketName={name}
						priceDecimals={displayPriceDecimals}
						showOrderbookInQuote={showOrderbookInQuote}
						szDecimals={szDecimals}
						spreadText={spreadText}
						baseToken={baseToken}
						quoteToken={quoteToken}
					/>
				)
			) : (
				<div className="flex-1 min-h-0 flex flex-col">
					{active && <TradesPanel key={name} compact={compact} showInQuote={showOrderbookInQuote} />}
				</div>
			)}

			{!inTabLayout && <MobileBottomNavSpacer />}
		</div>
	);
}

interface OrderbookLayoutProps {
	asks: BookLevel[];
	bids: BookLevel[];
	pulseIdentity?: string;
	pulseSnapshot?: OrderbookFeedSnapshot;
	hasSnapshot: boolean;
	isInteractive: boolean;
	isTransitioning: boolean;
	marketName: string;
	priceDecimals: number;
	showOrderbookInQuote: boolean;
	szDecimals: number;
}

interface CompactOrderbookProps extends OrderbookLayoutProps {
	baseToken: string;
	flashResetKey: string;
	mid: string | undefined;
	midDirection: "up" | "down" | "flat";
	selectedOptionLabel: string;
	priceGroupingOptions: L2BookPriceGroupOption[];
	setSelectedOptionKey: (key: string) => void;
	mode: CompactOrderbookMode;
	onModeChange: (mode: CompactOrderbookMode) => void;
	priceToken: string;
	quoteToken: string;
	sizeToken: string;
}

export function CompactOrderbook({
	asks,
	bids,
	pulseIdentity = "",
	pulseSnapshot,
	flashResetKey,
	hasSnapshot,
	isInteractive,
	isTransitioning,
	marketName,
	priceDecimals,
	showOrderbookInQuote,
	szDecimals,
	mid,
	midDirection,
	selectedOptionLabel,
	priceGroupingOptions,
	setSelectedOptionKey,
	mode,
	onModeChange,
	baseToken,
	priceToken,
	quoteToken,
	sizeToken,
}: CompactOrderbookProps) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const [height, orderbookRef] = useOrderbookHeight<HTMLFieldSetElement>();
	const measuredLayout = getCompactOrderbookLayout(height, mode);
	const { rowCount, fullRowCount, rowHeightPx } =
		height > 0
			? measuredLayout
			: {
					rowCount:
						mode === "both" ? (COMPACT_ORDERBOOK_DEFAULT_SLOT_COUNT - 1) / 2 : COMPACT_ORDERBOOK_DEFAULT_SLOT_COUNT,
					fullRowCount: 0,
					rowHeightPx: MOBILE_ORDERBOOK_ROW_METRICS.compact.rowHeightPx,
				};
	const askLevelCount = mode === "bids" ? 0 : rowCount;
	const bidLevelCount = mode === "asks" ? 0 : rowCount;
	const visibleAsks = useMemo(() => asks.slice(0, askLevelCount), [asks, askLevelCount]);
	const visibleBids = useMemo(() => bids.slice(0, bidLevelCount), [bids, bidLevelCount]);
	const hasAsks = visibleAsks.length > 0;
	const hasBids = visibleBids.length > 0;
	const showAsks = mode !== "bids";
	const showBids = mode !== "asks";
	const askMaxTotal = getVisibleMaxTotal(visibleAsks, askLevelCount, showOrderbookInQuote);
	const bidMaxTotal = getVisibleMaxTotal(visibleBids, bidLevelCount, showOrderbookInQuote);
	const visiblePulseLevels = useMemo(
		() => [
			...visibleAsks
				.slice(0, fullRowCount)
				.reverse()
				.map((level) => ({ side: "ask" as const, price: level.price })),
			...visibleBids.slice(0, fullRowCount).map((level) => ({ side: "bid" as const, price: level.price })),
		],
		[visibleAsks, visibleBids, fullRowCount],
	);
	const { panelRef, getPulse, onAnimationEnd } = useOrderbookLevelPulses({
		identity: pulseIdentity,
		snapshot: pulseSnapshot,
		visibleLevels: visiblePulseLevels,
		viewKey: `compact:${mode}:${fullRowCount}`,
		active: isInteractive && fullRowCount > 0,
	});

	const rootRef = useRef<HTMLDivElement>(null);
	const hover = useOrderbookHover({
		identity: flashResetKey,
		viewKey: `compact:${mode}:${fullRowCount}:${rowHeightPx}`,
		enabled: isInteractive && fullRowCount > 0,
		bids: visibleBids,
		asks: visibleAsks,
		rootRef,
	});
	const setPanelRef = useCallback(
		(node: HTMLDivElement | null) => {
			rootRef.current = node;
			panelRef(node);
		},
		[panelRef],
	);

	return (
		<div
			ref={setPanelRef}
			{...hover.containerProps}
			className="orderbook-panel-container flex-1 min-h-0 flex flex-col overflow-hidden font-market-close text-trading-panel-fg [--orderbook-hover-gap:4px]"
		>
			<div className="grid h-[35px] shrink-0 grid-cols-2 items-center gap-1 border-b border-trading-panel-stroke-row pl-2 pr-3 text-xs tracking-normal orderbook-header-text uppercase">
				<div className="min-w-0 truncate" title={`${t`Price`} (${priceToken})`}>
					{t`Price`}{" "}
					<span data-slot="compact-orderbook-price-token" className="orderbook-asset-heading normal-case">
						({priceToken})
					</span>
				</div>
				<div className="min-w-0 truncate text-right" title={`${t`Size`} (${sizeToken})`}>
					{t`Size`}{" "}
					<span data-slot="compact-orderbook-size-token" className="orderbook-asset-heading normal-case">
						({sizeToken})
					</span>
				</div>
			</div>

			<fieldset
				ref={orderbookRef}
				style={getOrderbookLadderStyle(rowHeightPx, fullRowCount > 0)}
				disabled={!isInteractive}
				aria-busy={isTransitioning}
				className={cn(
					"relative m-0 flex flex-1 min-h-0 flex-col gap-[4px] overflow-hidden border-0 p-0",
					!isInteractive && "pointer-events-none",
				)}
			>
				<div
					data-slot="compact-orderbook-asks"
					data-orderbook-side-container="ask"
					className={cn("relative flex-1 min-h-0 overflow-hidden", !showAsks && "hidden")}
				>
					{hasAsks ? (
						<>
							{getOrderbookPlaceholderKeys(askLevelCount - visibleAsks.length).map((key, index) => {
								const rank = askLevelCount - index - 1;
								return (
									<CompactOrderbookRowPosition rowHeightPx={rowHeightPx} key={`ask-${key}`} rank={rank} side="ask">
										<OrderbookPlaceholderRow compact />
									</CompactOrderbookRowPosition>
								);
							})}
							{visibleAsks
								.slice()
								.reverse()
								.map((level, index, orderedAsks) => {
									const rank = orderedAsks.length - index - 1;
									return (
										<CompactOrderbookRowPosition
											rowHeightPx={rowHeightPx}
											key={`ask-${level.price}`}
											price={level.price}
											rank={rank}
											side="ask"
										>
											<OrderbookRow
												disabled={!isInteractive || rank >= fullRowCount}
												flashResetKey={flashResetKey}
												pulse={getPulse("ask", level.price)}
												onPulseEnd={onAnimationEnd}
												level={level}
												marketName={marketName}
												side="ask"
												rank={rank}
												hoverState={hover.getHoverState("ask", rank)}
												tooltipId={hover.tooltipId}
												maxTotal={askMaxTotal}
												priceDecimals={priceDecimals}
												showInQuote={showOrderbookInQuote}
												szDecimals={szDecimals}
												compact
											/>
										</CompactOrderbookRowPosition>
									);
								})}
						</>
					) : hasSnapshot ? (
						getOrderbookPlaceholderKeys(askLevelCount).map((key, index) => {
							const rank = askLevelCount - index - 1;
							return (
								<CompactOrderbookRowPosition rowHeightPx={rowHeightPx} key={`ask-${key}`} rank={rank} side="ask">
									<OrderbookPlaceholderRow compact />
								</CompactOrderbookRowPosition>
							);
						})
					) : (
						<CompactOrderbookSkeletonRows rowHeightPx={rowHeightPx} rows={askLevelCount} side="ask" />
					)}
				</div>

				{mode === "both" && (
					<div
						data-slot="compact-orderbook-mid"
						data-direction={midDirection}
						className="shrink-0 flex h-[24px] items-center justify-start px-2 gap-1.5"
					>
						<span className="sr-only">{t`Mid`}: </span>
						<span
							data-slot="compact-orderbook-mid-price"
							className={cn(
								"shrink-0 tabular-nums text-base",
								midDirection === "up" && "text-trading-panel-success",
								midDirection === "down" && "text-trading-panel-error",
								midDirection === "flat" && "text-trading-panel-fg",
							)}
						>
							{mid ? `$${formatNumber(mid, priceDecimals)}` : FALLBACK_VALUE_PLACEHOLDER}
						</span>
					</div>
				)}

				<div
					data-slot="compact-orderbook-bids"
					data-orderbook-side-container="bid"
					className={cn("relative flex-1 min-h-0 overflow-hidden", !showBids && "hidden")}
				>
					{hasBids ? (
						<>
							{visibleBids.map((level, rank) => (
								<CompactOrderbookRowPosition
									rowHeightPx={rowHeightPx}
									key={`bid-${level.price}`}
									price={level.price}
									rank={rank}
									side="bid"
								>
									<OrderbookRow
										disabled={!isInteractive || rank >= fullRowCount}
										flashResetKey={flashResetKey}
										pulse={getPulse("bid", level.price)}
										onPulseEnd={onAnimationEnd}
										level={level}
										marketName={marketName}
										side="bid"
										rank={rank}
										hoverState={hover.getHoverState("bid", rank)}
										tooltipId={hover.tooltipId}
										maxTotal={bidMaxTotal}
										priceDecimals={priceDecimals}
										showInQuote={showOrderbookInQuote}
										szDecimals={szDecimals}
										compact
									/>
								</CompactOrderbookRowPosition>
							))}
							{getOrderbookPlaceholderKeys(bidLevelCount - visibleBids.length).map((key, index) => {
								const rank = visibleBids.length + index;
								return (
									<CompactOrderbookRowPosition rowHeightPx={rowHeightPx} key={`bid-${key}`} rank={rank} side="bid">
										<OrderbookPlaceholderRow compact />
									</CompactOrderbookRowPosition>
								);
							})}
						</>
					) : hasSnapshot ? (
						getOrderbookPlaceholderKeys(bidLevelCount).map((key, rank) => (
							<CompactOrderbookRowPosition rowHeightPx={rowHeightPx} key={`bid-${key}`} rank={rank} side="bid">
								<OrderbookPlaceholderRow compact />
							</CompactOrderbookRowPosition>
						))
					) : (
						<CompactOrderbookSkeletonRows rowHeightPx={rowHeightPx} rows={bidLevelCount} side="bid" />
					)}
				</div>
				{isTransitioning && hasSnapshot && <OrderbookBusyOverlay />}
			</fieldset>
			{isTransitioning && <OrderbookLoadingAnnouncement />}
			{hover.activeLevel && (
				<OrderbookHoverTooltip
					hover={hover}
					marketName={marketName}
					baseAsset={baseToken}
					quoteAsset={quoteToken}
					szDecimals={szDecimals}
					priceDecimals={priceDecimals}
				/>
			)}

			<div className="shrink-0 h-[31px] border-t border-trading-panel-stroke-row flex items-center gap-1 text-trading-panel-muted pl-2 pr-1 text-xs max-[339px]:pl-1">
				<Dropdown
					size="sm"
					hideCaret
					triggerVariant="minimal"
					triggerAriaLabel={t`Price precision`}
					align="start"
					trigger={selectedOptionLabel}
					triggerClassName="relative min-h-6 text-xs tabular-nums text-trading-panel-muted"
					popupClassName={tradingPanelDropdownPopupClass}
					items={priceGroupingOptions.map(
						(option): DropdownItem => ({
							label: option.label,
							onSelect: () => setSelectedOptionKey(getPriceGroupingKey(option)),
						}),
					)}
				/>
				<span className="min-w-0 flex-1" aria-hidden="true" />
				<CompactOrderbookModeControls mode={mode} onModeChange={onModeChange} />
			</div>
		</div>
	);
}

function getVisibleMaxTotal(levels: BookLevel[], levelCount: number, showInQuote = false): string {
	return getSideMaxTotal(levels.slice(0, levelCount), showInQuote);
}

function CompactOrderbookModeControls({
	mode,
	onModeChange,
}: {
	mode: CompactOrderbookMode;
	onModeChange: (mode: CompactOrderbookMode) => void;
}) {
	const { t } = useLingui();
	const options: Array<{ mode: CompactOrderbookMode; label: string; bars: Array<"ask" | "bid"> }> = [
		{ mode: "both", label: t`Show both sides`, bars: ["ask", "bid"] },
		{ mode: "asks", label: t`Show asks only`, bars: ["ask", "ask"] },
		{ mode: "bids", label: t`Show bids only`, bars: ["bid", "bid"] },
	];

	return (
		<fieldset aria-label={t`Order book view`} className="m-0 flex shrink-0 items-center gap-1 border-0 p-0">
			{options.map((option) => {
				const selected = option.mode === mode;
				return (
					<button
						key={option.mode}
						type="button"
						aria-label={option.label}
						aria-pressed={selected}
						data-mode={option.mode}
						onClick={() => onModeChange(option.mode)}
						className={cn(
							"grid h-[22px] w-6 place-items-center rounded-[5px] text-trading-panel-muted transition-colors motion-reduce:transition-none",
							selected
								? "bg-trading-panel-card text-trading-panel-fg"
								: "hover:bg-trading-panel-hover hover:text-trading-panel-fg",
						)}
					>
						<OrderbookModeIcon bars={option.bars} />
					</button>
				);
			})}
		</fieldset>
	);
}

function OrderbookModeIcon({ bars }: { bars: Array<"ask" | "bid"> }) {
	return (
		<span className="grid size-3 grid-rows-2 overflow-hidden rounded-[3px]" aria-hidden="true">
			<span
				style={{
					backgroundColor: bars[0] === "ask" ? "var(--orderbook-depth-ask)" : "var(--orderbook-depth-bid)",
				}}
			/>
			<span
				style={{
					backgroundColor: bars[1] === "ask" ? "var(--orderbook-depth-ask)" : "var(--orderbook-depth-bid)",
				}}
			/>
		</span>
	);
}

interface SplitOrderbookProps extends OrderbookLayoutProps {
	baseToken: string;
	quoteToken: string;
	enabled: boolean;
	spreadText: string;
}

function SplitOrderbook({
	baseToken,
	quoteToken,
	asks,
	bids,
	pulseIdentity = "",
	pulseSnapshot,
	enabled,
	hasSnapshot,
	isInteractive,
	isTransitioning,
	marketName,
	priceDecimals,
	showOrderbookInQuote,
	szDecimals,
	spreadText,
}: SplitOrderbookProps) {
	const { t } = useLingui();
	const [{ rowCount: askLevelCount, fullRowCount: askFullRowCount, rowHeightPx: askRowHeightPx }, askLadderRef] =
		useOrderbookLadderRows(DEFAULT_LEVEL_COUNT, enabled, MOBILE_ORDERBOOK_ROW_METRICS.default);
	const [{ rowCount: bidLevelCount, fullRowCount: bidFullRowCount, rowHeightPx: bidRowHeightPx }, bidLadderRef] =
		useOrderbookLadderRows(DEFAULT_LEVEL_COUNT, enabled, MOBILE_ORDERBOOK_ROW_METRICS.default);
	const visibleAsks = useMemo(() => asks.slice(0, askLevelCount), [asks, askLevelCount]);
	const visibleBids = useMemo(() => bids.slice(0, bidLevelCount), [bids, bidLevelCount]);
	const hasAsks = visibleAsks.length > 0;
	const hasBids = visibleBids.length > 0;
	const askMaxTotal = getVisibleMaxTotal(visibleAsks, askLevelCount, showOrderbookInQuote);
	const bidMaxTotal = getVisibleMaxTotal(visibleBids, bidLevelCount, showOrderbookInQuote);
	const visiblePulseLevels = useMemo(
		() => [
			...visibleAsks.slice(0, askFullRowCount).map((level) => ({ side: "ask" as const, price: level.price })),
			...visibleBids.slice(0, bidFullRowCount).map((level) => ({ side: "bid" as const, price: level.price })),
		],
		[visibleAsks, visibleBids, askFullRowCount, bidFullRowCount],
	);
	const { panelRef, getPulse, onAnimationEnd } = useOrderbookLevelPulses({
		identity: pulseIdentity,
		snapshot: pulseSnapshot,
		visibleLevels: visiblePulseLevels,
		viewKey: `split:${askFullRowCount}:${bidFullRowCount}`,
		active: isInteractive && (askFullRowCount > 0 || bidFullRowCount > 0),
	});

	const rootRef = useRef<HTMLDivElement>(null);
	const hover = useOrderbookHover({
		identity: pulseIdentity,
		viewKey: `split:${askFullRowCount}:${bidFullRowCount}:${askRowHeightPx}:${bidRowHeightPx}`,
		enabled: isInteractive && (askFullRowCount > 0 || bidFullRowCount > 0),
		bids: visibleBids,
		asks: visibleAsks,
		rootRef,
	});
	const setPanelRef = useCallback(
		(node: HTMLDivElement | null) => {
			rootRef.current = node;
			panelRef(node);
		},
		[panelRef],
	);

	return (
		<div ref={setPanelRef} {...hover.containerProps} className="flex-1 min-h-0 flex flex-col overflow-hidden">
			<div className="shrink-0 border-b border-stroke-weak/40 bg-background">
				<div className="flex items-center justify-between gap-2 px-3 py-1.5 text-2xs orderbook-header-text">
					<span>{t`Spread`}</span>
					<span className="tabular-nums">{spreadText}</span>
				</div>
				<div
					data-slot="split-orderbook-column-headings"
					className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-px pb-1.5 text-2xs uppercase tracking-wider orderbook-header-text"
				>
					<div
						data-slot="split-orderbook-bid-headings"
						className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1 px-2"
					>
						<div>{t`Total`}</div>
						<div data-slot="split-orderbook-bid-price-heading" className="text-right">
							{t`Price`}
						</div>
					</div>
					<div
						data-slot="split-orderbook-ask-headings"
						className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1 px-2"
					>
						<div data-slot="split-orderbook-ask-price-heading">{t`Price`}</div>
						<div className="text-right">{t`Total`}</div>
					</div>
				</div>
			</div>

			<fieldset
				disabled={!isInteractive}
				aria-busy={isTransitioning}
				className={cn(
					"relative m-0 grid flex-1 min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-px overflow-hidden border-0 p-0",
					!isInteractive && "pointer-events-none",
				)}
			>
				<div
					ref={bidLadderRef}
					style={getOrderbookLadderStyle(bidRowHeightPx, bidFullRowCount > 0)}
					data-slot="split-orderbook-bids"
					data-orderbook-side-container="bid"
					className="min-h-0 overflow-hidden flex flex-col gap-[2px]"
				>
					{hasBids ? (
						<>
							{visibleBids.map((level, rank) => (
								<SplitOrderbookRow
									key={`bid-${level.price}`}
									disabled={!isInteractive || rank >= bidFullRowCount}
									pulse={getPulse("bid", level.price)}
									onPulseEnd={onAnimationEnd}
									level={level}
									marketName={marketName}
									side="bid"
									rank={rank}
									hoverState={hover.getHoverState("bid", rank)}
									tooltipId={hover.tooltipId}
									maxTotal={bidMaxTotal}
									priceDecimals={priceDecimals}
									showInQuote={showOrderbookInQuote}
									szDecimals={szDecimals}
								/>
							))}
							{getOrderbookPlaceholderKeys(bidLevelCount - visibleBids.length).map((key) => (
								<OrderbookPlaceholderRow key={`bid-${key}`} />
							))}
						</>
					) : hasSnapshot ? (
						<OrderbookEmptySide />
					) : (
						<OrderbookSkeletonRows rows={bidLevelCount} />
					)}
				</div>

				<div
					ref={askLadderRef}
					style={getOrderbookLadderStyle(askRowHeightPx, askFullRowCount > 0)}
					data-slot="split-orderbook-asks"
					data-orderbook-side-container="ask"
					className="min-h-0 overflow-hidden flex flex-col gap-[2px]"
				>
					{hasAsks ? (
						<>
							{visibleAsks.map((level, rank) => (
								<SplitOrderbookRow
									key={`ask-${level.price}`}
									disabled={!isInteractive || rank >= askFullRowCount}
									pulse={getPulse("ask", level.price)}
									onPulseEnd={onAnimationEnd}
									level={level}
									marketName={marketName}
									side="ask"
									rank={rank}
									hoverState={hover.getHoverState("ask", rank)}
									tooltipId={hover.tooltipId}
									maxTotal={askMaxTotal}
									priceDecimals={priceDecimals}
									showInQuote={showOrderbookInQuote}
									szDecimals={szDecimals}
								/>
							))}
							{getOrderbookPlaceholderKeys(askLevelCount - visibleAsks.length).map((key) => (
								<OrderbookPlaceholderRow key={`ask-${key}`} />
							))}
						</>
					) : hasSnapshot ? (
						<OrderbookEmptySide />
					) : (
						<OrderbookSkeletonRows rows={askLevelCount} />
					)}
				</div>
				{isTransitioning && hasSnapshot && <OrderbookBusyOverlay />}
			</fieldset>
			{isTransitioning && <OrderbookLoadingAnnouncement />}
			{hover.activeLevel && (
				<OrderbookHoverTooltip
					hover={hover}
					marketName={marketName}
					baseAsset={baseToken}
					quoteAsset={quoteToken}
					szDecimals={szDecimals}
					priceDecimals={priceDecimals}
				/>
			)}
		</div>
	);
}

function OrderbookEmptySide({ compact }: { compact?: boolean }) {
	const { t } = useLingui();

	return (
		<div className={cn("grid flex-1 place-items-center px-2 text-fg-muted", compact ? "text-3xs" : "text-2xs")}>
			{t`No orders`}
		</div>
	);
}

function OrderbookBusyOverlay() {
	return (
		<div
			data-slot="orderbook-busy-overlay"
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-background/55"
		>
			<ArrowsClockwiseIcon className="size-4 animate-spin text-fg-muted motion-reduce:animate-none" />
		</div>
	);
}

function OrderbookLoadingAnnouncement() {
	const { t } = useLingui();
	return (
		<output aria-live="polite" className="sr-only">
			{t`Waiting for order book...`}
		</output>
	);
}

function CompactOrderbookSkeletonRows({
	rows,
	side,
	rowHeightPx,
}: {
	rows: number;
	side: "ask" | "bid";
	rowHeightPx: number;
}) {
	return (
		<>
			{getOrderbookPlaceholderKeys(rows).map((_, index) => {
				const rank = side === "ask" ? rows - index - 1 : index;
				return (
					<CompactOrderbookRowPosition
						rowHeightPx={rowHeightPx}
						key={`${side}-skeleton-${rank}`}
						rank={rank}
						side={side}
					>
						<OrderbookSkeletonRow index={rank} align={side === "ask" ? "end" : undefined} compact />
					</CompactOrderbookRowPosition>
				);
			})}
		</>
	);
}

function OrderbookSkeletonRows({ rows, align, compact }: { rows: number; align?: "end"; compact?: boolean }) {
	return (
		<>
			{getOrderbookPlaceholderKeys(rows).map((key, index) => (
				<OrderbookSkeletonRow key={key} index={index} align={align} compact={compact} />
			))}
		</>
	);
}

function OrderbookSkeletonRow({ index, align, compact }: { index: number; align?: "end"; compact?: boolean }) {
	const firstWidth = 42 + ((index * 17) % 22);
	const secondWidth = 32 + ((index * 13) % 26);

	return (
		<div
			data-slot="orderbook-skeleton-row"
			className={cn(
				"shrink-0 px-2 py-1",
				compact ? "h-[var(--orderbook-row-height,24px)]" : "h-[var(--orderbook-row-height,23px)]",
			)}
		>
			<div className="grid h-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1">
				<div
					className={cn(
						"h-2 self-center rounded-xs bg-fill-weak/60",
						align === "end" ? "justify-self-end" : "justify-self-start",
					)}
					style={{ width: `${firstWidth}%` }}
				/>
				<div
					className={cn(
						"h-2 self-center rounded-xs bg-fill-weak/50",
						align === "end" ? "justify-self-end" : "justify-self-start",
					)}
					style={{ width: `${secondWidth}%` }}
				/>
			</div>
		</div>
	);
}

interface SplitOrderbookRowProps {
	rank?: number;
	hoverState?: "active" | "range";
	tooltipId?: string;
	disabled?: boolean;
	pulse?: OrderbookLevelPulseEvent;
	onPulseEnd?: (id: number) => void;
	level: BookLevel;
	marketName: string;
	side: "ask" | "bid";
	maxTotal: string;
	priceDecimals: number;
	showInQuote: boolean;
	szDecimals: number;
}

export function SplitOrderbookRow({
	rank,
	hoverState,
	tooltipId,
	disabled = false,
	pulse,
	onPulseEnd,
	level,
	marketName,
	side,
	maxTotal,
	priceDecimals,
	showInQuote,
	szDecimals,
}: SplitOrderbookRowProps) {
	useNumberFormatRevision();
	const { setSelectedPrice } = useOrderbookActions();
	const isAsk = side === "ask";
	const totalValue = showInQuote ? level.quoteTotal : level.total;
	const depthPct = getDepthPercentage(totalValue, maxTotal);
	const totalDecimals = showInQuote ? getOrderbookQuoteDecimals(totalValue) : szDecimals;
	const priceText = formatNumber(level.price, priceDecimals);
	const sizeText = formatNumber(level.size, { decimals: szDecimals, compact: true });
	const totalText = formatNumber(totalValue, { decimals: totalDecimals, compact: true });
	const { t } = useLingui();
	const sideLabel = isAsk ? t`Ask` : t`Bid`;
	const price = (
		<span
			className={cn(
				"font-medium tabular-nums",
				isAsk ? "text-left orderbook-price-ask" : "text-right orderbook-price-bid",
			)}
		>
			{priceText}
		</span>
	);
	const total = (
		<span className={cn("truncate tabular-nums orderbook-value-text", isAsk ? "text-right" : "text-left")}>
			{totalText}
		</span>
	);

	return (
		<button
			type="button"
			disabled={disabled}
			onClick={() => setSelectedPrice(marketName, level.price)}
			data-orderbook-side={side}
			data-orderbook-rank={rank}
			data-orderbook-price={level.price}
			data-orderbook-hover={disabled ? undefined : hoverState}
			data-orderbook-hover-edge="bottom"
			aria-describedby={!disabled && hoverState === "active" ? tooltipId : undefined}
			aria-label={`${sideLabel}, ${t`Price`} ${priceText}, ${t`Size`} ${sizeText}, ${t`Total`} ${totalText}. ${t`Use ${priceText} as limit price`}`}
			className="orderbook-row group relative block h-[var(--orderbook-row-height,23px)] w-full shrink-0 cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus disabled:cursor-default"
		>
			<span
				className={cn("absolute inset-y-0 pointer-events-none", isAsk ? "depth-bar-ask" : "depth-bar-bid")}
				style={{ width: `${depthPct}%`, [isAsk ? "left" : "right"]: 0, [isAsk ? "right" : "left"]: "auto" }}
			/>
			{!disabled && pulse && onPulseEnd && (
				<OrderbookLevelPulse key={pulse.id} event={pulse} onAnimationEnd={onPulseEnd} />
			)}
			<span className="relative z-10 grid h-full items-center grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1 px-2 py-0.5 text-2xs">
				{isAsk ? (
					<>
						{price}
						{total}
					</>
				) : (
					<>
						{total}
						{price}
					</>
				)}
			</span>
		</button>
	);
}

function useOrderbookLadderRows(defaultRows: number, enabled: boolean, metrics: MobileOrderbookRowMetrics) {
	const [height, ladderRef] = useOrderbookHeight<HTMLDivElement>(enabled);
	const layout =
		height > 0
			? getOrderbookLadderLayout(height, metrics)
			: { rowCount: defaultRows, fullRowCount: 0, rowHeightPx: metrics.rowHeightPx };
	return [layout, ladderRef] as const;
}

function useOrderbookHeight<T extends HTMLElement>(enabled = true) {
	const elementRef = useRef<T>(null);
	const [height, setHeight] = useState(0);

	useEffect(() => {
		if (!enabled) return;
		const element = elementRef.current;
		if (!element) return;

		function measure() {
			if (element) setHeight(element.getBoundingClientRect().height);
		}

		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [enabled]);

	return [enabled ? height : 0, elementRef] as const;
}
