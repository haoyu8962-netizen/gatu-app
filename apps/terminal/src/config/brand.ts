import brand from "../../../../brand/brand.json";

export type BrandHexColor = `#${string}`;

export interface BrandDomainGroup {
	apex: string;
	www: string;
	app: string;
	testnet: string;
}

export const BRAND_NAME: string = brand.name.display;
export const BRAND_FILE_STEM: string = brand.name.lowercase;
export const BRAND_LEGAL_ENTITY: string = brand.name.legalEntity;

export const BRAND_PRIMARY_DOMAINS: BrandDomainGroup = brand.domains.primary;
export const BRAND_LEGACY_DOMAINS: readonly BrandDomainGroup[] = brand.domains.legacy;

export const SUPPORT_EMAIL: string = brand.emails.support;

export const PWA_THEME_COLOR: BrandHexColor = hexColor(brand.pwa.themeColor);
export const PWA_LIGHT_THEME_COLOR: BrandHexColor = hexColor(brand.pwa.lightThemeColor);

export const BRAND_ACTION_COLORS: Readonly<Record<"light" | "dark", BrandHexColor>> = {
	light: hexColor(brand.colors.light.action),
	dark: hexColor(brand.colors.dark.action),
};

function hexColor(value: string): BrandHexColor {
	if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`brand/brand.json: ${value} is not a six-digit hex colour`);
	return value as BrandHexColor;
}
