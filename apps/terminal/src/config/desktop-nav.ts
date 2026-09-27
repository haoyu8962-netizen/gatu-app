import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { HYPERSCREENER_URL } from "./external-links";
import { defaultLocale, locales } from "./i18n";

export type DesktopNavPlacement = "primary" | "lower" | "more";

export interface DesktopNavItemConfig {
	id: string;
	label: MessageDescriptor;
	placement: DesktopNavPlacement;
	path?: string;
	href?: string;
	soon?: boolean;
	matchPrefix?: boolean;
}

export const DESKTOP_NAV_ITEMS = [
	{ id: "trade", label: msg`Trade`, placement: "primary", path: "/" },
	{ id: "portfolio", label: msg`Portfolio`, placement: "primary", path: "/portfolio" },
	{ id: "earn", label: msg`Earn`, placement: "primary", soon: true },
	{ id: "vaults", label: msg`Vaults`, placement: "lower", path: "/vaults", matchPrefix: true },
	{ id: "staking", label: msg`Staking`, placement: "lower", path: "/staking" },
	{ id: "referrals", label: msg`Referrals`, placement: "lower", path: "/referrals" },
	{ id: "leaderboard", label: msg`Leaderboard`, placement: "lower", path: "/leaderboard" },
	{ id: "funding-comparison", label: msg`Funding Comparison`, placement: "more", path: "/fundingComparison" },
	{ id: "statistics", label: msg`Statistics`, placement: "more", href: HYPERSCREENER_URL },
	{ id: "api-wallet", label: msg`API Wallet`, placement: "more", path: "/api-wallet" },
] as const satisfies readonly DesktopNavItemConfig[];

export type DesktopNavItem = (typeof DESKTOP_NAV_ITEMS)[number];

export const DESKTOP_NAV_LABELS = {
	openNavigation: msg`Open navigation`,

	primary: msg`Primary navigation`,
	soon: msg`Soon`,
	more: msg`More`,
	utilities: msg`Display and language`,
	wallet: msg`Connect Wallet`,
	language: msg`Language and number format`,
	settings: msg`Settings`,
	light: msg`Switch to light mode`,
	dark: msg`Switch to dark mode`,
};

export const DEFAULT_LOCALE_NAME = locales[defaultLocale];
