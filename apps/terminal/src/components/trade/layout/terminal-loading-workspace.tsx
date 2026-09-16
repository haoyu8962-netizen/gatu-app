import { Trans, useLingui } from "@lingui/react/macro";
import { ACCOUNT_LABELS } from "@/config/account-labels";
import { DESKTOP_NAV_LABELS } from "@/config/desktop-nav";
import { MARKET_HEADER_LABELS } from "@/config/market-header";
import { ORDERBOOK_LABELS } from "@/config/orderbook-labels";
import { POSITIONS_TABS } from "@/config/trade";
import { SIDE_LABELS, TRADE_PANEL_LABELS } from "@/config/trade-panel-labels";
import { getBaseQuoteFromPairName } from "@/domain/market";
import { SPOT_MARKET_NAME_SEPARATOR } from "@/domain/market/display";
import { getBuilderPerpDisplayName, getMarketKindFromName, getPerpDisplayName } from "@/lib/hyperliquid/markets/helper";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { getDisconnectedAccountOverviewRows } from "@/lib/trade/account-overview-presentation";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useMarketOrderSlippagePercent, usePositionsActiveTab } from "@/stores/use-global-settings-store";
import { renderDesktopPanel } from "./app-shell-skeleton";
import { type DesktopGridLoadingPanelId, DesktopGridLoadingSurface } from "./desktop-grid-loading-surface";
import {
	ACCOUNT_OVERVIEW_PLACEHOLDER,
	FAVORITES_PLACEHOLDER,
	MARKET_HEADER_PLACEHOLDER,
	ORDERBOOK_PLACEHOLDER,
	TRADE_PANEL_PLACEHOLDER,
} from "./desktop-placeholders";

export function TerminalLoadingWorkspace() {
	const numberFormatRevision = useNumberFormatRevision();
	const storedActiveTab = usePositionsActiveTab();
	const slippagePercent = useMarketOrderSlippagePercent();
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
	const orderbook = {
		...ORDERBOOK_PLACEHOLDER,
		labels: {
			orderBook: t(ORDERBOOK_LABELS.orderBook),
			trades: t(ORDERBOOK_LABELS.trades),
			price: t(ORDERBOOK_LABELS.price),
			size: t(ORDERBOOK_LABELS.size),
			total: t(ORDERBOOK_LABELS.total),
			spread: t(ORDERBOOK_LABELS.spread),
		},
		assetLabel:
			pairName && kind ? getBaseQuoteFromPairName(kind === "spot" ? routeMarketName : pairName, kind).baseToken : null,
	};
	const tradePanel = {
		...TRADE_PANEL_PLACEHOLDER,
		summaryRows: TRADE_PANEL_PLACEHOLDER.summaryRows.map((row) =>
			row.id === "slippage" ? { ...row, value: `${slippagePercent}%` } : row,
		),
		labels: Object.fromEntries(
			Object.entries(TRADE_PANEL_LABELS).map(([key, descriptor]) => [key, t(descriptor)]),
		) as typeof TRADE_PANEL_PLACEHOLDER.labels,
		margin: t(TRADE_PANEL_LABELS.cross),
		account: t(TRADE_PANEL_LABELS.account),
		cta: t(DESKTOP_NAV_LABELS.wallet),
		sizeUnit: orderbook.assetLabel,
		sideLabels:
			kind === "spot"
				? {
						buy: t(SIDE_LABELS.buy),
						sell: t(SIDE_LABELS.sell),
						buyAria: t(SIDE_LABELS.buy),
						sellAria: t(SIDE_LABELS.sell),
					}
				: {
						buy: t(SIDE_LABELS.long),
						sell: t(SIDE_LABELS.short),
						buyAria: t(SIDE_LABELS.buyLong),
						sellAria: t(SIDE_LABELS.sellShort),
					},
	};

	const accountTable = {
		tabs: POSITIONS_TABS.map((tab) => ({ value: tab.value, label: t(tab.label) })),
		active: POSITIONS_TABS.find((tab) => tab.value === storedActiveTab)?.value ?? "positions",
	};
	const accountOverview = {
		...ACCOUNT_OVERVIEW_PLACEHOLDER,
		accountTitle: t(ACCOUNT_LABELS.account),
		title: t(ACCOUNT_LABELS.summary),
		deposit: { ...ACCOUNT_OVERVIEW_PLACEHOLDER.deposit, label: t(ACCOUNT_LABELS.deposit) },
		withdraw: { ...ACCOUNT_OVERVIEW_PLACEHOLDER.withdraw, label: t(ACCOUNT_LABELS.withdraw) },
		rows: getDisconnectedAccountOverviewRows(t, numberFormatRevision),
	};
	function renderPanel(panelId: DesktopGridLoadingPanelId) {
		return renderDesktopPanel(panelId, {
			favorites,
			marketHeader: {
				trigger: {
					...MARKET_HEADER_PLACEHOLDER.trigger,
					pairName,
					kindBadge,
					isSpot: kind === "spot",
					"aria-label": t(MARKET_HEADER_LABELS.price),
				},
				stats,
				ariaLabel: t(MARKET_HEADER_LABELS.price),
			},
			orderbook,
			tradePanel,
			accountTable,
			accountOverview,
		});
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
