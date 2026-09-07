import { useMemo, useState } from "react";
import { CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { KIND_LABELS, marketSearchConfig } from "@/config/search";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { type UnifiedMarketInfo, useMarketsInfo } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { createSearcher } from "@/lib/search";
import { useCommandMenuActions, useCommandMenuOpen } from "@/stores/use-global-modal-store";
import { AssetDisplay } from "./asset-display";

const COMMAND_DIALOG_MAX_WIDTH_CLASS = "sm:max-w-[30rem]";
const COMMAND_LIST_HEIGHT_CLASS = "h-[22.5rem] max-h-[22.5rem]";

export function CommandMenu() {
	useNumberFormatRevision();
	const open = useCommandMenuOpen();
	const { close } = useCommandMenuActions();
	const { markets } = useMarketsInfo();
	const navigateToMarket = useMarketNavigation();

	const [query, setQuery] = useState("");
	const searcher = useMemo(() => createSearcher(markets, marketSearchConfig), [markets]);

	const results = query ? searcher.search(query) : [];
	const displayItems = query ? results.map((r) => r.item) : markets;

	function handleSelect(market: UnifiedMarketInfo) {
		navigateToMarket(market.name, market);
		close();
		setQuery("");
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen) {
			close();
			setQuery("");
		}
	}

	return (
		<CommandDialog
			open={!!open}
			onOpenChange={handleOpenChange}
			title="Search Markets"
			description="Search for a market to trade"
			showCloseButton={false}
			shouldFilter={false}
			className={COMMAND_DIALOG_MAX_WIDTH_CLASS}
		>
			<CommandInput placeholder="Search markets..." value={query} onValueChange={setQuery} />
			<CommandList className={COMMAND_LIST_HEIGHT_CLASS}>
				<CommandEmpty>No markets found.</CommandEmpty>
				{displayItems.map((market) => (
					<CommandItem
						key={`${market.kind}-${market.name}`}
						value={`${market.kind}-${market.name}`}
						onSelect={() => handleSelect(market)}
						className="flex items-center justify-between"
					>
						<AssetDisplay coin={market.name} iconClassName="size-5" />
						<div className="ms-auto flex items-center gap-2">
							<span className="text-fg-muted text-xs">
								{formatPrice(market.markPx, { szDecimals: market.szDecimals })}
							</span>
							<span
								className={cn(
									"rounded-8 px-1.5 py-0.5 text-xs",
									market.kind === "perp" && "bg-fill-weak text-scope-perp",
									market.kind === "spot" && "bg-fill-weak text-scope-spot",
									market.kind === "builderPerp" && "bg-fill-weak text-scope-builders",
								)}
							>
								{KIND_LABELS[market.kind]}
							</span>
						</div>
					</CommandItem>
				))}
			</CommandList>
		</CommandDialog>
	);
}
