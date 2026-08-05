import { Button, Dropdown, type DropdownItem } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ArrowsClockwiseIcon, ArrowsLeftRightIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { getBaseQuoteFromPairName } from "@/domain/market";
import { cn } from "@/lib/cn";
import { formatNumber, szDecimalsToPriceDecimals } from "@/lib/format";
import { type SubEvent, type SubParams, useSelectedMarketInfo, useSubscription } from "@/lib/hyperliquid";
import { toNumber } from "@/lib/trade/numbers";
import {
	type BookLevel,
	getL2BookSubscriptionParams,
	getPriceGroupingKey,
	getPriceGroupingOptions,
	getRawSpreadInfo,
	type L2BookPriceGroupOption,
	processLevels,
} from "@/lib/trade/orderbook";
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
const PLACEHOLDER_ROW_KEYS = Array.from({ length: 64 }, (_, index) => `placeholder-${index}`);
const ORDERBOOK_SUBSCRIPTION_KEEP_ALIVE_MS = 10_000;
const ORDERBOOK_SNAPSHOT_CACHE_TTL_MS = 10_000;
const ORDERBOOK_SNAPSHOT_CACHE_MAX_KEYS = 12;

type L2BookEvent = SubEvent<"l2Book">;
type L2BookParams = SubParams<"l2Book">;
type CachedOrderbookSnapshot = { key: string; data: L2BookEvent; savedAt: number };
type VisibleOrderbookSnapshot = {
	key: string;
	data: L2BookEvent;
	priceDecimals: number;
	szDecimals: number;
};

const DISABLED_L2_BOOK_PARAMS: L2BookParams = { coin: "" };
const orderbookSnapshotCache = new Map<string, CachedOrderbookSnapshot>();

function getOrderbookSnapshotCacheKey(params: L2BookParams | null): string | null {
	if (!params?.coin) return null;
	return `${params.coin}:${getPriceGroupingKey(params)}`;
}

function getFreshOrderbookSnapshotCache(key: string | null): CachedOrderbookSnapshot | null {
	if (!key) return null;
	const snapshot = orderbookSnapshotCache.get(key);
	if (!snapshot) return null;
	if (Date.now() - snapshot.savedAt > ORDERBOOK_SNAPSHOT_CACHE_TTL_MS) {
		return null;
	}
	return snapshot;
}

function readOrderbookSnapshotCache(key: string | null): CachedOrderbookSnapshot | null {
	const snapshot = getFreshOrderbookSnapshotCache(key);
	if (!snapshot && key) {
		orderbookSnapshotCache.delete(key);
	}
	return snapshot;
}

function writeOrderbookSnapshotCache(key: string, data: L2BookEvent): CachedOrderbookSnapshot {
	const snapshot = { key, data, savedAt: Date.now() };
	orderbookSnapshotCache.delete(key);
	orderbookSnapshotCache.set(key, snapshot);

	for (const [cachedKey, cachedSnapshot] of orderbookSnapshotCache) {
		if (
			orderbookSnapshotCache.size <= ORDERBOOK_SNAPSHOT_CACHE_MAX_KEYS &&
			Date.now() - cachedSnapshot.savedAt <= ORDERBOOK_SNAPSHOT_CACHE_TTL_MS
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

interface MobileBookViewProps {
	className?: string;
	/** Narrow split-column mode: hide all chrome, render compact 2-col rows. */
	compact?: boolean;
	/** Embedded in a parent tab layout: hide the Book/Trades toggle + bottom spacer; view is parent-controlled. */
	inTabLayout?: boolean;
	view?: View;
}

export function MobileBookView({ className, compact, inTabLayout, view: viewProp }: MobileBookViewProps) {
	const { t } = useLingui();
	const [internalView, setView] = useState<View>("book");
	const view = viewProp ?? internalView;
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
		return getL2BookSubscriptionParams(name, selectedOption);
	}, [name, selectedOption]);
	const bookCacheKey = useMemo(() => getOrderbookSnapshotCacheKey(subscriptionParams), [subscriptionParams]);
	const keepSubscriptionWarm = useWarmBoolean(view === "book", ORDERBOOK_SUBSCRIPTION_KEEP_ALIVE_MS);
	const subscriptionEnabled = keepSubscriptionWarm && !!selectedMarket && !!subscriptionParams;

	const { data: liveBook, status: bookStatus } = useSubscription(
		"l2Book",
		subscriptionParams ?? DISABLED_L2_BOOK_PARAMS,
		{
			enabled: subscriptionEnabled,
		},
	);
	const [cachedSnapshot, setCachedSnapshot] = useState<CachedOrderbookSnapshot | null>(() =>
		readOrderbookSnapshotCache(bookCacheKey),
	);
	const freshCachedSnapshot = useMemo(() => getFreshOrderbookSnapshotCache(bookCacheKey), [bookCacheKey]);

	useEffect(() => {
		setCachedSnapshot(readOrderbookSnapshotCache(bookCacheKey));
	}, [bookCacheKey]);

	useEffect(() => {
		if (!bookCacheKey || !liveBook) return;
		const snapshot = writeOrderbookSnapshotCache(bookCacheKey, liveBook);
		setCachedSnapshot(snapshot);
	}, [bookCacheKey, liveBook]);

	const cachedBook = cachedSnapshot?.key === bookCacheKey ? cachedSnapshot.data : freshCachedSnapshot?.data;
	const currentSnapshot = useMemo<VisibleOrderbookSnapshot | null>(() => {
		if (!bookCacheKey) return null;
		const data = liveBook ?? cachedBook;
		if (!data) return null;
		return { key: bookCacheKey, data, priceDecimals, szDecimals };
	}, [bookCacheKey, cachedBook, liveBook, priceDecimals, szDecimals]);
	const [visibleSnapshot, setVisibleSnapshot] = useState<VisibleOrderbookSnapshot | null>(() => {
		const snapshot = readOrderbookSnapshotCache(bookCacheKey);
		if (!snapshot) return null;
		return { key: snapshot.key, data: snapshot.data, priceDecimals, szDecimals };
	});

	useEffect(() => {
		if (!currentSnapshot) return;
		setVisibleSnapshot(currentSnapshot);
	}, [currentSnapshot]);

	const displaySnapshot = currentSnapshot ?? (bookStatus === "error" ? null : visibleSnapshot);
	const isTransitioningBook = !!displaySnapshot && displaySnapshot.key !== bookCacheKey;
	const book = displaySnapshot?.data;
	const displayPriceDecimals = displaySnapshot?.priceDecimals ?? priceDecimals;
	const displaySzDecimals = displaySnapshot?.szDecimals ?? szDecimals;
	const flashResetKey = displaySnapshot?.key ?? bookCacheKey ?? "";

	const bids = useMemo(() => processLevels(book?.levels[0]), [book?.levels]);
	const asks = useMemo(() => processLevels(book?.levels[1]), [book?.levels]);
	const levelCount = compact ? COMPACT_LEVEL_COUNT : DEFAULT_LEVEL_COUNT;
	const rowMetrics = compact ? MOBILE_ORDERBOOK_ROW_METRICS.compact : MOBILE_ORDERBOOK_ROW_METRICS.default;
	const [askLevelCount, askLadderRef] = useOrderbookLadderRows(levelCount, view === "book", rowMetrics);
	const [bidLevelCount, bidLadderRef] = useOrderbookLadderRows(levelCount, view === "book", rowMetrics);
	const visibleAsks = useMemo(() => asks.slice(0, askLevelCount), [asks, askLevelCount]);
	const visibleBids = useMemo(() => bids.slice(0, bidLevelCount), [bids, bidLevelCount]);

	const maxTotal = useMemo(() => {
		const totals = [...visibleAsks, ...visibleBids].map((r) => r.total);
		return totals.length > 0 ? Math.max(...totals) : 0;
	}, [visibleAsks, visibleBids]);

	const bestBid = bids[0]?.price;
	const bestAsk = asks[0]?.price;
	const mid = useMemo(() => {
		if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk)) return undefined;
		return (bestBid + bestAsk) / 2;
	}, [bestBid, bestAsk]);

	const [midDirection, setMidDirection] = useState<"up" | "down" | "flat">("flat");
	const lastMidRef = useRef<{ key: string | null; value: number | undefined }>({ key: null, value: undefined });

	useEffect(() => {
		if (typeof mid !== "number" || !Number.isFinite(mid)) return;
		const key = displaySnapshot?.key ?? null;
		const last = lastMidRef.current;
		if (last.key !== key) {
			setMidDirection("flat");
			lastMidRef.current = { key, value: mid };
			return;
		}

		if (typeof last.value === "number" && Number.isFinite(last.value)) {
			if (mid > last.value) setMidDirection("up");
			else if (mid < last.value) setMidDirection("down");
			else setMidDirection("flat");
		}
		lastMidRef.current = { key, value: mid };
	}, [displaySnapshot?.key, mid]);

	const spreadInfo = useMemo(() => getRawSpreadInfo(book?.levels), [book?.levels]);
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
						asks={visibleAsks}
						bids={visibleBids}
						askLevelCount={askLevelCount}
						bidLevelCount={bidLevelCount}
						askLadderRef={askLadderRef}
						bidLadderRef={bidLadderRef}
						bookStatus={bookStatus}
						flashResetKey={flashResetKey}
						isTransitioning={isTransitioningBook}
						maxTotal={maxTotal}
						priceDecimals={displayPriceDecimals}
						showOrderbookInQuote={showOrderbookInQuote}
						szDecimals={displaySzDecimals}
						mid={mid}
						midDirection={midDirection}
						spreadText={spreadText}
						selectedOptionLabel={selectedOption?.label ?? FALLBACK_VALUE_PLACEHOLDER}
						priceGroupingOptions={priceGroupingOptions}
						setSelectedOptionKey={setSelectedOptionKey}
					/>
				) : (
					<SplitOrderbook
						asks={visibleAsks}
						bids={visibleBids}
						askLevelCount={askLevelCount}
						bidLevelCount={bidLevelCount}
						askLadderRef={askLadderRef}
						bidLadderRef={bidLadderRef}
						bookStatus={bookStatus}
						isTransitioning={isTransitioningBook}
						maxTotal={maxTotal}
						priceDecimals={displayPriceDecimals}
						showOrderbookInQuote={showOrderbookInQuote}
						szDecimals={displaySzDecimals}
						spreadText={spreadText}
					/>
				)
			) : (
				<div className="flex-1 min-h-0 flex flex-col">
					<TradesPanel key={name} compact={compact} />
				</div>
			)}

			{!inTabLayout && <MobileBottomNavSpacer />}
		</div>
	);
}

interface OrderbookLayoutProps {
	asks: BookLevel[];
	bids: BookLevel[];
	askLevelCount: number;
	bidLevelCount: number;
	askLadderRef: RefObject<HTMLDivElement | null>;
	bidLadderRef: RefObject<HTMLDivElement | null>;
	bookStatus: string;
	isTransitioning: boolean;
	maxTotal: number;
	priceDecimals: number;
	showOrderbookInQuote: boolean;
	szDecimals: number;
}

interface CompactOrderbookProps extends OrderbookLayoutProps {
	flashResetKey: string;
	mid: number | undefined;
	midDirection: "up" | "down" | "flat";
	spreadText: string;
	selectedOptionLabel: string;
	priceGroupingOptions: L2BookPriceGroupOption[];
	setSelectedOptionKey: (key: string) => void;
}

function CompactOrderbook({
	asks,
	bids,
	askLevelCount,
	bidLevelCount,
	askLadderRef,
	bidLadderRef,
	bookStatus,
	flashResetKey,
	isTransitioning,
	maxTotal,
	priceDecimals,
	showOrderbookInQuote,
	szDecimals,
	mid,
	midDirection,
	spreadText,
	selectedOptionLabel,
	priceGroupingOptions,
	setSelectedOptionKey,
}: CompactOrderbookProps) {
	const { t } = useLingui();
	const hasAsks = asks.length > 0;
	const hasBids = bids.length > 0;
	const showError = bookStatus === "error" && !hasAsks && !hasBids;

	if (showError) {
		return <OrderbookStatus bookStatus={bookStatus} />;
	}

	return (
		<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
			<div className="shrink-0 grid h-[35px] items-center uppercase tracking-wider text-fg-muted border-b border-stroke-weak/40 grid-cols-2 gap-1 pl-2 pr-3 text-xs">
				<div>{t`Price`}</div>
				<div className="text-right">{t`Size`}</div>
			</div>

			<div
				aria-busy={isTransitioning}
				className={cn("flex-1 min-h-0 flex flex-col overflow-hidden", isTransitioning && "pointer-events-none")}
			>
				<div ref={askLadderRef} className="flex-1 min-h-0 flex flex-col justify-end gap-[4px] overflow-hidden">
					{hasAsks ? (
						<>
							{PLACEHOLDER_ROW_KEYS.slice(0, Math.max(0, askLevelCount - Math.min(asks.length, askLevelCount))).map(
								(key) => (
									<OrderbookPlaceholderRow key={`ask-${key}`} compact />
								),
							)}
							{asks
								.slice(0, askLevelCount)
								.reverse()
								.map((level, index) => (
									<OrderbookRow
										key={`ask-${level.price}-${index}`}
										flashResetKey={flashResetKey}
										level={level}
										side="ask"
										maxTotal={maxTotal}
										priceDecimals={priceDecimals}
										showInQuote={showOrderbookInQuote}
										szDecimals={szDecimals}
										compact
									/>
								))}
						</>
					) : (
						<OrderbookSkeletonRows rows={askLevelCount} align="end" compact />
					)}
				</div>

				<div className="shrink-0 flex h-[28px] items-center justify-center border-y border-stroke-weak/40 bg-surface px-2 gap-1.5">
					<span className="tabular-nums text-warning text-base">
						{typeof mid === "number" && Number.isFinite(mid)
							? formatNumber(mid, priceDecimals)
							: FALLBACK_VALUE_PLACEHOLDER}
					</span>
					<MidTrendIcon direction={midDirection} className="size-4" />
				</div>

				<div ref={bidLadderRef} className="flex-1 min-h-0 flex flex-col gap-[4px] overflow-hidden">
					{hasBids ? (
						<>
							{bids.slice(0, bidLevelCount).map((level, index) => (
								<OrderbookRow
									key={`bid-${level.price}-${index}`}
									flashResetKey={flashResetKey}
									level={level}
									side="bid"
									maxTotal={maxTotal}
									priceDecimals={priceDecimals}
									showInQuote={showOrderbookInQuote}
									szDecimals={szDecimals}
									compact
								/>
							))}
							{PLACEHOLDER_ROW_KEYS.slice(0, Math.max(0, bidLevelCount - Math.min(bids.length, bidLevelCount))).map(
								(key) => (
									<OrderbookPlaceholderRow key={`bid-${key}`} compact />
								),
							)}
						</>
					) : (
						<OrderbookSkeletonRows rows={bidLevelCount} compact />
					)}
				</div>
			</div>

			<div className="shrink-0 border-t border-stroke-weak/40 flex items-center justify-between text-fg-muted px-2 text-xs">
				<Dropdown
					size="sm"
					hideCaret
					align="start"
					trigger={selectedOptionLabel}
					triggerClassName="font-mono text-xs px-1.5"
					items={priceGroupingOptions.map(
						(option): DropdownItem => ({
							label: option.label,
							onSelect: () => setSelectedOptionKey(getPriceGroupingKey(option)),
						}),
					)}
				/>
				<span className="tabular-nums text-warning">{spreadText}</span>
			</div>
		</div>
	);
}

interface SplitOrderbookProps extends OrderbookLayoutProps {
	spreadText: string;
}

function SplitOrderbook({
	asks,
	bids,
	askLevelCount,
	bidLevelCount,
	askLadderRef,
	bidLadderRef,
	bookStatus,
	isTransitioning,
	maxTotal,
	priceDecimals,
	showOrderbookInQuote,
	szDecimals,
	spreadText,
}: SplitOrderbookProps) {
	const { t } = useLingui();
	const hasAsks = asks.length > 0;
	const hasBids = bids.length > 0;
	const showError = bookStatus === "error" && !hasAsks && !hasBids;

	return (
		<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
			<div className="shrink-0 border-b border-stroke-weak/40 bg-background">
				<div className="flex items-center justify-between gap-2 px-3 py-1.5 text-2xs text-fg-muted">
					<span>{t`Spread`}</span>
					<span className="tabular-nums text-warning">{spreadText}</span>
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
				<div
					aria-busy={isTransitioning}
					className={cn(
						"grid flex-1 min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-px overflow-hidden",
						isTransitioning && "pointer-events-none",
					)}
				>
					<div ref={bidLadderRef} className="min-h-0 overflow-hidden py-1 flex flex-col gap-[2px]">
						{hasBids ? (
							<>
								{bids.slice(0, bidLevelCount).map((level, index) => (
									<SplitOrderbookRow
										key={`bid-${level.price}-${index}`}
										level={level}
										side="bid"
										maxTotal={maxTotal}
										priceDecimals={priceDecimals}
										showInQuote={showOrderbookInQuote}
										szDecimals={szDecimals}
									/>
								))}
								{PLACEHOLDER_ROW_KEYS.slice(0, Math.max(0, bidLevelCount - Math.min(bids.length, bidLevelCount))).map(
									(key) => (
										<OrderbookPlaceholderRow key={`bid-${key}`} />
									),
								)}
							</>
						) : (
							<OrderbookSkeletonRows rows={bidLevelCount} />
						)}
					</div>

					<div ref={askLadderRef} className="min-h-0 overflow-hidden py-1 flex flex-col gap-[2px]">
						{hasAsks ? (
							<>
								{asks.slice(0, askLevelCount).map((level, index) => (
									<SplitOrderbookRow
										key={`ask-${level.price}-${index}`}
										level={level}
										side="ask"
										maxTotal={maxTotal}
										priceDecimals={priceDecimals}
										showInQuote={showOrderbookInQuote}
										szDecimals={szDecimals}
									/>
								))}
								{PLACEHOLDER_ROW_KEYS.slice(0, Math.max(0, askLevelCount - Math.min(asks.length, askLevelCount))).map(
									(key) => (
										<OrderbookPlaceholderRow key={`ask-${key}`} />
									),
								)}
							</>
						) : (
							<OrderbookSkeletonRows rows={askLevelCount} />
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function OrderbookStatus({ bookStatus }: { bookStatus: string }) {
	const { t } = useLingui();

	return (
		<div className="flex-1 flex items-center justify-center">
			{bookStatus === "error" ? (
				<div className="text-sm text-error">{t`Failed to load order book.`}</div>
			) : (
				<div className="flex flex-col items-center gap-2 text-fg-muted">
					<ArrowsClockwiseIcon className="size-5 animate-spin" />
					<span className="text-sm">{t`Waiting for order book...`}</span>
				</div>
			)}
		</div>
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
	level: BookLevel;
	side: "ask" | "bid";
	maxTotal: number;
	priceDecimals: number;
	showInQuote: boolean;
	szDecimals: number;
}

function SplitOrderbookRow({ level, side, maxTotal, priceDecimals, showInQuote, szDecimals }: SplitOrderbookRowProps) {
	const { setSelectedPrice } = useOrderbookActions();
	const isAsk = side === "ask";
	const depthPct = maxTotal > 0 ? (level.total / maxTotal) * 100 : 0;
	const totalValue = showInQuote ? level.total * level.price : level.total;
	const totalDecimals = showInQuote ? 2 : szDecimals;
	const price = (
		<button
			type="button"
			onClick={() => setSelectedPrice(level.price)}
			className={cn(
				"font-medium tabular-nums",
				isAsk ? "text-left orderbook-price-ask" : "text-right orderbook-price-bid",
			)}
		>
			{formatNumber(level.price, priceDecimals)}
		</button>
	);
	const total = (
		<div className={cn("truncate tabular-nums orderbook-value-text", isAsk ? "text-right" : "text-left")}>
			{formatNumber(totalValue, { decimals: totalDecimals, compact: true })}
		</div>
	);

	return (
		<div className="relative h-[23px] shrink-0 hover:bg-fill-hover cursor-pointer group overflow-hidden">
			<div
				className={cn("absolute inset-y-0 pointer-events-none", isAsk ? "depth-bar-ask" : "depth-bar-bid")}
				style={{ width: `${depthPct}%`, [isAsk ? "left" : "right"]: 0, [isAsk ? "right" : "left"]: "auto" }}
			/>
			<div className="relative z-10 grid h-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1 px-2 py-0.5 text-2xs">
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
			</div>
		</div>
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

		function updateRows(height: number) {
			const nextRows = getMobileOrderbookRowsForLadderHeight(height, metrics, minRows);
			if (nextRows == null) return;
			setRows(nextRows);
		}

		updateRows(el.getBoundingClientRect().height);

		if (typeof ResizeObserver === "undefined") return;

		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			updateRows(entry.target.getBoundingClientRect().height);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, [defaultRows, enabled, minRows, metrics]);

	return [rows, ladderRef] as const;
}

function OrderbookPlaceholderRow({ compact }: { compact?: boolean }) {
	return <div className={cn("shrink-0", compact ? "h-[24px]" : "h-[23px]")} aria-hidden="true" />;
}

function MidTrendIcon({ direction, className }: { direction: "up" | "down" | "flat"; className?: string }) {
	if (direction === "up") return <TrendUpIcon className={cn("text-success", className)} />;
	if (direction === "down") return <TrendDownIcon className={cn("text-error", className)} />;
	return null;
}
