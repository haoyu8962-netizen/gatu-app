import { DrawerContent } from "@gatu/ui";
import { PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { TokenSelectorContent } from "./token-selector-content";
import { useTokenSelector } from "./use-token-selector";

const TOKEN_SELECTOR_POPOVER_WIDTH = "w-[min(52rem,calc(100vw-1rem))]";

interface Props {
	selectedMarket: UnifiedMarketInfo | undefined;
	onValueChange: (value: string, market?: UnifiedMarketInfo) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mobile?: boolean;
	headingId: string;
}

export function TokenSelectorPopup({
	selectedMarket,
	onValueChange,
	open,
	onOpenChange,
	mobile = false,
	headingId,
}: Props) {
	const {
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
		handleKeyDown,
	} = useTokenSelector({
		value: selectedMarket?.name ?? "",
		onValueChange,
		open,
		onOpenChange,
		mobile,
	});

	const content = (
		<TokenSelectorContent
			selectedMarket={selectedMarket}
			scope={scope}
			subcategory={subcategory}
			subcategories={subcategories}
			search={search}
			setSearch={setSearch}
			isLoading={isLoading}
			isFavorite={isFavorite}
			sorting={sorting}
			handleSort={handleSort}
			handleSelect={handleSelect}
			handleSubcategorySelect={handleSubcategorySelect}
			handleScopeSelect={handleScopeSelect}
			toggleFavorite={toggleFavorite}
			table={table}
			rows={rows}
			virtualItems={virtualItems}
			virtualTotalSize={virtualTotalSize}
			containerRef={containerRef}
			filteredMarkets={filteredMarkets}
			highlightedIndex={highlightedIndex}
			headingId={headingId}
			mobile={mobile}
		/>
	);

	if (mobile) {
		return (
			<DrawerContent keepMounted className="h-[85dvh] overflow-hidden p-0">
				{content}
			</DrawerContent>
		);
	}

	return (
		<PopoverContent
			className={cn(TOKEN_SELECTOR_POPOVER_WIDTH, "p-0 border-stroke-weak bg-surface")}
			align="start"
			sideOffset={4}
			alignOffset={-2}
			collisionPadding={8}
			aria-labelledby={headingId}
			onKeyDown={handleKeyDown}
			keepMounted
		>
			{content}
		</PopoverContent>
	);
}
