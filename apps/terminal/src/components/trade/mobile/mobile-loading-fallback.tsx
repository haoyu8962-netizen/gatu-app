import { useDirection } from "@base-ui/react/direction-provider";
import { Trans, useLingui } from "@lingui/react/macro";
import { cloneElement, type ReactElement } from "react";
import { DESKTOP_NAV_LABELS } from "@/config/desktop-nav";
import { DEFAULT_BUILDER_CONFIG } from "@/config/hyperliquid";
import { MARKET_HEADER_LABELS } from "@/config/market-header";
import { MOBILE_NAV_ITEMS } from "@/config/nav";
import { ORDERBOOK_LABELS } from "@/config/orderbook-labels";
import { MOBILE_POSITIONS_TABS, ORDER_FEE_RATE_SPOT_TAKER, ORDER_FEE_RATE_TAKER } from "@/config/trade";
import { SIDE_LABELS, TRADE_PANEL_LABELS } from "@/config/trade-panel-labels";
import { getBaseQuoteFromPairName } from "@/domain/market";
import { SPOT_MARKET_NAME_SEPARATOR } from "@/domain/market/display";
import { buildOrderFeeQuote, formatOrderFeeRatePercent } from "@/domain/trade/order-fee-quote";
import { formatToken } from "@/lib/format";
import { getBuilderPerpDisplayName, getMarketKindFromName, getPerpDisplayName } from "@/lib/hyperliquid/markets/helper";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { useExchangeScope } from "@/providers/exchange-scope";
import {
	useMarketOrderSlippagePercent,
	useMobileActiveTab,
	usePositionsActiveTab,
} from "@/stores/use-global-settings-store";
import { MobileShellSkeleton } from "../layout/app-shell-skeleton";
import {
	MOBILE_BOOK_PLACEHOLDER,
	MOBILE_HEADER_PLACEHOLDER,
	MOBILE_MARKET_PLACEHOLDER,
	MOBILE_NAV_PLACEHOLDER,
	MOBILE_ORDER_ENTRY_PLACEHOLDER,
} from "../layout/mobile-placeholders";

export function MobileLoadingFallback() {
	const { t } = useLingui();
	useNumberFormatRevision();
	const direction = useDirection();
	const positionsActiveTab = usePositionsActiveTab();
	const mobileActiveTab = useMobileActiveTab();
	const slippagePercent = useMarketOrderSlippagePercent();
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
	const assets = pairName && kind ? getBaseQuoteFromPairName(kind === "spot" ? routeMarketName : pairName, kind) : null;
	const activePositionsTab =
		MOBILE_POSITIONS_TABS.find((tab) => tab.value === positionsActiveTab)?.value ?? "positions";
	const activeNavTab = MOBILE_NAV_ITEMS.find((item) => item.id === mobileActiveTab)?.id ?? "trade";
	const header = {
		...MOBILE_HEADER_PLACEHOLDER,
		account: cloneElement(MOBILE_HEADER_PLACEHOLDER.account, { label: t(DESKTOP_NAV_LABELS.wallet) }),
		drawer: cloneElement(MOBILE_HEADER_PLACEHOLDER.drawer, { "aria-label": t(DESKTOP_NAV_LABELS.openNavigation) }),
		theme: cloneElement(MOBILE_HEADER_PLACEHOLDER.theme, { "aria-label": t(DESKTOP_NAV_LABELS.light) }),
		language: cloneElement(
			MOBILE_HEADER_PLACEHOLDER.language,
			{},
			cloneElement(MOBILE_HEADER_PLACEHOLDER.language.props.children as ReactElement<{ "aria-label"?: string }>, {
				"aria-label": t(DESKTOP_NAV_LABELS.language),
			}),
		),
		settings: cloneElement(MOBILE_HEADER_PLACEHOLDER.settings, { "aria-label": t(DESKTOP_NAV_LABELS.settings) }),
	};
	const market = {
		...MOBILE_MARKET_PLACEHOLDER,
		expandLabel: t(MARKET_HEADER_LABELS.expand),
		trigger: { ...MOBILE_MARKET_PLACEHOLDER.trigger, pairName, kindBadge, isSpot: kind === "spot" },
	};
	const orderEntry = {
		...MOBILE_ORDER_ENTRY_PLACEHOLDER,
		direction,
		availableValue: formatToken("0", 2),
		feeValue: formatOrderFeeRatePercent(
			buildOrderFeeQuote({
				orderValue: 0,
				protocolRate: kind === "spot" ? ORDER_FEE_RATE_SPOT_TAKER : ORDER_FEE_RATE_TAKER,
				builderFeeTenthsBps: DEFAULT_BUILDER_CONFIG?.f ?? 0,
				execution: "order",
				side: "buy",
				marketKind: kind === "spot" ? "spot" : "perp",
			}).totalRate,
		),
		labels: Object.fromEntries(
			Object.entries(TRADE_PANEL_LABELS).map(([key, descriptor]) => [key, t(descriptor)]),
		) as typeof MOBILE_ORDER_ENTRY_PLACEHOLDER.labels,
		sizeUnit: assets?.baseToken ?? null,
		availableToken: assets?.quoteToken ?? "USDC",
		isLeveraged: kind !== "spot",
		slippagePercent,
		cta: t(DESKTOP_NAV_LABELS.wallet),
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
	const orderbook = {
		...MOBILE_BOOK_PLACEHOLDER,
		labels: { price: t(ORDERBOOK_LABELS.price), size: t(ORDERBOOK_LABELS.size), mid: t(ORDERBOOK_LABELS.mid) },
		priceToken: assets?.quoteToken ?? null,
		sizeToken: assets?.baseToken ?? null,
		precisionLabel: t(ORDERBOOK_LABELS.pricePrecision),
		modeControls: {
			...MOBILE_BOOK_PLACEHOLDER.modeControls,
			label: t(ORDERBOOK_LABELS.view),
			options: MOBILE_BOOK_PLACEHOLDER.modeControls.options.map((option) => ({
				...option,
				label: t(ORDERBOOK_LABELS[option.mode]),
			})),
		},
	};
	return (
		<div aria-busy="true" data-testid="mobile-loading-fallback">
			<output className="sr-only">
				<Trans>Loading markets...</Trans>
			</output>
			<MobileShellSkeleton
				header={header}
				market={market}
				orderEntry={orderEntry}
				orderbook={orderbook}
				positions={{
					tabs: MOBILE_POSITIONS_TABS.map((tab) => ({ value: tab.value, label: t(tab.label) })),
					active: activePositionsTab,
				}}
				navigation={{
					...MOBILE_NAV_PLACEHOLDER,
					items: MOBILE_NAV_ITEMS.map((item) => ({ ...item, label: t(item.label) })),
					ariaLabel: t(DESKTOP_NAV_LABELS.primary),
				}}
				activePositionsTab={activePositionsTab}
				activeNavTab={activeNavTab}
			/>
		</div>
	);
}
