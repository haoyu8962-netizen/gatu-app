import { GlobeIcon, MoonIcon, SlidersHorizontalIcon, SpinnerGapIcon, SunIcon } from "@phosphor-icons/react";
import { createElement } from "react";
import { GatuLogo } from "@/components/brand/gatu-logo";
import { APP_VERSION, DEFAULT_FAVORITE_MARKETS } from "@/config/app";
import { DEFAULT_LOCALE_NAME, DESKTOP_NAV_ITEMS, DESKTOP_NAV_LABELS } from "@/config/desktop-nav";
import { FOOTER_LABELS, FOOTER_LINKS } from "@/config/footer-links";
import { MARKET_HEADER_LABELS } from "@/config/market-header";
import { HEADER_ICON_BUTTON_CLASS, HeaderIconButtonView } from "../header/header-icon-button-view";
import { DESKTOP_LANGUAGE_TRIGGER_CLASS, NavMenuTriggerView } from "../header/nav-menu-trigger-view";
import { TOP_NAV_LOGO_CLASS, TOP_NAV_WORDMARK_CLASS } from "../header/top-nav-view";
import { WalletCtaView } from "../header/wallet-cta-view";

export const FAVORITES_PLACEHOLDER = {
	items: DEFAULT_FAVORITE_MARKETS.map((name) => ({ name, label: `${name}-USDC`, active: false })),
	emptyLabel: MARKET_HEADER_LABELS.favoritesEmpty.message,
};

export const MARKET_HEADER_PLACEHOLDER = {
	trigger: {
		pairName: null,
		kindBadge: null,
		leverageBadge: null,
		isSpot: false,
		open: false,
		showAssetIcon: false,
	},
	ariaLabel: MARKET_HEADER_LABELS.price.message,
	stats: [
		{ id: "price", label: MARKET_HEADER_LABELS.mark.message, value: null, valueSample: "0,000.0" },
		{ id: "oracle", label: MARKET_HEADER_LABELS.oracle.message, value: null, valueSample: "0,000.0" },
		{ id: "change24h", label: MARKET_HEADER_LABELS.change24h.message, value: null, valueSample: "-0,000 / -0.00%" },
		{ id: "volume24h", label: MARKET_HEADER_LABELS.volume24h.message, value: null, valueSample: "$0,000,000,000.00" },
		{
			id: "openInterest",
			label: MARKET_HEADER_LABELS.openInterest.message,
			value: null,
			valueSample: "$0,000,000,000.00",
		},
		{
			id: "funding",
			label: `${MARKET_HEADER_LABELS.funding.message} / ${MARKET_HEADER_LABELS.resetsIn.message}`,
			value: null,
			valueSample: "+0.0000% 00:00:00",
			labelClass: "cursor-help border-b border-dashed border-trading-panel-stroke-control",
		},
	] as const,
};

export const TOP_NAV_PLACEHOLDER = {
	items: DESKTOP_NAV_ITEMS.map((item) => ({
		id: item.id,
		label: item.label.message,
		active: item.id === "trade",
		soon: item.soon,
		soonLabel: DESKTOP_NAV_LABELS.soon.message,
		compactHidden: item.compactHidden,
	})),
	moreLabel: DESKTOP_NAV_LABELS.more.message,
	navigationLabel: DESKTOP_NAV_LABELS.primary.message,
	compactHiddenWhenConnected: false,
	logo: createElement(
		"span",
		{ className: TOP_NAV_LOGO_CLASS },
		createElement(GatuLogo, { className: TOP_NAV_WORDMARK_CLASS }),
	),
	wallet: createElement(WalletCtaView, { label: DESKTOP_NAV_LABELS.wallet.message }),
	theme: createElement(
		HeaderIconButtonView,
		{
			className: `${HEADER_ICON_BUTTON_CLASS} active:not-data-disabled:scale-100`,
			"aria-label": DESKTOP_NAV_LABELS.light.message,
		},
		createElement(SunIcon, { className: "hidden size-[18px] dark:block" }),
		createElement(MoonIcon, { className: "size-[18px] dark:hidden" }),
	),
	language: createElement(
		"div",
		null,
		createElement(NavMenuTriggerView, {
			variant: "language",
			label: DEFAULT_LOCALE_NAME,
			compactLabel: true,
			className: DESKTOP_LANGUAGE_TRIGGER_CLASS,
			"aria-label": DESKTOP_NAV_LABELS.language.message,
			icon: createElement(GlobeIcon, { className: "size-[18px] shrink-0" }),
		}),
	),
	settings: createElement(
		HeaderIconButtonView,
		{ className: HEADER_ICON_BUTTON_CLASS, "aria-label": DESKTOP_NAV_LABELS.settings.message },
		createElement(SlidersHorizontalIcon, { className: "size-[18px]" }),
	),
};

export const FOOTER_PLACEHOLDER = {
	icon: createElement(SpinnerGapIcon, { className: "size-2.5 text-warning", "aria-hidden": true }),
	text: FOOTER_LABELS.connecting.message,
	tone: "text-warning",
	commandDisabled: true,
	commandLabel: FOOTER_LABELS.command.message,
	commandKey: FOOTER_LABELS.commandKey,
	links: FOOTER_LINKS.map((link) => ({ id: link.id, label: link.label.message })),
	linksLabel: FOOTER_LABELS.links.message,
	clock: null,
	version: APP_VERSION,
};
