import { DrawerContent } from "@hypeterminal/ui";
import { PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { TokenSelectorContent } from "./token-selector-content";
import { useTokenSelector } from "./use-token-selector";

const TOKEN_SELECTOR_POPOVER_WIDTH = "w-[min(44rem,calc(100vw-1rem))]";

export type TokenSelectorPopupProps = {
	selectedMarket: UnifiedMarketInfo | undefined;
	onValueChange: (value: string) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mobile?: boolean;
	headingId: string;
};

export function TokenSelectorPopup({
	selectedMarket,
	onValueChange,
	open,
	onOpenChange,
	mobile = false,
	headingId,
}: TokenSelectorPopupProps) {
	const {
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
			exchangeScope={exchangeScope}
			exchangeDex={exchangeDex}
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
			virtualizer={virtualizer}
			containerRef={containerRef}
			filteredMarkets={filteredMarkets}
			highlightedIndex={highlightedIndex}
			headingId={headingId}
			mobile={mobile}
		/>
	);

	if (mobile) {
		return <DrawerContent keepMounted>{content}</DrawerContent>;
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
