import {
	Badge,
	Button,
	Drawer,
	DrawerContent,
	DrawerTrigger,
	SearchInput,
	TableHead,
	TableHeader,
	TableRow,
	tableVariants,
} from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { ArrowDownIcon, ArrowsDownUpIcon, ArrowUpIcon, CaretDownIcon, FireIcon, StarIcon } from "@phosphor-icons/react";
import { flexRender } from "@tanstack/react-table";
import { useId } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { get24hChange, getOiUsd, isTokenInCategory } from "@/domain/market";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { formatPercent, formatPrice, formatUSD } from "@/lib/format";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { getValueColorClass } from "@/lib/trade/numbers";
import { AssetDisplay } from "../components/asset-display";
import type { MarketRow, MarketScope } from "./token-selector-columns";
import { useTokenSelector } from "./use-token-selector";

export type TokenSelectorProps = {
	selectedMarket: UnifiedMarketInfo | undefined;
	onValueChange: (value: string) => void;
};

const marketScopes: { value: MarketScope; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "perp", label: "Perp" },
	{ value: "spot", label: "Spot" },
	{ value: "hip3", label: "HIP-3" },
];

function getColumnSortLabel(columnId: string): string {
	switch (columnId) {
		case "price":
			return t`Price`;
		case "24h-change":
			return t`24h Change`;
		case "oi":
			return t`Open Interest`;
		case "volume":
			return t`Volume`;
		case "funding":
			return t`Funding`;
		default:
			return columnId;
	}
}

function getMarketTableColumnClass(columnId: string, mobile: boolean): string {
	if (mobile) {
		switch (columnId) {
			case "24h-change":
				return "w-[7.25rem]";
			case "price":
				return "w-[4.75rem]";
			default:
				return "w-20";
		}
	}
	switch (columnId) {
		case "price":
			return "w-16 sm:w-20";
		case "24h-change":
			return "w-28 shrink-0";
		case "oi":
			return "w-32 shrink-0";
		case "volume":
		case "funding":
			return "w-20 sm:w-24 shrink-0";
		default:
			return "w-16 sm:w-20";
	}
}

function getSzDecimals(market: MarketRow): number {
	if (market.kind === "spot") return market.tokensInfo[0]?.szDecimals ?? 4;
	return market.szDecimals;
}

function getMaxLeverage(market: MarketRow): number | null {
	if (market.kind === "spot") return null;
	return market.maxLeverage ?? null;
}

function getDex(market: MarketRow): string | undefined {
	if (market.kind === "builderPerp") return market.dex;
	return undefined;
}

function getMarketKindBadgeLabel(market: UnifiedMarketInfo | undefined): string {
	if (!market) return "";
	if (market.kind === "spot") return "Spot";
	if (market.kind === "builderPerp") return market.dex;
	return "Perp";
}

function SortIcon({ columnId, sorting }: { columnId: string; sorting: { id: string; desc: boolean }[] }) {
	const sort = sorting.find((s) => s.id === columnId);
	if (sort?.desc === false) return <ArrowUpIcon className="size-3" />;
	if (sort?.desc === true) return <ArrowDownIcon className="size-3" />;
	return <ArrowsDownUpIcon className="size-3 opacity-50" />;
}

interface TokenSelectorContentProps {
	selectedMarket: UnifiedMarketInfo | undefined;
	scope: MarketScope;
	exchangeScope: string;
	exchangeDex: string | undefined;
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
	virtualizer: ReturnType<typeof useTokenSelector>["virtualizer"];
	containerRef: React.RefObject<HTMLDivElement | null>;
	filteredMarkets: ReturnType<typeof useTokenSelector>["filteredMarkets"];
	highlightedIndex: number;
	headingId: string;
	mobile?: boolean;
}

function TokenSelectorContent({
	selectedMarket,
	scope,
	exchangeScope,
	exchangeDex,
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
	virtualizer,
	containerRef,
	filteredMarkets,
	highlightedIndex,
	headingId,
	mobile,
}: TokenSelectorContentProps) {
	const virtualItems = virtualizer.getVirtualItems();
	const headerGroup = table.getHeaderGroups()[0];
	const showScopeTabs = exchangeScope === "all";
	const showSubcategoryTabs = !exchangeDex && subcategories.length > 0;
	const showSelectorFilters = showScopeTabs || showSubcategoryTabs;

	return (
		<div className={cn("flex flex-col", mobile ? "h-full" : "max-h-144")}>
			<div className="border-b border-stroke-weak shrink-0 px-2 pt-3 pb-2 space-y-2">
				<h2 id={headingId} className="text-sm font-semibold text-text-strong tracking-tight">
					{t`Select market`}
				</h2>
				<SearchInput
					placeholder={t`Search markets...`}
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					onClear={() => setSearch("")}
					size={mobile ? "md" : "sm"}
					aria-labelledby={headingId}
				/>
			</div>

			{showSelectorFilters ? (
				<div className="p-2 border-b border-stroke-weak bg-bg-base shrink-0">
					{showScopeTabs ? (
						<div className="flex items-center gap-0.5 flex-wrap">
							{marketScopes.map((s) => {
								const isSelected = scope === s.value;
								return (
									<Button
										key={s.value}
										variant="link"
										intent="neutral"
										onClick={() => handleScopeSelect(s.value)}
										className={cn(
											"px-2 py-1 uppercase tracking-wider cursor-pointer no-underline text-xs",
											isSelected
												? "bg-text-warning/10 text-text-warning hover:bg-text-warning/10 hover:text-text-warning"
												: "text-text-strong hover:bg-transparent",
										)}
									>
										{s.label}
									</Button>
								);
							})}
						</div>
					) : null}
					{showSubcategoryTabs ? (
						<div className="flex items-center gap-0.5 flex-wrap mt-1.5 pt-1.5 pl-2 ml-1">
							{subcategories.map((sub) => {
								const isSelected = subcategory === sub.value;
								return (
									<Button
										key={sub.value}
										variant="link"
										intent="neutral"
										onClick={() => handleSubcategorySelect(sub.value)}
										className={cn(
											"px-2 py-0.5 tracking-wider cursor-pointer no-underline text-xs",
											isSelected
												? "bg-text-brand/10 text-text-brand hover:bg-text-brand/10 hover:text-text-brand"
												: "text-text-strong hover:bg-transparent hover:text-text-strong",
										)}
										aria-label={t`Filter by ${sub.label}`}
										aria-pressed={isSelected}
									>
										{sub.label}
									</Button>
								);
							})}
						</div>
					) : null}
				</div>
			) : null}
			<div className="shrink-0 border-b border-stroke-weak bg-bg-base px-0">
				<table className={cn(tableVariants(), "table-fixed w-full border-0")}>
					<TableHeader className="[&_tr]:border-t-0 [&_tr]:border-b [&_tr]:border-stroke-weak">
						<TableRow className="border-0 hover:bg-transparent">
							<TableHead
								scope="col"
								className="h-9 px-2 py-2 text-left align-middle text-3xs font-semibold uppercase tracking-widest text-text-weak"
							>
								{t`Market`}
							</TableHead>
							{headerGroup?.headers
								.filter((h) => h.id !== "pairName")
								.map((header) => {
									const hiddenOnMobile = ["oi", "volume", "funding"].includes(header.id);
									const hideForSpot = scope === "spot" && ["oi", "funding"].includes(header.id);

									if (hideForSpot) return null;

									const sortLabel = getColumnSortLabel(header.id);
									return (
										<TableHead
											key={header.id}
											scope="col"
											className={cn(
												"h-9 px-2 py-2 text-right align-middle text-3xs font-semibold uppercase tracking-widest text-text-weak",
												getMarketTableColumnClass(header.id, mobile),
												hiddenOnMobile && (mobile ? "hidden" : "hidden sm:table-cell"),
											)}
										>
											<button
												type="button"
												onClick={() => handleSort(header.id)}
												title={sortLabel}
												className={cn(
													"inline-flex w-full min-w-0 cursor-pointer items-center justify-end gap-1 rounded-4 px-0.5 py-0.5 text-inherit transition-colors",
													"hover:bg-fill-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
												)}
												aria-label={t`Sort by ${sortLabel}`}
											>
												<span className="min-w-0 whitespace-normal text-right leading-tight text-balance">
													{flexRender(header.column.columnDef.header, header.getContext())}
												</span>
												<span className="inline-flex shrink-0 text-text-weak">
													<SortIcon columnId={header.id} sorting={sorting} />
												</span>
											</button>
										</TableHead>
									);
								})}
						</TableRow>
					</TableHeader>
				</table>
			</div>

			<div ref={containerRef} className="flex-1 min-h-0 overflow-auto">
				{isLoading ? (
					<div className="flex items-center justify-center py-8">
						<span className={cn("text-text-strong", mobile ? "text-xs" : "text-xs")}>{t`Loading markets...`}</span>
					</div>
				) : rows.length === 0 ? (
					<div
						className={cn("py-8 text-center text-text-strong", mobile ? "text-xs" : "text-xs")}
					>{t`No markets found.`}</div>
				) : (
					<div
						style={{
							height: `${virtualizer.getTotalSize()}px`,
							width: "100%",
							position: "relative",
						}}
					>
						{virtualItems.map((virtualItem) => {
							const row = rows[virtualItem.index];
							const market = row.original;
							const isSelected = selectedMarket?.name === market.name;
							const isHighlighted = highlightedIndex >= 0 && virtualItem.index === highlightedIndex;
							const isFav = isFavorite(market.name);

							const changePercent = get24hChange(market.prevDayPx, market.markPx);

							const changeClass = cn(
								"font-medium tabular-nums",
								mobile ? "text-xs" : "text-xs",
								changePercent === null ? "text-text-weak" : getValueColorClass(changePercent),
							);
							const changeText = formatPercent(changePercent !== null ? changePercent / 100 : null);

							const isSpot = market.kind === "spot";
							const isHip3 = market.kind === "builderPerp";

							const oiValue = getOiUsd(market.openInterest, market.markPx);

							return (
								<div
									key={row.id}
									data-index={virtualItem.index}
									onClick={() => handleSelect(market.name)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											handleSelect(market.name);
										}
									}}
									role="option"
									aria-selected={isSelected}
									tabIndex={0}
									className={cn(
										"flex items-center px-2 cursor-pointer border-b border-stroke-weak",
										"hover:bg-fill-hover transition-colors",
										"absolute top-0 left-0 w-full",
										mobile ? "py-2.5" : "py-1.5",
										isSelected && !isHighlighted && "bg-bg-raised",
										isHighlighted && "bg-fill-hover",
									)}
									style={{
										height: `${virtualItem.size}px`,
										transform: `translateY(${virtualItem.start}px)`,
									}}
								>
									<div className="flex-1 min-w-0 flex items-center gap-2">
										<AssetDisplay
											coin={market.name}
											hideName
											iconClassName={cn("shrink-0", mobile ? "size-6" : "size-5")}
										/>
										<div className="min-w-0 flex-1">
											<div className="flex min-w-0 items-center gap-1">
												<span
													title={market.pairName}
													className={cn(
														"min-w-0 truncate font-semibold tracking-tight",
														mobile ? "text-xs" : "text-2xs leading-snug",
													)}
												>
													{market.pairName}
												</span>
												{isTokenInCategory(market.shortName, "new") && (
													<Badge tone="neutral" size="sm" className="shrink-0 px-1 py-0 text-xs">
														{t`NEW`}
													</Badge>
												)}
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														toggleFavorite(market.name);
													}}
													className="shrink-0 rounded-4 p-0.5 hover:scale-110 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
													aria-label={isFav ? t`Remove from favorites` : t`Add to favorites`}
													aria-pressed={isFav}
												>
													<StarIcon
														weight={isFav ? "fill" : "regular"}
														className={cn(
															"transition-colors",
															mobile ? "size-3" : "size-2.5",
															isFav ? "text-fill-yellow" : "text-text-weak hover:text-fill-yellow",
														)}
													/>
												</button>
											</div>
											<div
												className={cn("flex items-center gap-1.5 text-text-strong", mobile ? "text-xs" : "text-2xs")}
											>
												{getMaxLeverage(market) && <span>{getMaxLeverage(market)}x</span>}
												{isSpot && <span className="text-text-brand">Spot</span>}
												{isHip3 && <span className="text-text-warning">{getDex(market)}</span>}
											</div>
										</div>
									</div>
									<div className={cn("text-right", getMarketTableColumnClass("price", mobile))}>
										<span className={cn("font-medium tabular-nums", mobile ? "text-xs" : "text-xs")}>
											{formatPrice(market.markPx, {
												szDecimals: getSzDecimals(market),
											})}
										</span>
									</div>
									<div className={cn("text-right", getMarketTableColumnClass("24h-change", mobile))}>
										<span className={changeClass}>{changeText}</span>
									</div>
									{scope !== "spot" && (
										<div className={cn("text-right hidden sm:block", getMarketTableColumnClass("oi", mobile))}>
											<span className="text-xs font-medium tabular-nums">{formatUSD(oiValue)}</span>
										</div>
									)}
									<div className={cn("text-right hidden sm:block", getMarketTableColumnClass("volume", mobile))}>
										<span className="text-xs font-medium tabular-nums">{formatUSD(market.dayNtlVlm)}</span>
									</div>
									{scope !== "spot" && (
										<div className={cn("text-right hidden sm:block", getMarketTableColumnClass("funding", mobile))}>
											<div className="flex items-center justify-end gap-1">
												{market.funding && <FireIcon className={cn("size-2.5", getValueColorClass(market.funding))} />}
												<span
													className={cn(
														"text-xs tabular-nums font-medium",
														market.funding ? getValueColorClass(market.funding) : "text-text-weak",
													)}
												>
													{formatPercent(market.funding, {
														minimumFractionDigits: 4,
														signDisplay: "exceptZero",
													})}
												</span>
											</div>
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>

			<div
				className={cn(
					"px-2 py-1.5 bg-fill-weak flex items-center justify-between text-text-strong shrink-0",
					mobile ? "text-xs" : "text-xs",
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

export function TokenSelector({ selectedMarket, onValueChange }: TokenSelectorProps) {
	const isMobile = useIsMobile();
	const headingId = useId();
	const {
		open,
		setOpen,
		scope,
		exchangeScope,
		exchangeDex,
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
		virtualizer,
		containerRef,
		filteredMarkets,
		highlightedIndex,
		handleKeyDown,
	} = useTokenSelector({ value: selectedMarket?.name ?? "", onValueChange });

	const contentProps = {
		selectedMarket,
		scope,
		exchangeScope,
		exchangeDex,
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
		virtualizer,
		containerRef,
		filteredMarkets,
		highlightedIndex,
		headingId,
	};

	const kindBadge = getMarketKindBadgeLabel(selectedMarket);

	const trigger = (
		<button
			type="button"
			role="combobox"
			aria-expanded={open}
			aria-label={t`Select token`}
			className="inline-flex items-center gap-1 max-w-full min-w-0 px-1.5 py-1.5 rounded-8 border border-stroke-weak/50 bg-bg-raised/80 hover:bg-fill-hover transition-colors cursor-pointer leading-none"
		>
			{selectedMarket && (
				<>
					<AssetDisplay coin={selectedMarket.name} iconUrl={selectedMarket.iconUrl} hideName iconClassName="size-3.5" />
					<span className="min-w-0 truncate text-xs font-medium text-text-strong tracking-tight leading-none">
						{selectedMarket.pairName ?? selectedMarket.name}
					</span>
					{kindBadge ? (
						<Badge
							tone="neutral"
							size="xxs"
							className="uppercase shrink-0 self-center font-normal leading-none text-text-weak border-stroke-weak/40 bg-fill-weaker"
						>
							{kindBadge}
						</Badge>
					) : null}
				</>
			)}
			<CaretDownIcon className="size-3.5 shrink-0 self-center text-text-weak" />
		</button>
	);

	if (isMobile) {
		return (
			<Drawer side="bottom" open={open} onOpenChange={setOpen}>
				<DrawerTrigger>{trigger}</DrawerTrigger>
				<DrawerContent>
					<TokenSelectorContent {...contentProps} mobile />
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent
				className="w-[min(44rem,calc(100vw-1rem))] p-0 border-stroke-weak bg-bg-raised"
				align="start"
				sideOffset={4}
				alignOffset={-2}
				collisionPadding={8}
				aria-labelledby={headingId}
				onKeyDown={handleKeyDown}
			>
				<TokenSelectorContent {...contentProps} />
			</PopoverContent>
		</Popover>
	);
}
