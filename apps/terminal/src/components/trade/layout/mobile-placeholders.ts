import { GearIcon, GlobeIcon, ListIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { type ComponentProps, createElement } from "react";
import { GatuLogo } from "@/components/brand/gatu-logo";
import { DESKTOP_NAV_LABELS } from "@/config/desktop-nav";
import { MARKET_HEADER_LABELS } from "@/config/market-header";
import { MOBILE_NAV_ITEMS } from "@/config/nav";
import { ORDERBOOK_LABELS } from "@/config/orderbook-labels";
import { DEFAULT_MARKET_ORDER_SLIPPAGE_PERCENT, MOBILE_POSITIONS_TABS } from "@/config/trade";
import { SIDE_LABELS, TRADE_PANEL_LABELS } from "@/config/trade-panel-labels";
import { AssetIconSlotView } from "../components/asset-icon-slot-view";
import { HeaderIconButtonView } from "../header/header-icon-button-view";
import { NavMenuTriggerView } from "../header/nav-menu-trigger-view";
import type { MobileBookModeControlsView } from "../mobile/mobile-book-chrome-view";
import {
	headerLanguage,
	headerLogo,
	headerSettings,
	headerTheme,
	type MobileHeaderView,
} from "../mobile/mobile-header-view";
import { MobileWalletCtaView } from "../mobile/mobile-wallet-cta-view";
export const MOBILE_HEADER_PLACEHOLDER = {
	drawer: createElement(
		HeaderIconButtonView,
		{ size: "md", className: "touch-target", "aria-label": DESKTOP_NAV_LABELS.openNavigation.message },
		createElement(ListIcon, { className: "size-4.5 text-trading-panel-fg" }),
	),
	logo: createElement(
		"a",
		{ href: "/", className: headerLogo, "aria-label": "GATU" },
		createElement(GatuLogo, { variant: "mark", micro: true, className: "size-[22px]" }),
	),
	account: createElement(MobileWalletCtaView, { label: DESKTOP_NAV_LABELS.wallet.message }),
	theme: createElement(
		HeaderIconButtonView,
		{ className: headerTheme, "aria-label": DESKTOP_NAV_LABELS.light.message, "data-slot": "mobile-header-theme" },
		createElement(SunIcon, { className: "hidden size-4.5 dark:block" }),
		createElement(MoonIcon, { className: "size-4.5 dark:hidden" }),
	),
	language: createElement(
		"div",
		null,
		createElement(NavMenuTriggerView, {
			variant: "language",
			className: headerLanguage,
			"aria-label": DESKTOP_NAV_LABELS.language.message,
			icon: createElement(GlobeIcon, { className: "size-[18px] shrink-0" }),
		}),
	),
	settings: createElement(
		HeaderIconButtonView,
		{ className: headerSettings, "aria-label": DESKTOP_NAV_LABELS.settings.message },
		createElement(GearIcon, { className: "size-4.5" }),
	),
} satisfies ComponentProps<typeof MobileHeaderView>;
export const MOBILE_MARKET_PLACEHOLDER = {
	asset: createElement(AssetIconSlotView, {
		interactive: false,
		icon: createElement("span", { className: "size-7 rounded-full bg-fill-weak" }),
	}),
	trigger: {
		pairName: null as string | null,
		kindBadge: null as string | null,
		leverageBadge: null as string | null,
		isSpot: false,
	},
	priceText: "-",
	changeText: "0.00 / 0.00%",
	changeTitle: "- / -",
	changeClassName: "invisible text-trading-panel-subtle",
	expandLabel: MARKET_HEADER_LABELS.expand.message,
};
export const MOBILE_ORDER_ENTRY_PLACEHOLDER = {
	labels: Object.fromEntries(
		Object.entries(TRADE_PANEL_LABELS).map(([key, descriptor]) => [key, descriptor.message]),
	) as { [K in keyof typeof TRADE_PANEL_LABELS]: string },
	sideLabels: {
		buy: SIDE_LABELS.long.message,
		sell: SIDE_LABELS.short.message,
		buyAria: SIDE_LABELS.buyLong.message,
		sellAria: SIDE_LABELS.sellShort.message,
	},
	isLeveraged: true,
	direction: "ltr" as "ltr" | "rtl",
	side: "buy" as const,
	availableValue: "0.00",
	availableToken: "USDC",
	sizeUnit: null as string | null,
	feeValue: "0.0550%",
	slippagePercent: DEFAULT_MARKET_ORDER_SLIPPAGE_PERCENT,
	cta: DESKTOP_NAV_LABELS.wallet.message,
};
export const MOBILE_BOOK_PLACEHOLDER = {
	labels: {
		price: ORDERBOOK_LABELS.price.message,
		size: ORDERBOOK_LABELS.size.message,
		mid: ORDERBOOK_LABELS.mid.message,
	},
	priceToken: null as string | null,
	sizeToken: null as string | null,
	mode: "both" as const,
	isInteractive: false,
	isTransitioning: false,
	midDirection: "flat" as const,
	midText: "-",
	groupingLabel: "-",
	precisionLabel: ORDERBOOK_LABELS.pricePrecision.message,
	modeControls: {
		mode: "both",
		label: ORDERBOOK_LABELS.view.message,
		options: [
			{ mode: "both", label: ORDERBOOK_LABELS.both.message, bars: ["ask", "bid"] },
			{ mode: "asks", label: ORDERBOOK_LABELS.asks.message, bars: ["ask", "ask"] },
			{ mode: "bids", label: ORDERBOOK_LABELS.bids.message, bars: ["bid", "bid"] },
		],
	} satisfies ComponentProps<typeof MobileBookModeControlsView>,
};
export const MOBILE_POSITIONS_PLACEHOLDER = {
	tabs: MOBILE_POSITIONS_TABS.map((tab) => ({ value: tab.value, label: String(tab.label.message) })),
	active: "positions",
};
export const MOBILE_NAV_PLACEHOLDER = {
	items: MOBILE_NAV_ITEMS.map((item) => ({ ...item, label: item.label.message ?? "" })),
	activeTab: "trade" as const,
	ariaLabel: DESKTOP_NAV_LABELS.primary.message,
};
