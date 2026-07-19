import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { Icon } from "@phosphor-icons/react";
import { ChartBarIcon, CurrencyCircleDollarIcon, TrendUpIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export type MobileTab = "markets" | "trade" | "account";

const TRADE_ROUTE_PREFIXES = ["/trade", "/perp", "/spot", "/builders-perp"] as const;

export function isTradeRoutePath(pathname: string): boolean {
	return (
		pathname === "/" || TRADE_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
	);
}

export interface MobileNavItem {
	id: MobileTab;
	label: MessageDescriptor;
	icon: Icon;
}

export const MOBILE_NAV_ITEMS: MobileNavItem[] = [
	{ id: "markets", label: msg`Markets`, icon: ChartBarIcon },
	{ id: "trade", label: msg`Trade`, icon: TrendUpIcon },
	{ id: "account", label: msg`Account`, icon: CurrencyCircleDollarIcon },
];

export interface StaticNavItem {
	key: string;
	label: ReactNode;
}

export const STATIC_NAV_ITEMS: readonly StaticNavItem[] = [
	{ key: "vaults", label: <Trans>Vaults</Trans> },
	{ key: "staking", label: <Trans>Staking</Trans> },
	{ key: "leaderboard", label: <Trans>Leaderboard</Trans> },
] as const;
