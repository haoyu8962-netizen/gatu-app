import { Button, SearchInput } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ArrowDownIcon, ArrowsDownUpIcon, ArrowUpIcon, XIcon } from "@phosphor-icons/react";
import type { ChangeEvent } from "react";
import { cn } from "@/lib/cn";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { useRenderCommitTrack } from "@/lib/performance/render-profile";
import { getMarketTableColumnClass, type MarketScope, type MarketTableLayout } from "./token-selector-columns";
import { TokenSelectorRow } from "./token-selector-row";
import type { useTokenSelector } from "./use-token-selector";

function SortIcon({ columnId, sorting }: { columnId: string; sorting: { id: string; desc: boolean }[] }) {
	const sort = sorting.find((s) => s.id === columnId);
	if (sort?.desc === false) return <ArrowUpIcon className="size-3" />;
	if (sort?.desc === true) return <ArrowDownIcon className="size-3" />;
	return <ArrowsDownUpIcon className="size-3 opacity-50" />;
}

function getHeaderVisibilityClass(columnId: string): string {
	if (columnId === "market-cap") return "hidden lg:flex";
	if (["oi", "volume", "funding"].includes(columnId)) return "hidden sm:flex";
	return "flex";
}

interface Props {
	selectedMarket: UnifiedMarketInfo | undefined;
	scope: MarketScope;
	subcategory: string;
	subcategories: { value: string; label: string }[];
	search: string;
	setSearch: (value: string) => void;
	isLoading: boolean;
	hasClassificationError: boolean;
	onRetryClassifications: () => void;
	isFavorite: (name: string) => boolean;
	sorting: { id: string; desc: boolean }[];
	handleSort: (columnId: string) => void;
	handleSelect: (name: string) => void;
	handleSubcategorySelect: (value: string) => void;
	handleScopeSelect: (value: MarketScope) => void;
	toggleFavorite: (name: string) => void;
	table: ReturnType<typeof useTokenSelector>["table"];
	rows: ReturnType<typeof useTokenSelector>["rows"];
	virtualItems: ReturnType<typeof useTokenSelector>["virtualItems"];
	virtualTotalSize: number;
	containerRef: React.RefObject<HTMLDivElement | null>;
	filteredMarkets: ReturnType<typeof useTokenSelector>["filteredMarkets"];
	highlightedIndex: number;
	headingId: string;
	mobile?: boolean;
	onClose?: () => void;
}

export function TokenSelectorContent({
	selectedMarket,
	scope,
	subcategory,
	subcategories,
	search,
	setSearch,
	isLoading,
	hasClassificationError,
	onRetryClassifications,
	isFavorite,
	sorting,
	handleSort,
	handleSelect,
	handleSubcategorySelect,
	handleScopeSelect,
	toggleFavorite,
	table,
	rows,
	virtualItems,
	virtualTotalSize,
	containerRef,
	filteredMarkets,
	highlightedIndex,
	headingId,
	mobile = false,
	onClose,
}: Props) {
	const { t } = useLingui();
	useRenderCommitTrack("token-search");
	const headerGroup = table.getHeaderGroups()[0];
	const marketScopes: { value: MarketScope; label: string }[] = [
		{ value: "favorites", label: t`Favorites` },
		{ value: "all", label: t`All` },
		{ value: "perp", label: t`Perp` },
		{ value: "spot", label: t`Spot` },
		{ value: "crypto", label: t`Crypto` },
		{ value: "traditional", label: t`Traditional Finance` },
		{ value: "hip3", label: t`HIP-3` },
		{ value: "popular", label: t`Popular` },
	];
	const showSubcategoryTabs = subcategories.length > 0;
	const tableLayout: MarketTableLayout = scope === "spot" ? "spot" : "default";

	function getColumnSortLabel(columnId: string): string {
		switch (columnId) {
			case "price":
				return t`Last Price`;
			case "24h-change":
				return t`24h Change`;
			case "oi":
				return t`Open Interest`;
			case "volume":
				return t`Volume`;
			case "funding":
				return t`8h Funding`;
			case "market-cap":
				return t`Market Cap`;
			default:
				return columnId;
		}
	}

	function getSubcategoryLabel(value: string, fallback: string): string {
		switch (value) {
			case "all":
				return t`All`;
			case "stocks":
				return t`Stocks`;
			case "indices":
				return t`Indices`;
			case "commodities":
				return t`Commodities`;
			case "fx":
				return t`Forex`;
			case "preipo":
				return t`Pre-IPO`;
			default:
				return fallback;
		}
	}

	function renderMobileSortHeader(columnId: string) {
		const sortLabel = getColumnSortLabel(columnId);
		return (
			<button
				type="button"
				onClick={() => handleSort(columnId)}
				title={sortLabel}
				className="flex w-full min-w-0 cursor-pointer items-center justify-end gap-0.5 rounded-4 leading-4 transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
				aria-label={t`Sort by ${sortLabel}`}
			>
				<span className="min-w-0 truncate">{sortLabel}</span>
				<span className="inline-flex shrink-0 text-fg-muted">
					<SortIcon columnId={columnId} sorting={sorting} />
				</span>
			</button>
		);
	}

	return (
		<div className={cn("flex flex-col", mobile ? "h-full min-h-0" : "max-h-144")}>
			<div
				className={cn(
					"shrink-0 space-y-2 border-b border-stroke-weak px-2 pt-3 pb-2",
					mobile && onClose && "pt-[calc(0.75rem+env(safe-area-inset-top))]",
				)}
			>
				<div className="flex items-center justify-between gap-3">
					<h2 id={headingId} className="text-sm font-semibold tracking-tight text-fg">
						{t`Select market`}
					</h2>
					{onClose ? (
						<button
							type="button"
							onClick={onClose}
							className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-8 text-icon transition-colors hover:bg-fill-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
							aria-label={t`Close`}
						>
							<XIcon className="size-4" />
						</button>
					) : null}
				</div>
				<SearchInput
					placeholder={t`Search markets...`}
					value={search}
					onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
					onClear={() => setSearch("")}
					size={mobile ? "md" : "sm"}
					aria-labelledby={headingId}
				/>
			</div>

			<div className="border-b border-stroke-weak bg-background p-2 shrink-0">
				<div className="overflow-x-auto overscroll-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					<div className="flex w-max min-w-full flex-nowrap items-center gap-0.5">
						{marketScopes.map((s) => {
							const isSelected = scope === s.value;
							return (
								<Button
									key={s.value}
									variant="link"
									intent="neutral"
									onClick={() => handleScopeSelect(s.value)}
									className={cn(
										"shrink-0 cursor-pointer px-2 py-1 text-xs no-underline",
										isSelected
											? "bg-brand-soft text-brand hover:bg-brand-soft hover:text-brand"
											: "text-fg hover:bg-transparent",
									)}
									aria-pressed={isSelected}
								>
									{s.label}
								</Button>
							);
						})}
					</div>
				</div>
				{showSubcategoryTabs ? (
					<div className="mt-1.5 flex items-center gap-0.5 overflow-x-auto overscroll-none pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						{subcategories.map((sub) => {
							const isSelected = subcategory === sub.value;
							const label = getSubcategoryLabel(sub.value, sub.label);
							return (
								<Button
									key={sub.value}
									variant="link"
									intent="neutral"
									onClick={() => handleSubcategorySelect(sub.value)}
									className={cn(
										"shrink-0 px-2 py-0.5 tracking-wider cursor-pointer no-underline text-xs",
										isSelected
											? "bg-brand/10 text-brand hover:bg-brand/10 hover:text-brand"
											: "text-fg hover:bg-transparent hover:text-fg",
									)}
									aria-label={t`Filter by ${label}`}
									aria-pressed={isSelected}
								>
									{label}
								</Button>
							);
						})}
					</div>
				) : null}
			</div>
			<div className="shrink-0 border-b border-stroke-weak bg-background">
				{mobile ? (
					<div className="grid h-11 w-full grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2 px-2 text-3xs font-semibold uppercase tracking-wider text-fg-muted">
						<div className="min-w-0 text-left">{t`Market`}</div>
						<div className="flex min-w-0 flex-col items-end text-right">
							{renderMobileSortHeader("volume")}
							{renderMobileSortHeader(scope === "spot" ? "market-cap" : "oi")}
						</div>
						<div className="flex min-w-0 flex-col items-end text-right">
							{renderMobileSortHeader("price")}
							{renderMobileSortHeader("24h-change")}
						</div>
					</div>
				) : (
					<div className="flex h-9 w-full items-center px-2 text-3xs font-semibold uppercase tracking-widest text-fg-muted">
						<div
							className={cn(
								"min-w-0 text-left",
								tableLayout === "spot" ? "flex-1 lg:flex-none" : "flex-1 min-[848px]:flex-none",
								getMarketTableColumnClass("pairName", tableLayout),
							)}
						>
							{t`Market`}
						</div>
						{headerGroup?.headers
							.filter((h) => h.id !== "pairName")
							.map((header) => {
								const hideForSpot = scope === "spot" && ["oi", "funding"].includes(header.id);
								const hideUnlessSpot = scope !== "spot" && header.id === "market-cap";
								const visibilityClass = getHeaderVisibilityClass(header.id);

								if (hideForSpot || hideUnlessSpot) return null;

								const sortLabel = getColumnSortLabel(header.id);
								return (
									<div
										key={header.id}
										className={cn(
											"h-full min-w-0 items-center justify-end text-right",
											getMarketTableColumnClass(header.id, tableLayout),
											visibilityClass,
										)}
									>
										<button
											type="button"
											onClick={() => handleSort(header.id)}
											title={sortLabel}
											className={cn(
												"inline-flex w-full min-w-0 cursor-pointer items-center justify-end gap-1 rounded-4 py-0.5 text-inherit transition-colors",
												"hover:bg-fill-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
											)}
											aria-label={t`Sort by ${sortLabel}`}
										>
											<span className="min-w-0 whitespace-normal text-right leading-tight text-balance">
												{sortLabel}
											</span>
											<span className="inline-flex shrink-0 text-fg-muted">
												<SortIcon columnId={header.id} sorting={sorting} />
											</span>
										</button>
									</div>
								);
							})}
					</div>
				)}
			</div>

			<div ref={containerRef} className={cn("min-h-0 flex-1 overflow-auto", mobile && "overscroll-none")}>
				{hasClassificationError ? (
					<div role="alert" className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
						<span className="text-xs text-error">{t`Failed to load market categories.`}</span>
						<Button variant="outline" intent="neutral" size="xs" onClick={onRetryClassifications}>
							{t`Retry`}
						</Button>
					</div>
				) : isLoading ? (
					<div className="flex items-center justify-center py-8">
						<span className="text-fg text-xs">{t`Loading markets...`}</span>
					</div>
				) : rows.length === 0 ? (
					<div className="py-8 text-center text-fg text-xs">{t`No markets found.`}</div>
				) : (
					<div
						role="listbox"
						aria-label={t`Markets`}
						style={{
							height: `${virtualTotalSize}px`,
							width: "100%",
							position: "relative",
						}}
					>
						{virtualItems.map((virtualItem) => {
							const row = rows[virtualItem.index];
							const market = row.original;
							return (
								<TokenSelectorRow
									key={row.id}
									market={market}
									mobile={mobile}
									showDerivativesMetrics={scope !== "spot"}
									showSpotMarketCap={scope === "spot"}
									isSelected={selectedMarket?.name === market.name}
									isHighlighted={highlightedIndex >= 0 && virtualItem.index === highlightedIndex}
									isFavorite={isFavorite(market.name)}
									top={virtualItem.start}
									height={virtualItem.size}
									onSelect={handleSelect}
									onToggleFavorite={toggleFavorite}
								/>
							);
						})}
					</div>
				)}
			</div>

			<div
				className={cn(
					"flex shrink-0 items-center justify-between bg-fill-weak px-2 py-1.5 text-xs text-fg",
					mobile && onClose && "pb-[calc(0.375rem+env(safe-area-inset-bottom))]",
				)}
			>
				<span>
					{filteredMarkets.length} {t`markets`}
				</span>
				<span className="tabular-nums text-right min-w-0">
					{sorting.length > 0 ? t`Sorted by ${getColumnSortLabel(sorting[0].id)}` : t`Updated live`}
				</span>
			</div>
		</div>
	);
}
