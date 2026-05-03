import { useSelectedMarketInfo } from "@/lib/hyperliquid";
import { AccountPanel } from "../tradebox/account-panel";
import { TradePanel } from "../tradebox/trade-panel";

export function TradeSidebar() {
	const { data: market } = useSelectedMarketInfo();
	const formKey = market?.name ?? "default";

	return (
		<div className="h-full min-h-0 overflow-y-auto overscroll-contain bg-surface">
			<div className="flex min-h-full flex-col">
				<TradePanel key={formKey} />
				<div className="flex-1" />
				<AccountPanel />
			</div>
		</div>
	);
}
