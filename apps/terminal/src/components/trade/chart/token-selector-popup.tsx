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
		hasClassificationError,
		retryClassifications,
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
			hasClassificationError={hasClassificationError}
			onRetryClassifications={retryClassifications}
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
			onClose={mobile ? () => onOpenChange(false) : undefined}
		/>
	);

	if (mobile) {
		return (
			<DrawerContent
				className="inset-0 z-[90] h-dvh max-h-none w-full overflow-hidden overscroll-none rounded-none border-0 p-0 shadow-none transition-[opacity,transform] duration-300 ease-out data-starting-style:-translate-y-[5px] data-starting-style:opacity-0 data-ending-style:-translate-y-[5px] data-ending-style:opacity-0 motion-reduce:transition-none"
				overlayClassName="z-10 bg-transparent overscroll-none transition-none"
				aria-labelledby={headingId}
				onKeyDown={handleKeyDown}
			>
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
