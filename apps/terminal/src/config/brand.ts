import brand from "../../../../brand/brand.json";

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

export const PWA_THEME_COLOR: string = brand.pwa.themeColor;
