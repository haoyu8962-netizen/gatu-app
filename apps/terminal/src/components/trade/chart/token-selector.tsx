import { Drawer, DrawerContent, DrawerTrigger } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { useId } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { TokenSelectorContent } from "./token-selector-content";
import { TOKEN_SELECTOR_TRIGGER_CLASSNAME, TokenSelectorTriggerContent } from "./token-selector-trigger";
import { useTokenSelector } from "./use-token-selector";

const TOKEN_SELECTOR_POPOVER_WIDTH = "w-[min(44rem,calc(100vw-1rem))]";

export type TokenSelectorProps = {
	selectedMarket: UnifiedMarketInfo | undefined;
	onValueChange: (value: string) => void;
};

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

	if (isMobile) {
		return (
			<Drawer side="bottom" open={open} onOpenChange={setOpen}>
				<DrawerTrigger
					role="combobox"
					aria-expanded={open}
					aria-label={t`Select token`}
					className={TOKEN_SELECTOR_TRIGGER_CLASSNAME}
				>
					<TokenSelectorTriggerContent selectedMarket={selectedMarket} />
				</DrawerTrigger>
				<DrawerContent keepMounted>
					<TokenSelectorContent {...contentProps} mobile />
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					role="combobox"
					aria-expanded={open}
					aria-label={t`Select token`}
					className={TOKEN_SELECTOR_TRIGGER_CLASSNAME}
				>
					<TokenSelectorTriggerContent selectedMarket={selectedMarket} />
				</button>
			</PopoverTrigger>
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
				<TokenSelectorContent {...contentProps} />
			</PopoverContent>
		</Popover>
	);
}
