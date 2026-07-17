import { Button, SearchInput } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ArrowDownIcon, ArrowsDownUpIcon, ArrowUpIcon } from "@phosphor-icons/react";
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

interface Props {
	selectedMarket: UnifiedMarketInfo | undefined;
	scope: MarketScope;
	subcategory: string;
	subcategories: { value: string; label: string }[];
	search: string;
	setSearch: (value: string) => void;
	isLoading: boolean;
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
}

export function TokenSelectorContent({
	selectedMarket,
	scope,
	subcategory,
	subcategories,
	search,
	setSearch,
	isLoading,
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
	mobile,
}: Props) {
	const { t } = useLingui();
	useRenderCommitTrack("token-search");
	const headerGroup = table.getHeaderGroups()[0];
	const marketScopes: { value: MarketScope; label: string }[] = mobile
		? [
				{ value: "all", label: t`All` },
				{ value: "perp", label: t`Perp` },
				{ value: "spot", label: t`Spot` },
				{ value: "hip3", label: t`HIP-3` },
			]
		: [
				{ value: "favorites", label: t`Favorites` },
				{ value: "all", label: t`All` },
				{ value: "perp", label: t`Perp` },
				{ value: "spot", label: t`Spot` },
				{ value: "crypto", label: t`Crypto` },
				{ value: "traditional", label: t`Traditional Finance` },
				{ value: "hip3", label: t`HIP-3` },
				{ value: "popular", label: t`Popular` },
				{ value: "prelaunch", label: t`Pre-launch` },
			];
	const showScopeTabs = true;
	const showSubcategoryTabs = subcategories.length > 0;
	const showSelectorFilters = showScopeTabs || showSubcategoryTabs;
	const tableLayout: MarketTableLayout = scope === "spot" ? "spot" : "default";

	function getColumnSortLabel(columnId: string): string {
		switch (columnId) {
			case "price":
				return mobile ? t`Price` : t`Last Price`;
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
			case "trending":
				return t`Trending`;
			case "new":
				return t`New`;
			case "defi":
				return t`DeFi`;
			case "layer1":
				return t`L1`;
			case "layer2":
				return t`L2`;
			case "meme":
				return t`Meme`;
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

	return (
		<div className={cn("flex flex-col", mobile ? "h-full min-h-0" : "max-h-144")}>
			<div className="border-b border-stroke-weak shrink-0 px-2 pt-3 pb-2 space-y-2">
				<h2 id={headingId} className="text-sm font-semibold text-fg tracking-tight">
					{t`Select market`}
				</h2>
				<SearchInput
					placeholder={t`Search markets...`}
					value={search}
					onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
					onClear={() => setSearch("")}
					size={mobile ? "md" : "sm"}
					aria-labelledby={headingId}
				/>
			</div>

			{showSelectorFilters ? (
				<div className="border-b border-stroke-weak bg-background p-2 shrink-0">
					{showScopeTabs ? (
						<div className="overflow-x-auto scrollbar-none">
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
												mobile && "uppercase tracking-wider",
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
					) : null}
					{showSubcategoryTabs ? (
						<div className="mt-1.5 flex items-center gap-0.5 overflow-x-auto pt-1.5 scrollbar-none">
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
			) : null}
			<div className="shrink-0 border-b border-stroke-weak bg-background">
				<div className="flex h-9 w-full items-center px-2 text-3xs font-semibold uppercase tracking-widest text-fg-muted">
					<div
						className={cn(
							"min-w-0 text-left",
							tableLayout === "spot" ? "flex-1 lg:flex-none" : "flex-1 min-[848px]:flex-none",
							getMarketTableColumnClass("pairName", mobile ?? false, tableLayout),
						)}
					>
						{t`Market`}
					</div>
					{headerGroup?.headers
						.filter((h) => h.id !== "pairName")
						.map((header) => {
							const hiddenOnMobile = ["oi", "volume", "funding", "market-cap"].includes(header.id);
							const hideForSpot = scope === "spot" && ["oi", "funding"].includes(header.id);
							const hideUnlessSpot = scope !== "spot" && header.id === "market-cap";
							const visibilityClass = hiddenOnMobile
								? mobile
									? "hidden"
									: header.id === "market-cap"
										? "hidden lg:flex"
										: "hidden sm:flex"
								: undefined;

							if (hideForSpot || hideUnlessSpot) return null;

							const sortLabel = getColumnSortLabel(header.id);
							return (
								<div
									key={header.id}
									className={cn(
										"h-full min-w-0 items-center justify-end text-right",
										getMarketTableColumnClass(header.id, mobile ?? false, tableLayout),
										visibilityClass ?? "flex",
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
										<span className="min-w-0 whitespace-normal text-right leading-tight text-balance">{sortLabel}</span>
										<span className="inline-flex shrink-0 text-fg-muted">
											<SortIcon columnId={header.id} sorting={sorting} />
										</span>
									</button>
								</div>
							);
						})}
				</div>
			</div>

			<div ref={containerRef} className="flex-1 min-h-0 overflow-auto">
				{isLoading ? (
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
									mobile={mobile ?? false}
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

			<div className="px-2 py-1.5 bg-fill-weak flex items-center justify-between text-fg shrink-0 text-xs">
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
