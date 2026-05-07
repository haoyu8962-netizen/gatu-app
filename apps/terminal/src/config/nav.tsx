import { Trans } from "@lingui/react/macro";
import type { Icon } from "@phosphor-icons/react";
import { BookOpenIcon, ChartBarIcon, CurrencyCircleDollarIcon, ListIcon, TrendUpIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export type MobileTab = "chart" | "book" | "trade" | "positions" | "account";

export interface MobileNavItem {
	id: MobileTab;
	label: string;
	icon: Icon;
}

export const MOBILE_NAV_ITEMS: MobileNavItem[] = [
	{ id: "chart", label: "Chart", icon: ChartBarIcon },
	{ id: "book", label: "Book", icon: BookOpenIcon },
	{ id: "trade", label: "Trade", icon: TrendUpIcon },
	{ id: "positions", label: "Positions", icon: ListIcon },
	{ id: "account", label: "Account", icon: CurrencyCircleDollarIcon },
];

export type ScopeNavKey = "all" | "perp" | "spot" | "builders-perp";

export interface ScopeNavItem {
	scope: ScopeNavKey;
	label: ReactNode;
	to: string;
	activeClass: string;
}

export const SCOPE_NAV_ITEMS: readonly ScopeNavItem[] = [
	{
		scope: "all",
		label: <Trans>All</Trans>,
		to: "/",
		activeClass: "text-fg font-medium bg-fill-hover",
	},
	{
		scope: "perp",
		label: <Trans>Perp</Trans>,
		to: "/perp",
		activeClass: "text-scope-perp font-medium bg-scope-perp/10",
	},
	{
		scope: "spot",
		label: <Trans>Spot</Trans>,
		to: "/spot",
		activeClass: "text-scope-spot font-medium bg-scope-spot/10",
	},
	{
		scope: "builders-perp",
		label: <Trans>Builders</Trans>,
		to: "/builders-perp",
		activeClass: "text-scope-builders font-medium bg-scope-builders/10",
	},
] as const;

export interface StaticNavItem {
	key: string;
	label: ReactNode;
}

export const STATIC_NAV_ITEMS: readonly StaticNavItem[] = [
	{ key: "vaults", label: <Trans>Vaults</Trans> },
	{ key: "portfolio", label: <Trans>Portfolio</Trans> },
	{ key: "staking", label: <Trans>Staking</Trans> },
	{ key: "leaderboard", label: <Trans>Leaderboard</Trans> },
] as const;
