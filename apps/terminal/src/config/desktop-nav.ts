import { msg } from "@lingui/core/macro";
import { defaultLocale, locales } from "./i18n";

export const DESKTOP_NAV_ITEMS = [
	{ id: "trade", label: msg`Trade`, path: "/", soon: false, compactHidden: false },
	{
		id: "portfolio",
		label: msg`Portfolio`,
		path: "/portfolio",
		soon: false,
		compactHidden: false,
	},
	{ id: "earn", label: msg`Earn`, path: null, soon: true, compactHidden: false },
	{ id: "vaults", label: msg`Vaults`, path: "/vaults", soon: false, compactHidden: true },
	{ id: "staking", label: msg`Staking`, path: "/staking", soon: false, compactHidden: true },
	{
		id: "referrals",
		label: msg`Referrals`,
		path: "/referrals",
		soon: false,
		compactHidden: true,
	},
	{
		id: "leaderboard",
		label: msg`Leaderboard`,
		path: "/leaderboard",
		soon: false,
		compactHidden: true,
	},
] as const;

export const DESKTOP_NAV_LABELS = {
	openNavigation: msg`Open navigation`,

	primary: msg`Primary navigation`,
	soon: msg`Soon`,
	more: msg`More`,
	wallet: msg`Connect Wallet`,
	language: msg`Language and number format`,
	settings: msg`Settings`,
	light: msg`Switch to light mode`,
	dark: msg`Switch to dark mode`,
};

export const DEFAULT_LOCALE_NAME = locales[defaultLocale];
