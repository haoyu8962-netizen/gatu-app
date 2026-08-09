import { Button, SearchInput } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ArrowDownIcon, ArrowsDownUpIcon, ArrowUpIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import type { ChangeEvent } from "react";
import { cn } from "@/lib/cn";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { useRenderCommitTrack } from "@/lib/performance/render-profile";
import { getMarketTableGridClass, type MarketScope, type MarketTableLayout } from "./token-selector-columns";
import { TokenSelectorRow } from "./token-selector-row";
import type { useTokenSelector } from "./use-token-selector";

function SortIcon({ columnId, sorting }: { columnId: string; sorting: { id: string; desc: boolean }[] }) {
	const sort = sorting.find((s) => s.id === columnId);
	if (sort?.desc === false) return <ArrowUpIcon className="size-3" />;
	if (sort?.desc === true) return <ArrowDownIcon className="size-3" />;
	return <ArrowsDownUpIcon className="size-3 opacity-50" />;
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
		const isActive = sorting[0]?.id === columnId;
		return (
			<button
				type="button"
				onClick={() => handleSort(columnId)}
				title={sortLabel}
				className={cn(
					"relative flex w-full min-w-0 cursor-pointer items-center justify-end gap-0.5 rounded-[4px] leading-4 transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
					isActive
						? "font-bold text-trading-panel-fg"
						: "font-medium text-trading-panel-subtle hover:text-trading-panel-fg",
				)}
				aria-label={t`Sort by ${sortLabel}`}
			>
				<span className="min-w-0 truncate">{sortLabel}</span>
				<span className={cn("inline-flex shrink-0", isActive ? "text-trading-panel-fg" : "text-trading-panel-subtle")}>
					<SortIcon columnId={columnId} sorting={sorting} />
				</span>
			</button>
		);
	}

	return (
		<div
			className={cn(
				"flex flex-col bg-surface font-market-close text-trading-panel-fg",
				mobile ? "h-full min-h-0" : "max-h-[min(720px,calc(100dvh-1rem))]",
			)}
		>
			<div className={cn("shrink-0 px-4", mobile ? "pt-[calc(0.875rem+env(safe-area-inset-top))] pb-3" : "pt-3.5")}>
				<h2 id={headingId} className="sr-only">
					{t`Select market`}
				</h2>
				<div className="flex min-w-0 items-center gap-2">
					<SearchInput
						placeholder={t`Search markets...`}
						value={search}
						onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
						onClear={() => setSearch("")}
						size={mobile ? "md" : "sm"}
						className={cn(
							"min-w-0 flex-1 [&>div]:rounded-[10px] [&>div]:border-trading-panel-stroke-input [&>div]:bg-transparent focus-within:[&>div]:border-trading-panel-control",
							mobile ? "[&>div]:h-10" : "[&>div]:h-[38px]",
						)}
						inputClassName={cn(
							"font-medium text-trading-panel-fg placeholder:text-trading-panel-subtle",
							mobile ? "text-base leading-5" : "text-[13px] leading-5",
						)}
						aria-labelledby={headingId}
					/>
					{onClose ? (
						<button
							type="button"
							onClick={onClose}
							className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-trading-panel-muted transition-colors duration-[120ms] hover:bg-trading-panel-hover hover:text-trading-panel-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus motion-reduce:transition-none"
							aria-label={t`Close`}
						>
							<XIcon className="size-4" aria-hidden />
						</button>
					) : null}
				</div>
			</div>

			<div className="relative shrink-0 border-b border-trading-panel-stroke-card">
				<div className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					<div className={cn("flex w-max min-w-full flex-nowrap items-center px-4", mobile ? "gap-3.5" : "gap-[18px]")}>
						{marketScopes.map((s) => {
							const isSelected = scope === s.value;
							return (
								<button
									type="button"
									key={s.value}
									onClick={() => handleScopeSelect(s.value)}
									className={cn(
										"shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-px text-[13px] transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
										mobile ? "h-11" : "h-10",
										isSelected
											? "border-trading-panel-control font-bold text-trading-panel-fg"
											: "border-transparent font-medium text-trading-panel-subtle hover:text-trading-panel-fg",
									)}
									aria-pressed={isSelected}
								>
									{s.label}
								</button>
							);
						})}
					</div>
				</div>
				{mobile ? (
					<div className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-linear-to-r from-transparent to-surface" />
				) : null}
			</div>
			{showSubcategoryTabs ? (
				<div className="relative shrink-0 border-b border-trading-panel-stroke-row">
					<div
						className={cn(
							"flex items-center gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
							mobile ? "h-11" : "py-2",
						)}
					>
						{subcategories.map((sub) => {
							const isSelected = subcategory === sub.value;
							const label = getSubcategoryLabel(sub.value, sub.label);
							return (
								<button
									type="button"
									key={sub.value}
									onClick={() => handleSubcategorySelect(sub.value)}
									className={cn(
										"shrink-0 cursor-pointer whitespace-nowrap rounded-[7px] border px-2.5 py-1 text-xs transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
										mobile && "relative after:absolute after:-inset-x-1 after:-inset-y-[9px] after:content-['']",
										isSelected
											? "border-trading-panel-stroke-input bg-trading-panel-hover font-bold text-trading-panel-fg"
											: "border-transparent font-medium text-trading-panel-muted hover:text-trading-panel-fg",
									)}
									aria-label={t`Filter by ${label}`}
									aria-pressed={isSelected}
								>
									{label}
								</button>
							);
						})}
					</div>
					{mobile ? (
						<div className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-linear-to-r from-transparent to-surface" />
					) : null}
				</div>
			) : null}
			<div className="shrink-0 border-b border-trading-panel-stroke-card bg-surface">
				{mobile ? (
					<div className="grid w-full grid-cols-[minmax(0,1fr)_102px_84px] items-end gap-x-2 px-4 py-2 text-[10px] text-trading-panel-subtle">
						<div className="min-w-0 pb-0.5 text-left font-medium">{t`Market`}</div>
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
					<div
						className={cn(
							"grid w-full items-center gap-x-3 px-4 py-[9px] text-[11px] text-trading-panel-subtle",
							getMarketTableGridClass(tableLayout),
						)}
					>
						<div className="min-w-0 text-left font-medium">{t`Market`}</div>
						{headerGroup?.headers
							.filter((h) => h.id !== "pairName")
							.map((header) => {
								const hideForSpot = scope === "spot" && ["oi", "funding"].includes(header.id);
								const hideUnlessSpot = scope !== "spot" && header.id === "market-cap";
								if (hideForSpot || hideUnlessSpot) return null;

								const sortLabel = getColumnSortLabel(header.id);
								const isActive = sorting[0]?.id === header.id;
								return (
									<div key={header.id} className="min-w-0 text-right">
										<button
											type="button"
											onClick={() => handleSort(header.id)}
											title={sortLabel}
											className={cn(
												"inline-flex w-full min-w-0 cursor-pointer items-center justify-end gap-1 rounded-[4px] py-0.5 transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
												isActive
													? "font-bold text-trading-panel-fg"
													: "font-medium text-trading-panel-subtle hover:text-trading-panel-fg",
											)}
											aria-label={t`Sort by ${sortLabel}`}
										>
											<span className="min-w-0 whitespace-normal text-right leading-tight text-balance">
												{sortLabel}
											</span>
											<span
												className={cn(
													"inline-flex shrink-0",
													isActive ? "text-trading-panel-fg" : "text-trading-panel-stroke-control",
												)}
											>
												<SortIcon columnId={header.id} sorting={sorting} />
											</span>
										</button>
									</div>
								);
							})}
					</div>
				)}
			</div>

			<div
				ref={containerRef}
				className={cn("min-h-0 flex-1 overflow-auto", mobile ? "overscroll-none" : "max-h-[432px]")}
			>
				{hasClassificationError ? (
					<div role="alert" className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
						<span className="text-xs text-trading-panel-error">{t`Failed to load market categories.`}</span>
						<Button variant="outline" intent="neutral" size="xs" onClick={onRetryClassifications}>
							{t`Retry`}
						</Button>
					</div>
				) : isLoading ? (
					<div className="flex items-center justify-center py-8">
						<span className="text-xs text-trading-panel-muted">{t`Loading markets...`}</span>
					</div>
				) : rows.length === 0 ? (
					<div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
						<div className="grid size-10 place-items-center rounded-full bg-trading-panel-hover text-trading-panel-subtle">
							<MagnifyingGlassIcon className="size-4" />
						</div>
						<span className="text-[13px] font-semibold text-trading-panel-muted">{t`No markets found.`}</span>
					</div>
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
					"flex shrink-0 items-center justify-between border-t border-trading-panel-stroke-card bg-trading-panel-card px-4 py-2.5 text-xs text-trading-panel-muted",
					mobile && onClose && "pb-[calc(0.625rem+env(safe-area-inset-bottom))]",
				)}
			>
				<span className="whitespace-nowrap tabular-nums">
					{filteredMarkets.length} {t`markets`}
				</span>
				<span className="min-w-0 whitespace-nowrap text-right text-trading-panel-subtle tabular-nums">
					{sorting.length > 0 ? t`Sorted by ${getColumnSortLabel(sorting[0].id)}` : t`Updated live`}
				</span>
			</div>
		</div>
	);
}
