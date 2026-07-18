import { useInfo } from "@gatu/hl-react";
import { getCoreRowModel, getSortedRowModel, type Row, type SortingState, useReactTable } from "@tanstack/react-table";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { TOKEN_SELECTOR_OVERSCAN, TOKEN_SELECTOR_ROW_HEIGHT_PX } from "@/config/layout";
import { marketSearchConfig } from "@/config/search";
import type { ExchangeScope } from "@/domain/market";
import { useMarketsInfo } from "@/lib/hyperliquid";
import { createSearcher, type SearchConfig } from "@/lib/search";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useFavoriteMarkets, useMarketActions } from "@/stores/use-market-store";
import {
	createMarketRows,
	getDefaultMarketSubcategory,
	getSpotQuoteSubcategories,
	isMarketInScope,
	isMarketInSubcategory,
	type MarketSubcategory,
	marketScopeUsesAnnotations,
} from "./token-selector-categories";
import { type MarketRow, type MarketScope, TOKEN_SELECTOR_COLUMNS } from "./token-selector-columns";

const PERP_ANNOTATIONS_STALE_TIME_MS = 5 * 60 * 1_000;

const TRADITIONAL_FINANCE_SUBCATEGORIES: MarketSubcategory[] = [
	{ value: "all", label: "All" },
	{ value: "stocks", label: "Stocks" },
	{ value: "indices", label: "Indices" },
	{ value: "commodities", label: "Commodities" },
	{ value: "fx", label: "Forex" },
	{ value: "preipo", label: "Pre-IPO" },
];

const TOKEN_SELECTOR_SEARCH_CONFIG: SearchConfig<MarketRow> = {
	...marketSearchConfig,
	fields: {
		...marketSearchConfig.fields,
		annotationDisplayName: {
			extract: (market) => market.annotation?.displayName,
			weight: 1.8,
		},
		annotationKeywords: {
			extract: (market) => market.annotation?.keywords,
			weight: 1,
		},
	},
};

export interface UseTokenSelectorOptions {
	value: string;
	onValueChange: (value: string, market?: MarketRow) => void;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

export interface UseTokenSelectorReturn {
	open: boolean;
	setOpen: (open: boolean) => void;
	scope: MarketScope;
	subcategory: string;
	subcategories: MarketSubcategory[];
	search: string;
	setSearch: (search: string) => void;
	isLoading: boolean;
	hasClassificationError: boolean;
	retryClassifications: () => void;
	isFavorite: (name: string) => boolean;
	sorting: SortingState;
	handleSort: (columnId: string) => void;
	handleSelect: (name: string) => void;
	handleSubcategorySelect: (sub: string) => void;
	handleScopeSelect: (scope: MarketScope) => void;
	toggleFavorite: (name: string) => void;
	table: ReturnType<typeof useReactTable<MarketRow>>;
	rows: Row<MarketRow>[];
	virtualItems: VirtualItem[];
	virtualTotalSize: number;
	containerRef: React.RefObject<HTMLDivElement | null>;
	filteredMarkets: MarketRow[];
	highlightedIndex: number;
	handleKeyDown: (e: React.KeyboardEvent) => void;
}

function mapExchangeToMarketScope(es: ExchangeScope): MarketScope {
	if (es === "builders-perp") return "hip3";
	if (es === "perp" || es === "spot") return es;
	return "all";
}

type MarketsInfo = ReturnType<typeof useMarketsInfo>;

function computeSubcategories(
	scope: MarketScope,
	builderPerpMarkets: MarketsInfo["builderPerpMarkets"],
	spotMarkets: MarketsInfo["spotMarkets"],
): MarketSubcategory[] {
	if (scope === "traditional") return TRADITIONAL_FINANCE_SUBCATEGORIES;
	if (scope === "perp") return [];
	if (scope === "spot") return getSpotQuoteSubcategories(spotMarkets);

	if (scope === "hip3") {
		const dexNames = Object.keys(builderPerpMarkets).filter((k) => k !== "all");
		return [{ value: "all", label: "All" }, ...dexNames.map((d) => ({ value: d, label: d }))];
	}

	return [];
}

export function useTokenSelector({
	value,
	onValueChange,
	open: controlledOpen,
	onOpenChange,
}: UseTokenSelectorOptions): UseTokenSelectorReturn {
	const { scope: exchangeScope, dex: exchangeDex } = useExchangeScope();
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const [localScope, setLocalScope] = useState<MarketScope>(() => mapExchangeToMarketScope(exchangeScope));
	const [localSubcategory, setLocalSubcategory] = useState<string>(() => exchangeDex ?? "all");
	const [search, setSearch] = useState("");
	const [deferredSearch, setDeferredSearch] = useState("");
	const [isPending, startTransition] = useTransition();
	const [sorting, setSorting] = useState<SortingState>([{ id: "volume", desc: true }]);
	const [highlightedIndex, setHighlightedIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);
	const hasInitializedRef = useRef(false);
	const exchangeKey = `${exchangeScope}:${exchangeDex ?? ""}`;
	const previousExchangeKeyRef = useRef(exchangeKey);
	const open = controlledOpen ?? uncontrolledOpen;
	const setOpen = onOpenChange ?? setUncontrolledOpen;

	const scope = localScope;
	const subcategory = localSubcategory;

	function handleSearchChange(value: string) {
		setSearch(value);
		startTransition(() => setDeferredSearch(value));
		if (open && hasInitializedRef.current) {
			setHighlightedIndex(0);
		}
	}

	const { markets, spotMarkets, builderPerpMarkets, isLoading } = useMarketsInfo();
	const {
		data: perpAnnotations,
		isLoading: annotationsLoading,
		isError: annotationsError,
		refetch: refetchAnnotations,
	} = useInfo("perpConciseAnnotations", undefined, {
		staleTime: PERP_ANNOTATIONS_STALE_TIME_MS,
	});

	const favorites = useFavoriteMarkets();
	const { toggleFavoriteMarket } = useMarketActions();

	const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
	const isFavorite = useCallback((name: string) => favoriteSet.has(name), [favoriteSet]);

	const subcategories = useMemo(
		() => computeSubcategories(scope, builderPerpMarkets, spotMarkets),
		[scope, builderPerpMarkets, spotMarkets],
	);
	const selectorMarkets = useMemo(() => createMarketRows(markets, perpAnnotations), [markets, perpAnnotations]);

	useEffect(() => {
		if (!open) return;
		setLocalScope(mapExchangeToMarketScope(exchangeScope));
		setLocalSubcategory(exchangeDex ?? "all");
		previousExchangeKeyRef.current = exchangeKey;
	}, [open, exchangeScope, exchangeDex, exchangeKey]);

	useEffect(() => {
		if (open) return;
		if (previousExchangeKeyRef.current === exchangeKey) return;
		previousExchangeKeyRef.current = exchangeKey;

		if (exchangeScope === "all") {
			setLocalScope("all");
			setLocalSubcategory("all");
			return;
		}

		setLocalScope(mapExchangeToMarketScope(exchangeScope));
		setLocalSubcategory(exchangeDex ?? "all");
	}, [open, exchangeScope, exchangeDex, exchangeKey]);

	function handleScopeSelect(newScope: MarketScope) {
		setLocalScope(newScope);
		setLocalSubcategory(getDefaultMarketSubcategory(newScope));
		if (open && hasInitializedRef.current) {
			setHighlightedIndex(0);
		}
	}

	// Semantic ref stability: when the popover is closed, freeze scopeFilteredMarkets to
	// the previous reference whenever the membership key (scope|subcategory|names) is unchanged,
	// so hidden rows don't re-render on every WS price tick. When open, always pass the live
	// reference through so prices update.
	const stableScopeFilteredRef = useRef<{ key: string; value: MarketRow[] }>({ key: "", value: [] });
	const filteredByScope = useMemo(
		() =>
			selectorMarkets.filter((market) => {
				if (!isMarketInScope(market, scope, favoriteSet.has(market.name))) return false;
				return isMarketInSubcategory(market, scope, subcategory);
			}),
		[selectorMarkets, scope, subcategory, favoriteSet],
	);
	const scopeKey = `${scope}|${subcategory}|${filteredByScope.length}|${filteredByScope.map((m) => m.name).join(",")}`;
	let scopeFilteredMarkets: MarketRow[];
	if (open) {
		stableScopeFilteredRef.current = { key: scopeKey, value: filteredByScope };
		scopeFilteredMarkets = filteredByScope;
	} else if (stableScopeFilteredRef.current.key === scopeKey) {
		scopeFilteredMarkets = stableScopeFilteredRef.current.value;
	} else {
		stableScopeFilteredRef.current = { key: scopeKey, value: filteredByScope };
		scopeFilteredMarkets = filteredByScope;
	}

	const searcher = useMemo(
		() => createSearcher(scopeFilteredMarkets, TOKEN_SELECTOR_SEARCH_CONFIG),
		[scopeFilteredMarkets],
	);

	const filteredMarkets = useMemo(() => {
		if (!deferredSearch) {
			return scopeFilteredMarkets;
		}

		const marketByName = new Map(scopeFilteredMarkets.map((m) => [m.name, m]));
		return searcher
			.search(deferredSearch)
			.map((result) => marketByName.get(result.item.name))
			.filter((m): m is MarketRow => m != null);
	}, [deferredSearch, scopeFilteredMarkets, searcher]);

	function handleSort(columnId: string) {
		setSorting((prev) => {
			const current = prev[0];
			if (current?.id === columnId) return [{ id: columnId, desc: !current.desc }];
			return [{ id: columnId, desc: true }];
		});
	}

	const table = useReactTable({
		data: filteredMarkets,
		columns: TOKEN_SELECTOR_COLUMNS,
		getRowId: (row) => row.name,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		state: { sorting },
		onSortingChange: setSorting,
		enableSortingRemoval: false,
	});

	const sortedRows = table.getRowModel().rows;
	// Semantic: `rows` is used as an effect dep below — keep referential stability so the
	// initialization effect doesn't re-run on every render.
	const rows = useMemo(() => {
		const favoriteNames = new Set(favorites);
		const favoriteRows = sortedRows.filter((r) => favoriteNames.has(r.original.name));
		const nonFavoriteRows = sortedRows.filter((r) => !favoriteNames.has(r.original.name));
		return [...favoriteRows, ...nonFavoriteRows];
	}, [sortedRows, favorites]);

	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => containerRef.current,
		estimateSize: () => TOKEN_SELECTOR_ROW_HEIGHT_PX,
		overscan: TOKEN_SELECTOR_OVERSCAN,
	});
	const virtualItems = virtualizer.getVirtualItems();
	const virtualTotalSize = virtualizer.getTotalSize();

	useEffect(() => {
		if (!open) return;

		virtualizer.measure();
		const frameId = window.requestAnimationFrame(() => virtualizer.measure());
		const timeoutId = window.setTimeout(() => virtualizer.measure(), 250);
		return () => {
			window.cancelAnimationFrame(frameId);
			window.clearTimeout(timeoutId);
		};
	}, [open, virtualizer]);

	useEffect(() => {
		if (!open) return;

		function handleWindowBlur() {
			setOpen(false);
		}

		window.addEventListener("blur", handleWindowBlur);
		return () => window.removeEventListener("blur", handleWindowBlur);
	}, [open, setOpen]);

	useEffect(() => {
		if (!open) {
			hasInitializedRef.current = false;
			return;
		}

		if (rows.length === 0) return;

		if (!hasInitializedRef.current) {
			hasInitializedRef.current = true;
			const index = value ? rows.findIndex((row) => row.original.name === value) : -1;
			setHighlightedIndex(index >= 0 ? index : 0);
			if (index > 0) {
				requestAnimationFrame(() => {
					virtualizer.scrollToIndex(index, { align: "center" });
				});
			}
		}
	}, [open, rows, value, virtualizer]);

	function handleKeyDown(e: React.KeyboardEvent) {
		if (rows.length === 0) return;

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setHighlightedIndex((prev) => {
					const next = Math.min(prev + 1, rows.length - 1);
					virtualizer.scrollToIndex(next, { align: "auto" });
					return next;
				});
				break;
			case "ArrowUp":
				e.preventDefault();
				setHighlightedIndex((prev) => {
					const next = Math.max(prev - 1, 0);
					virtualizer.scrollToIndex(next, { align: "auto" });
					return next;
				});
				break;
			case "Enter":
				e.preventDefault();
				if (rows[highlightedIndex]) {
					handleSelect(rows[highlightedIndex].original.name);
				}
				break;
			case "Escape":
				setOpen(false);
				break;
		}
	}

	function handleSelect(name: string) {
		const market = markets.find((row) => row.name === name);
		onValueChange(name, market);
		setOpen(false);
		setSearch("");
		setDeferredSearch("");
	}

	function handleOpenChange(next: boolean) {
		setOpen(next);
		if (!next) {
			setSearch("");
			setDeferredSearch("");
		}
	}

	function handleSubcategorySelect(next: string) {
		setLocalSubcategory(next);
		if (open && hasInitializedRef.current) {
			setHighlightedIndex(0);
		}
	}

	function retryClassifications() {
		void refetchAnnotations();
	}

	const classificationsUnavailable =
		marketScopeUsesAnnotations(scope) && (!perpAnnotations || perpAnnotations.length === 0);
	const classificationRequestSettledWithoutData =
		classificationsUnavailable && !annotationsLoading && (annotationsError || perpAnnotations?.length === 0);

	return {
		open,
		setOpen: handleOpenChange,
		scope,
		subcategory,
		subcategories,
		search,
		setSearch: handleSearchChange,
		isLoading:
			open && ((isLoading && markets.length === 0) || isPending || (classificationsUnavailable && annotationsLoading)),
		hasClassificationError: open && classificationRequestSettledWithoutData,
		retryClassifications,
		isFavorite,
		sorting,
		handleSort,
		handleSelect,
		handleSubcategorySelect,
		handleScopeSelect,
		toggleFavorite: toggleFavoriteMarket,
		table,
		rows,
		virtualItems,
		virtualTotalSize,
		containerRef,
		filteredMarkets,
		highlightedIndex,
		handleKeyDown,
	};
}
