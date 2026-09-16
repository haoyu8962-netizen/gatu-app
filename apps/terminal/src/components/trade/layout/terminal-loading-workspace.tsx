import { Trans, useLingui } from "@lingui/react/macro";
import { MARKET_HEADER_LABELS } from "@/config/market-header";
import { SPOT_MARKET_NAME_SEPARATOR } from "@/domain/market/display";
import { getBuilderPerpDisplayName, getMarketKindFromName, getPerpDisplayName } from "@/lib/hyperliquid/markets/helper";
import { useExchangeScope } from "@/providers/exchange-scope";
import { TokenSelectorTriggerView } from "../chart/token-selector-trigger-view";
import { AssetIconSlotView } from "../components/asset-icon-slot-view";
import { FavoritesStripView } from "../header/favorites-strip-view";
import { MarketOverviewView } from "../market-overview-view";
import { type PanelFrameLabels, renderDesktopPanelFrame } from "./app-shell-skeleton";
import { type DesktopGridLoadingPanelId, DesktopGridLoadingSurface } from "./desktop-grid-loading-surface";
import { FAVORITES_PLACEHOLDER, MARKET_HEADER_PLACEHOLDER } from "./desktop-placeholders";
import { MarketHeaderView } from "./market-header-view";

function useTranslatedPanelFrameLabels(): PanelFrameLabels {
	const { t } = useLingui();
	return {
		orderBook: t`Order Book`,
		trades: t`Trades`,
		price: t`Price`,
		size: t`Size`,
		total: t`Total`,
		spread: t`Spread`,
		orderControls: [
			[t`Margin`, t`Cross`],
			[t`Leverage`, "—"],
			[t`Account`, t`Account`],
		],
		orderTypeTabs: [t`Market`, t`Limit`, t`Advanced`],
		long: t`Long`,
		short: t`Short`,
		available: t`Available`,
		orderOptions: [t`Reduce Only`, t`TP/SL`],
		connectWallet: t`Connect Wallet`,
		orderSummaryRows: [t`Liq. Price`, t`Order Value`, t`Margin Req.`, t`Est. Slippage`, t`Slippage`, t`Fees`],
		accountTabs: [
			t`Balances`,
			t`Positions`,
			t`Open Orders`,
			t`TWAP`,
			t`Trade History`,
			t`Funding Payments`,
			t`Order History`,
		],
		deposit: t`Deposit`,
		withdraw: t`Withdraw`,
		accountSummary: t`Account Summary`,
		accountSummaryRows: [t`Account Margin Ratio`, t`Portfolio Value`, t`Cross Account Leverage`],
	};
}

export function TerminalLoadingWorkspace() {
	const labels = useTranslatedPanelFrameLabels();
	const { t } = useLingui();
	const { routeMarketName, routeDex } = useExchangeScope();
	const kind = routeMarketName ? getMarketKindFromName(routeMarketName) : undefined;
	const pairName = !routeMarketName
		? null
		: kind === "spot"
			? routeMarketName.includes(SPOT_MARKET_NAME_SEPARATOR)
				? routeMarketName.replace(SPOT_MARKET_NAME_SEPARATOR, "-")
				: null
			: kind === "builderPerp"
				? getBuilderPerpDisplayName(routeMarketName)
				: getPerpDisplayName(routeMarketName);
	const kindBadge = kind === "spot" ? t`Spot` : kind === "builderPerp" ? (routeDex ?? null) : kind ? t`Perp` : null;
	const favorites = {
		...FAVORITES_PLACEHOLDER,
		items: FAVORITES_PLACEHOLDER.items.map((item) => ({ ...item, active: item.name === routeMarketName })),
		emptyLabel: t(MARKET_HEADER_LABELS.favoritesEmpty),
	};
	const stats = MARKET_HEADER_PLACEHOLDER.stats.map((stat) => ({
		...stat,
		label:
			stat.id === "funding"
				? `${t(MARKET_HEADER_LABELS.funding)} / ${t(MARKET_HEADER_LABELS.resetsIn)}`
				: t(MARKET_HEADER_LABELS[stat.id === "price" ? "mark" : stat.id]),
	}));
	function renderPanel(panelId: DesktopGridLoadingPanelId) {
		if (panelId === "favoriteCoins") return <FavoritesStripView {...favorites} />;
		if (panelId === "coinInfo")
			return (
				<MarketHeaderView
					head={
						<>
							<AssetIconSlotView interactive icon={<span className="size-[26px] rounded-full bg-fill-weak" />} />
							<TokenSelectorTriggerView
								{...MARKET_HEADER_PLACEHOLDER.trigger}
								pairName={pairName}
								kindBadge={kindBadge}
								isSpot={kind === "spot"}
								aria-label={t(MARKET_HEADER_LABELS.price)}
							/>
						</>
					}
					overview={<MarketOverviewView stats={stats} ariaLabel={t(MARKET_HEADER_LABELS.price)} />}
				/>
			);
		return renderDesktopPanelFrame(panelId, labels);
	}
	return (
		<main
			aria-busy="true"
			data-terminal-loading-workspace
			data-testid="terminal-loading-workspace"
			className="min-h-0 flex-1 overflow-hidden bg-grid-container"
		>
			<output className="sr-only">
				<Trans>Loading markets...</Trans>
			</output>
			<div aria-hidden="true" inert className="h-full">
				<DesktopGridLoadingSurface
					panelClassName="desktop-grid-panel overflow-hidden bg-surface"
					renderPanel={renderPanel}
				/>
			</div>
		</main>
	);
}
