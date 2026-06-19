import { Button, Dropdown, type DropdownItem } from "@gatu/ui";
import { ArrowsClockwiseIcon, ArrowsLeftRightIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { UI_TEXT } from "@/config/ui-text";
import { getBaseQuoteFromPairName } from "@/domain/market";
import { cn } from "@/lib/cn";
import { formatNumber, szDecimalsToPriceDecimals } from "@/lib/format";
import { useSelectedMarketInfo, useSubscription } from "@/lib/hyperliquid";
import { toNumber } from "@/lib/trade/numbers";
import { getPriceGroupingKey, getPriceGroupingOptions, processLevels } from "@/lib/trade/orderbook";
import { useGlobalSettings, useGlobalSettingsActions } from "@/stores/use-global-settings-store";
import { OrderbookRow } from "../orderbook/orderbook-row";
import { TradesPanel } from "../orderbook/trades-panel";
import { MobileBottomNavSpacer } from "./mobile-bottom-nav";

const ORDERBOOK_TEXT = UI_TEXT.ORDERBOOK;
const DEFAULT_LEVEL_COUNT = 12;
const COMPACT_LEVEL_COUNT = 5;
const ORDERBOOK_ROW_HEIGHT_PX = 20;
const ORDERBOOK_ROW_GAP_PX = 1;
const ORDERBOOK_LADDER_VERTICAL_PADDING_PX = 8;
const PLACEHOLDER_ROW_KEYS = Array.from({ length: 64 }, (_, index) => `placeholder-${index}`);

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
	const [internalView, setView] = useState<View>("book");
	const view = viewProp ?? internalView;
	const [selectedOptionKey, setSelectedOptionKey] = useState<string | null>(null);
	const { showOrderbookInQuote } = useGlobalSettings();
	const { setShowOrderbookInQuote } = useGlobalSettingsActions();

	const { data: selectedMarket } = useSelectedMarketInfo();
	const name = selectedMarket?.name ?? "";
	const szDecimals = selectedMarket?.szDecimals ?? 4;
	const referencePrice = toNumber(selectedMarket?.markPx) ?? undefined;
	const priceGroupingOptions = useMemo(() => getPriceGroupingOptions(referencePrice), [referencePrice]);
	const selectedOption = useMemo(
		() => priceGroupingOptions.find((option) => option.key === selectedOptionKey) ?? priceGroupingOptions[0] ?? null,
		[priceGroupingOptions, selectedOptionKey],
	);
	const priceDecimals = selectedOption?.decimals ?? szDecimalsToPriceDecimals(szDecimals);

	const { data: book, status: bookStatus } = useSubscription(
		"l2Book",
		{
			coin: name,
			nSigFigs: selectedOption?.nSigFigs ?? 5,
			mantissa: selectedOption?.mantissa,
		},
		{
			enabled: view === "book" && !!selectedMarket && !!name,
		},
	);

	const bids = useMemo(() => processLevels(book?.levels[0]), [book?.levels]);
	const asks = useMemo(() => processLevels(book?.levels[1]), [book?.levels]);
	const levelCount = compact ? COMPACT_LEVEL_COUNT : DEFAULT_LEVEL_COUNT;
	const [askLevelCount, askLadderRef] = useOrderbookLadderRows(levelCount, view === "book" && asks.length > 0);
	const [bidLevelCount, bidLadderRef] = useOrderbookLadderRows(levelCount, view === "book" && bids.length > 0);

	const maxTotal = useMemo(() => {
		const totals = [...asks, ...bids].map((r) => r.total);
		return totals.length > 0 ? Math.max(...totals) : 0;
	}, [asks, bids]);

	const bestBid = bids[0]?.price;
	const bestAsk = asks[0]?.price;
	const mid = useMemo(() => {
		if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk)) return undefined;
		return (bestBid + bestAsk) / 2;
	}, [bestBid, bestAsk]);

	const [midDirection, setMidDirection] = useState<"up" | "down" | "flat">("flat");
	const lastMidRef = useRef<number | undefined>(undefined);

	useEffect(() => {
		if (typeof mid !== "number" || !Number.isFinite(mid)) return;
		const last = lastMidRef.current;
		if (typeof last === "number" && Number.isFinite(last)) {
			if (mid > last) setMidDirection("up");
			else if (mid < last) setMidDirection("down");
			else setMidDirection("flat");
		}
		lastMidRef.current = mid;
	}, [mid]);

	const spread = useMemo(() => {
		if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk)) return undefined;
		return bestAsk - bestBid;
	}, [bestAsk, bestBid]);

	const spreadPct = useMemo(() => {
		if (
			typeof spread !== "number" ||
			typeof mid !== "number" ||
			!Number.isFinite(spread) ||
			!Number.isFinite(mid) ||
			mid === 0
		) {
			return undefined;
		}
		return (spread / mid) * 100;
	}, [spread, mid]);

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
								{ORDERBOOK_TEXT.BOOK_LABEL}
							</Button>
							<Button
								variant={view === "trades" ? "filled" : "ghost"}
								intent={view === "trades" ? "neutral" : "neutral"}
								size="sm"
								onClick={() => setView("trades")}
								className={cn("min-h-11", view !== "trades" && "opacity-60")}
							>
								{ORDERBOOK_TEXT.TRADES_LABEL}
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
							aria-label="Toggle display units"
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
				<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
					<div
						className={cn(
							"shrink-0 grid uppercase tracking-wider text-fg-muted border-b border-stroke-weak/40",
							compact ? "grid-cols-2 gap-1 px-1.5 py-1.5 text-2xs" : "grid-cols-3 gap-2 px-3 py-2 text-xs",
						)}
					>
						<div>{ORDERBOOK_TEXT.HEADER_PRICE}</div>
						<div className="text-right">{ORDERBOOK_TEXT.HEADER_SIZE}</div>
						{!compact && <div className="text-right">{ORDERBOOK_TEXT.HEADER_TOTAL}</div>}
					</div>

					<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
						{bookStatus !== "error" && asks.length > 0 ? (
							<div ref={askLadderRef} className="flex-1 min-h-0 flex flex-col justify-end gap-px py-1 overflow-hidden">
								{PLACEHOLDER_ROW_KEYS.slice(0, Math.max(0, askLevelCount - Math.min(asks.length, askLevelCount))).map(
									(key) => (
										<OrderbookPlaceholderRow key={`ask-${key}`} />
									),
								)}
								{asks
									.slice(0, askLevelCount)
									.reverse()
									.map((level, index) => (
										<OrderbookRow
											key={`ask-${level.price}-${index}`}
											level={level}
											side="ask"
											maxTotal={maxTotal}
											priceDecimals={priceDecimals}
											showInQuote={showOrderbookInQuote}
											szDecimals={szDecimals}
											compact={compact}
										/>
									))}
							</div>
						) : (
							<div className="flex-1 flex items-center justify-center">
								{bookStatus === "error" ? (
									<div className="text-sm text-error">{ORDERBOOK_TEXT.FAILED}</div>
								) : (
									<div className="flex flex-col items-center gap-2 text-fg-muted">
										<ArrowsClockwiseIcon className="size-5 animate-spin" />
										<span className="text-sm">{ORDERBOOK_TEXT.WAITING}</span>
									</div>
								)}
							</div>
						)}

						<div
							className={cn(
								"shrink-0 flex items-center justify-center border-y border-stroke-weak/40 bg-surface",
								compact ? "py-1.5 px-2 gap-1.5" : "py-2 px-3 gap-3",
							)}
						>
							<span className={cn("font-bold tabular-nums text-warning", compact ? "text-sm" : "text-xl")}>
								{typeof mid === "number" && Number.isFinite(mid) ? formatNumber(mid, 2) : FALLBACK_VALUE_PLACEHOLDER}
							</span>
							<MidTrendIcon direction={midDirection} className={compact ? "size-4" : "size-5"} />
						</div>

						{bookStatus !== "error" && bids.length > 0 ? (
							<div ref={bidLadderRef} className="flex-1 min-h-0 flex flex-col gap-px py-1 overflow-hidden">
								{bids.slice(0, bidLevelCount).map((level, index) => (
									<OrderbookRow
										key={`bid-${level.price}-${index}`}
										level={level}
										side="bid"
										maxTotal={maxTotal}
										priceDecimals={priceDecimals}
										showInQuote={showOrderbookInQuote}
										szDecimals={szDecimals}
										compact={compact}
									/>
								))}
								{PLACEHOLDER_ROW_KEYS.slice(0, Math.max(0, bidLevelCount - Math.min(bids.length, bidLevelCount))).map(
									(key) => (
										<OrderbookPlaceholderRow key={`bid-${key}`} />
									),
								)}
							</div>
						) : null}
					</div>

					<div
						className={cn(
							"shrink-0 border-t border-stroke-weak/40 flex items-center justify-between text-fg-muted",
							compact ? "px-2 py-1.5 text-2xs" : "px-3 py-2 text-xs",
						)}
					>
						{compact ? (
							<Dropdown
								size="sm"
								hideCaret
								align="start"
								trigger={selectedOption?.label ?? FALLBACK_VALUE_PLACEHOLDER}
								triggerClassName="font-mono text-2xs px-1.5"
								items={priceGroupingOptions.map(
									(option): DropdownItem => ({
										label: option.label,
										onSelect: () => setSelectedOptionKey(getPriceGroupingKey(option)),
									}),
								)}
							/>
						) : (
							<span>{ORDERBOOK_TEXT.SPREAD_LABEL}</span>
						)}
						<span className="tabular-nums text-warning">
							{typeof spread === "number" &&
							Number.isFinite(spread) &&
							typeof spreadPct === "number" &&
							Number.isFinite(spreadPct)
								? `${formatNumber(spread, 2)} (${formatNumber(spreadPct, 3)}%)`
								: FALLBACK_VALUE_PLACEHOLDER}
						</span>
					</div>
				</div>
			) : (
				<div className="flex-1 min-h-0 flex flex-col">
					<TradesPanel key={name} compact={compact} />
				</div>
			)}

			{!inTabLayout && <MobileBottomNavSpacer />}
		</div>
	);
}

function useOrderbookLadderRows(defaultRows: number, enabled: boolean) {
	const ladderRef = useRef<HTMLDivElement>(null);
	const [rows, setRows] = useState(defaultRows);

	useEffect(() => {
		if (!enabled) {
			setRows(defaultRows);
			return;
		}

		const el = ladderRef.current;
		if (!el) return;

		function updateRows(height: number) {
			setRows(getRowsForLadderHeight(height));
		}

		updateRows(el.getBoundingClientRect().height);

		if (typeof ResizeObserver === "undefined") return;

		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			updateRows(entry.contentRect.height);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, [defaultRows, enabled]);

	return [rows, ladderRef] as const;
}

function getRowsForLadderHeight(height: number): number {
	const availableHeight = Math.max(0, height - ORDERBOOK_LADDER_VERTICAL_PADDING_PX);
	return Math.max(
		1,
		Math.floor((availableHeight + ORDERBOOK_ROW_GAP_PX) / (ORDERBOOK_ROW_HEIGHT_PX + ORDERBOOK_ROW_GAP_PX)),
	);
}

function OrderbookPlaceholderRow() {
	return <div className="h-5 shrink-0" aria-hidden="true" />;
}

function MidTrendIcon({ direction, className }: { direction: "up" | "down" | "flat"; className?: string }) {
	if (direction === "up") return <TrendUpIcon className={cn("text-success", className)} />;
	if (direction === "down") return <TrendDownIcon className={cn("text-error", className)} />;
	return null;
}
