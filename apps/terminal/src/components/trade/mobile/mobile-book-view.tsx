import { Button, Dropdown, type DropdownItem } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ArrowsClockwiseIcon, ArrowsLeftRightIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { getBaseQuoteFromPairName } from "@/domain/market";
import { useOrderbookMidPrice } from "@/hooks/trade/use-orderbook-mid-price";
import { cn } from "@/lib/cn";
import { formatNumber, szDecimalsToPriceDecimals } from "@/lib/format";
import {
	type SubEvent,
	type SubParams,
	useHyperliquid,
	useSelectedMarketInfo,
	useSubscription,
} from "@/lib/hyperliquid";
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
import { tradingPanelDropdownPopupClass } from "@/lib/ui/trading-dropdown";
import { useGlobalSettings, useGlobalSettingsActions } from "@/stores/use-global-settings-store";
import { useOrderbookActions } from "@/stores/use-orderbook-actions-store";
import { OrderbookRow } from "../orderbook/orderbook-row";
import { TradesPanel } from "../orderbook/trades-panel";
import { MobileBottomNavSpacer } from "./mobile-bottom-nav";
import {
	getMobileOrderbookRowsForLadderHeight,
	MOBILE_ORDERBOOK_ROW_METRICS,
	type MobileOrderbookRowMetrics,
} from "./mobile-orderbook-layout";

const DEFAULT_LEVEL_COUNT = 12;
const COMPACT_LEVEL_COUNT = 5;
const MIN_LEVEL_COUNT = 3;
const LADDER_RESIZE_SETTLE_MS = 120;
const PLACEHOLDER_ROW_KEYS = Array.from({ length: 64 }, (_, index) => `placeholder-${index}`);
const ORDERBOOK_SUBSCRIPTION_KEEP_ALIVE_MS = 10_000;
const ORDERBOOK_SNAPSHOT_CACHE_TTL_MS = 10_000;
const ORDERBOOK_SNAPSHOT_CACHE_MAX_KEYS = 12;

type L2BookEvent = SubEvent<"l2Book">;
type L2BookParams = SubParams<"l2Book">;
type CachedOrderbookSnapshot = { key: string; data: L2BookEvent; savedAtMonotonic: number };

const DISABLED_L2_BOOK_PARAMS: L2BookParams = { coin: "" };
const orderbookSnapshotCache = new Map<string, CachedOrderbookSnapshot>();

function getOrderbookSnapshotCacheKey(env: string, params: L2BookParams | null): string | null {
	if (!params?.coin) return null;
	return `${env}:${params.coin}:${getPriceGroupingKey(params)}:${params.fast ? "fast" : "full"}`;
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

function writeOrderbookSnapshotCache(key: string, data: L2BookEvent): CachedOrderbookSnapshot | null {
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
	view?: View;
}

export function MobileBookView({
	active = true,
	className,
	compact,
	inTabLayout,
	view: viewProp,
}: MobileBookViewProps) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const { env } = useHyperliquid();
	const [internalView, setView] = useState<View>("book");
	const view = viewProp ?? internalView;
	const [compactOrderbookMode, setCompactOrderbookMode] = useState<CompactOrderbookMode>("both");
	const [selectedOptionKey, setSelectedOptionKey] = useState<string | null>(null);
	const { showOrderbookInQuote } = useGlobalSettings();
	const { setShowOrderbookInQuote } = useGlobalSettingsActions();

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
	const bookCacheKey = useMemo(() => getOrderbookSnapshotCacheKey(env, subscriptionParams), [env, subscriptionParams]);
	const isBookViewActive = active && view === "book";
	const keepSubscriptionWarm = useWarmBoolean(isBookViewActive, ORDERBOOK_SUBSCRIPTION_KEEP_ALIVE_MS);
	const subscriptionEnabled = keepSubscriptionWarm && !!selectedMarket && !!subscriptionParams;

	const {
		data: liveBook,
		isStale,
		status: bookStatus,
	} = useSubscription("l2Book", subscriptionParams ?? DISABLED_L2_BOOK_PARAMS, {
		enabled: subscriptionEnabled,
	});
	const matchingLiveBook =
		liveBook &&
		subscriptionParams &&
		liveBook.coin === subscriptionParams.coin &&
		Boolean(liveBook.fast) === Boolean(subscriptionParams.fast) &&
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
	} = useOrderbookMidPrice(isBookViewActive ? name : undefined);
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
	const displayBookStatus = hasBookFailure ? "error" : bookStatus;
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
	const mid = spreadInfo?.mid ?? bboMid;

	const [midDirection, setMidDirection] = useState<"up" | "down" | "flat">("flat");
	const lastMidRef = useRef<{ key: string | null; value: string | undefined }>({ key: null, value: undefined });

	useEffect(() => {
		const midValue = toBig(mid);
		if (!midValue) return;
		const key = bookCacheKey;
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
	}, [bookCacheKey, mid]);

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
						bookStatus={displayBookStatus}
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
						spreadText={spreadText}
						selectedOptionLabel={selectedOption?.label ?? FALLBACK_VALUE_PLACEHOLDER}
						priceGroupingOptions={priceGroupingOptions}
						setSelectedOptionKey={setSelectedOptionKey}
						mode={compactOrderbookMode}
						onModeChange={setCompactOrderbookMode}
						priceToken={quoteToken}
						sizeToken={showOrderbookInQuote ? quoteToken : baseToken}
					/>
				) : (
					<SplitOrderbook
						asks={asks}
						bids={bids}
						bookStatus={displayBookStatus}
						enabled={isBookViewActive}
						hasSnapshot={!!book}
						isInteractive={isBookInteractive}
						isTransitioning={isTransitioningBook}
						marketName={name}
						priceDecimals={displayPriceDecimals}
						showOrderbookInQuote={showOrderbookInQuote}
						szDecimals={szDecimals}
						spreadText={spreadText}
					/>
				)
			) : (
				<div className="flex-1 min-h-0 flex flex-col">{active && <TradesPanel key={name} compact={compact} />}</div>
			)}

			{!inTabLayout && <MobileBottomNavSpacer />}
		</div>
	);
}

interface OrderbookLayoutProps {
	asks: BookLevel[];
	bids: BookLevel[];
	bookStatus: string;
	hasSnapshot: boolean;
	isInteractive: boolean;
	isTransitioning: boolean;
	marketName: string;
	priceDecimals: number;
	showOrderbookInQuote: boolean;
	szDecimals: number;
}

interface CompactOrderbookProps extends OrderbookLayoutProps {
	flashResetKey: string;
	mid: string | undefined;
	midDirection: "up" | "down" | "flat";
	spreadText: string;
	selectedOptionLabel: string;
	priceGroupingOptions: L2BookPriceGroupOption[];
	setSelectedOptionKey: (key: string) => void;
	mode: CompactOrderbookMode;
	onModeChange: (mode: CompactOrderbookMode) => void;
	priceToken: string;
	sizeToken: string;
}

export function CompactOrderbook({
	asks,
	bids,
	bookStatus,
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
	spreadText,
	selectedOptionLabel,
	priceGroupingOptions,
	setSelectedOptionKey,
	mode,
	onModeChange,
	priceToken,
	sizeToken,
}: CompactOrderbookProps) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const askLevelCount = COMPACT_LEVEL_COUNT;
	const bidLevelCount = COMPACT_LEVEL_COUNT;
	const hasAsks = asks.length > 0;
	const hasBids = bids.length > 0;
	const showError = bookStatus === "error" && !hasAsks && !hasBids;
	const showAsks = mode !== "bids";
	const showBids = mode !== "asks";
	const askMaxTotal = getVisibleMaxTotal(asks, askLevelCount);
	const bidMaxTotal = getVisibleMaxTotal(bids, bidLevelCount);

	if (showError) {
		return <OrderbookStatus bookStatus={bookStatus} />;
	}

	return (
		<div className="flex-1 min-h-0 flex flex-col overflow-hidden font-market-close text-trading-panel-fg">
			<div className="grid h-[35px] shrink-0 grid-cols-2 items-center gap-1 border-b border-trading-panel-stroke-row pl-2 pr-3 text-xs tracking-normal text-trading-panel-subtle uppercase">
				<div className="min-w-0 truncate" title={`${t`Price`} ${priceToken}`}>
					{t`Price`}{" "}
					<span data-slot="compact-orderbook-price-token" className="normal-case max-[339px]:hidden">
						{priceToken}
					</span>
				</div>
				<div className="min-w-0 truncate text-right" title={`${t`Size`} ${sizeToken}`}>
					{t`Size`}{" "}
					<span data-slot="compact-orderbook-size-token" className="normal-case max-[339px]:hidden">
						{sizeToken}
					</span>
				</div>
			</div>

			<fieldset
				disabled={!isInteractive}
				aria-busy={isTransitioning}
				className={cn(
					"relative m-0 flex flex-1 min-h-0 flex-col overflow-hidden border-0 p-0",
					!isInteractive && "pointer-events-none",
				)}
			>
				<div
					data-slot="compact-orderbook-asks"
					className={cn("flex-1 min-h-0 flex flex-col justify-end gap-[4px] overflow-hidden", !showAsks && "hidden")}
				>
					{hasAsks ? (
						asks
							.slice(0, askLevelCount)
							.reverse()
							.map((level) => (
								<OrderbookRow
									key={`ask-${level.price}`}
									disabled={!isInteractive}
									flashResetKey={flashResetKey}
									level={level}
									marketName={marketName}
									side="ask"
									maxTotal={askMaxTotal}
									priceDecimals={priceDecimals}
									showInQuote={showOrderbookInQuote}
									szDecimals={szDecimals}
									compact
								/>
							))
					) : hasSnapshot ? (
						<OrderbookEmptySide compact />
					) : (
						<OrderbookSkeletonRows rows={askLevelCount} align="end" compact />
					)}
				</div>

				{mode === "both" && (
					<div
						data-slot="compact-orderbook-mid"
						data-direction={midDirection}
						title={`${t`Spread`}: ${spreadText}`}
						className="shrink-0 flex h-[28px] items-center justify-start border-y border-trading-panel-stroke-row bg-trading-panel-card px-2 gap-1.5"
					>
						<span
							className={cn(
								"tabular-nums text-base",
								midDirection === "up" && "text-trading-panel-success",
								midDirection === "down" && "text-trading-panel-error",
								midDirection === "flat" && "text-trading-panel-fg",
							)}
						>
							{mid ? formatNumber(mid, priceDecimals) : FALLBACK_VALUE_PLACEHOLDER}
						</span>
						<MidTrendIcon direction={midDirection} className="size-4" />
					</div>
				)}

				<div
					data-slot="compact-orderbook-bids"
					className={cn("flex-1 min-h-0 flex flex-col justify-start gap-[4px] overflow-hidden", !showBids && "hidden")}
				>
					{hasBids ? (
						bids
							.slice(0, bidLevelCount)
							.map((level) => (
								<OrderbookRow
									key={`bid-${level.price}`}
									disabled={!isInteractive}
									flashResetKey={flashResetKey}
									level={level}
									marketName={marketName}
									side="bid"
									maxTotal={bidMaxTotal}
									priceDecimals={priceDecimals}
									showInQuote={showOrderbookInQuote}
									szDecimals={szDecimals}
									compact
								/>
							))
					) : hasSnapshot ? (
						<OrderbookEmptySide compact />
					) : (
						<OrderbookSkeletonRows rows={bidLevelCount} compact />
					)}
				</div>
				{isTransitioning && hasSnapshot && <OrderbookBusyOverlay />}
			</fieldset>
			{isTransitioning && <OrderbookLoadingAnnouncement />}

			<div className="shrink-0 h-11 border-t border-trading-panel-stroke-row flex items-center gap-1 text-trading-panel-muted pl-2 pr-1 text-xs max-[339px]:pl-1">
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
				<span data-slot="compact-orderbook-spread" className="sr-only">
					{t`Spread`}: {spreadText}
				</span>
				<span className="min-w-0 flex-1" aria-hidden="true" />
				<CompactOrderbookModeControls mode={mode} onModeChange={onModeChange} />
			</div>
		</div>
	);
}

function getVisibleMaxTotal(levels: BookLevel[], levelCount: number): string {
	return getSideMaxTotal(levels.slice(0, levelCount));
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
		{ mode: "asks", label: t`Show asks only`, bars: ["ask", "ask"] },
		{ mode: "both", label: t`Show both sides`, bars: ["ask", "bid"] },
		{ mode: "bids", label: t`Show bids only`, bars: ["bid", "bid"] },
	];

	const selectedOption = options.find((option) => option.mode === mode) ?? options[1];

	return (
		<Dropdown
			size="sm"
			hideCaret
			triggerVariant="minimal"
			triggerAriaLabel={t`Order book view`}
			align="end"
			trigger={<OrderbookModeIcon bars={selectedOption.bars} selected />}
			triggerClassName="size-11 shrink-0 p-0 text-trading-panel-muted"
			popupClassName={tradingPanelDropdownPopupClass}
			items={options.map(
				(option): DropdownItem => ({
					label: option.label,
					icon: <OrderbookModeIcon bars={option.bars} />,
					active: option.mode === mode,
					onSelect: () => onModeChange(option.mode),
				}),
			)}
		/>
	);
}

function OrderbookModeIcon({ bars, selected }: { bars: Array<"ask" | "bid">; selected?: boolean }) {
	return (
		<span
			className={cn(
				"grid size-3 grid-rows-2 overflow-hidden rounded-[3px]",
				selected && "outline outline-1 outline-offset-1 outline-trading-panel-control",
			)}
			aria-hidden="true"
		>
			<span
				style={{
					backgroundColor: bars[0] === "ask" ? "var(--trading-panel-error)" : "var(--trading-panel-success)",
				}}
			/>
			<span
				style={{
					backgroundColor: bars[1] === "ask" ? "var(--trading-panel-error)" : "var(--trading-panel-success)",
				}}
			/>
		</span>
	);
}

interface SplitOrderbookProps extends OrderbookLayoutProps {
	enabled: boolean;
	spreadText: string;
}

function SplitOrderbook({
	asks,
	bids,
	bookStatus,
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
	const [askLevelCount, askLadderRef] = useOrderbookLadderRows(
		DEFAULT_LEVEL_COUNT,
		enabled,
		MOBILE_ORDERBOOK_ROW_METRICS.default,
	);
	const [bidLevelCount, bidLadderRef] = useOrderbookLadderRows(
		DEFAULT_LEVEL_COUNT,
		enabled,
		MOBILE_ORDERBOOK_ROW_METRICS.default,
	);
	const visibleAsks = useMemo(() => asks.slice(0, askLevelCount), [asks, askLevelCount]);
	const visibleBids = useMemo(() => bids.slice(0, bidLevelCount), [bids, bidLevelCount]);
	const hasAsks = visibleAsks.length > 0;
	const hasBids = visibleBids.length > 0;
	const showError = bookStatus === "error" && !hasAsks && !hasBids;
	const askMaxTotal = getVisibleMaxTotal(visibleAsks, askLevelCount);
	const bidMaxTotal = getVisibleMaxTotal(visibleBids, bidLevelCount);

	return (
		<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
			<div className="shrink-0 border-b border-stroke-weak/40 bg-background">
				<div className="flex items-center justify-between gap-2 px-3 py-1.5 text-2xs text-fg-muted">
					<span>{t`Spread`}</span>
					<span className="tabular-nums text-trading-panel-subtle">{spreadText}</span>
				</div>
				<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-px px-2 pb-1.5 text-2xs uppercase tracking-wider text-fg-muted">
					<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1">
						<div>{t`Total`}</div>
						<div className="text-right">{t`Price`}</div>
					</div>
					<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1">
						<div>{t`Price`}</div>
						<div className="text-right">{t`Total`}</div>
					</div>
				</div>
			</div>

			{showError ? (
				<OrderbookStatus bookStatus={bookStatus} />
			) : (
				<fieldset
					disabled={!isInteractive}
					aria-busy={isTransitioning}
					className={cn(
						"relative m-0 grid flex-1 min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-px overflow-hidden border-0 p-0",
						!isInteractive && "pointer-events-none",
					)}
				>
					<div ref={bidLadderRef} className="min-h-0 overflow-hidden py-1 flex flex-col gap-[2px]">
						{hasBids ? (
							<>
								{visibleBids.map((level) => (
									<SplitOrderbookRow
										key={`bid-${level.price}`}
										disabled={!isInteractive}
										level={level}
										marketName={marketName}
										side="bid"
										maxTotal={bidMaxTotal}
										priceDecimals={priceDecimals}
										showInQuote={showOrderbookInQuote}
										szDecimals={szDecimals}
									/>
								))}
								{PLACEHOLDER_ROW_KEYS.slice(0, Math.max(0, bidLevelCount - visibleBids.length)).map((key) => (
									<OrderbookPlaceholderRow key={`bid-${key}`} />
								))}
							</>
						) : hasSnapshot ? (
							<OrderbookEmptySide />
						) : (
							<OrderbookSkeletonRows rows={bidLevelCount} />
						)}
					</div>

					<div ref={askLadderRef} className="min-h-0 overflow-hidden py-1 flex flex-col gap-[2px]">
						{hasAsks ? (
							<>
								{visibleAsks.map((level) => (
									<SplitOrderbookRow
										key={`ask-${level.price}`}
										disabled={!isInteractive}
										level={level}
										marketName={marketName}
										side="ask"
										maxTotal={askMaxTotal}
										priceDecimals={priceDecimals}
										showInQuote={showOrderbookInQuote}
										szDecimals={szDecimals}
									/>
								))}
								{PLACEHOLDER_ROW_KEYS.slice(0, Math.max(0, askLevelCount - visibleAsks.length)).map((key) => (
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
			)}
			{!showError && isTransitioning && <OrderbookLoadingAnnouncement />}
		</div>
	);
}

function OrderbookStatus({ bookStatus }: { bookStatus: string }) {
	const { t } = useLingui();

	return (
		<div className="flex-1 flex items-center justify-center">
			{bookStatus === "error" ? (
				<div role="alert" className="text-sm text-error">
					{t`Failed to load order book.`}
				</div>
			) : (
				<output aria-live="polite" className="flex flex-col items-center gap-2 text-fg-muted">
					<ArrowsClockwiseIcon className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
					<span className="text-sm">{t`Waiting for order book...`}</span>
				</output>
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

function OrderbookSkeletonRows({ rows, align, compact }: { rows: number; align?: "end"; compact?: boolean }) {
	return (
		<>
			{PLACEHOLDER_ROW_KEYS.slice(0, rows).map((key, index) => (
				<OrderbookSkeletonRow key={key} index={index} align={align} compact={compact} />
			))}
		</>
	);
}

function OrderbookSkeletonRow({ index, align, compact }: { index: number; align?: "end"; compact?: boolean }) {
	const firstWidth = 42 + ((index * 17) % 22);
	const secondWidth = 32 + ((index * 13) % 26);

	return (
		<div className={cn("shrink-0 px-2 py-1", compact ? "h-[24px]" : "h-[23px]")}>
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
	disabled?: boolean;
	level: BookLevel;
	marketName: string;
	side: "ask" | "bid";
	maxTotal: string;
	priceDecimals: number;
	showInQuote: boolean;
	szDecimals: number;
}

export function SplitOrderbookRow({
	disabled = false,
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
	const depthPct = getDepthPercentage(level.total, maxTotal);
	const totalValue = showInQuote ? level.quoteTotal : level.total;
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
			title={priceText}
			aria-label={`${sideLabel}, ${t`Price`} ${priceText}, ${t`Size`} ${sizeText}, ${t`Total`} ${totalText}. ${t`Use ${priceText} as limit price`}`}
			className="group relative block h-[23px] w-full shrink-0 cursor-pointer overflow-hidden text-left hover:bg-fill-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus disabled:cursor-default"
		>
			<span
				className={cn("absolute inset-y-0 pointer-events-none", isAsk ? "depth-bar-ask" : "depth-bar-bid")}
				style={{ width: `${depthPct}%`, [isAsk ? "left" : "right"]: 0, [isAsk ? "right" : "left"]: "auto" }}
			/>
			<span className="relative z-10 grid h-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1 px-2 py-0.5 text-2xs">
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
	const ladderRef = useRef<HTMLDivElement>(null);
	const [rows, setRows] = useState(defaultRows);
	const minRows = Math.min(defaultRows, MIN_LEVEL_COUNT);

	useEffect(() => {
		if (!enabled) {
			setRows(defaultRows);
			return;
		}

		const el = ladderRef.current;
		if (!el) return;

		let settleTimer: ReturnType<typeof setTimeout> | null = null;

		function updateRows(height: number, settle: boolean) {
			const nextRows = getMobileOrderbookRowsForLadderHeight(height, metrics, minRows);
			if (nextRows == null) return;
			if (settleTimer) clearTimeout(settleTimer);
			if (!settle) {
				setRows(nextRows);
				return;
			}
			settleTimer = setTimeout(() => setRows(nextRows), LADDER_RESIZE_SETTLE_MS);
		}

		updateRows(el.getBoundingClientRect().height, false);

		if (typeof ResizeObserver === "undefined") return;

		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			updateRows(entry.target.getBoundingClientRect().height, true);
		});
		observer.observe(el);
		return () => {
			observer.disconnect();
			if (settleTimer) clearTimeout(settleTimer);
		};
	}, [defaultRows, enabled, minRows, metrics]);

	return [rows, ladderRef] as const;
}

function OrderbookPlaceholderRow() {
	return <div className="h-[23px] shrink-0" aria-hidden="true" />;
}

function MidTrendIcon({ direction, className }: { direction: "up" | "down" | "flat"; className?: string }) {
	if (direction === "up") return <TrendUpIcon className={cn("text-trading-panel-success", className)} />;
	if (direction === "down") return <TrendDownIcon className={cn("text-trading-panel-error", className)} />;
	return null;
}
