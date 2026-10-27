import brand from "../../../../brand/brand.json" with { type: "json" };

export const BRAND_NAME: string = brand.name.display;
export const SITE_URL = `https://${brand.domains.primary.apex}`;
export const APP_HOST: string = brand.domains.primary.app;
export const APP_URL = `https://${brand.domains.primary.app}`;
export const SUPPORT_EMAIL: string = brand.emails.support;
export const LEGAL_ENTITY: string = brand.name.legalEntity;
/** Browser chrome colour of the light pages (the default theme). */
export const THEME_COLOR: string = brand.pwa.lightThemeColor;
/** Browser chrome colour of the dark comparison theme (?theme=dark), the terminal's window colour. */
export const DARK_THEME_COLOR: string = brand.pwa.themeColor;
export const SITE_HOST: string = brand.domains.primary.apex;

/** Every official host in brand.json's primary domain group, with what it serves (Security: Official links). */
export const OFFICIAL_HOSTS: readonly { host: string; serves: string }[] = [
	{ host: brand.domains.primary.apex, serves: "This website" },
	{ host: brand.domains.primary.www, serves: "This website" },
	{ host: brand.domains.primary.app, serves: "The trading terminal" },
	{ host: brand.domains.primary.testnet, serves: "The terminal on Hyperliquid testnet" },
];
