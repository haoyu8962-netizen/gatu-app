import logoImageUrl from "../../../../brand/social/sairn-avatar-light-1024.png?url";
import { APP_URL, BRAND_NAME, SITE_URL, THEME_COLOR } from "./brand";

export const SEO_DEFAULTS = {
	siteName: BRAND_NAME,
	siteUrl: SITE_URL,
	appUrl: APP_URL,
	defaultTitle: `${BRAND_NAME} — See the market clearly. Decide for yourself.`,
	defaultOgTitle: BRAND_NAME,
	defaultDescription:
		"An independent trading terminal for every market on Hyperliquid: perpetuals on crypto, stocks, indices, commodities, FX and pre-IPO companies, plus spot. Sign in with email or your own wallet.",
	locale: "en_US",
	themeColor: THEME_COLOR,
	ogImage: "/og-website-1200x630.png",
	ogImageWidth: 1200,
	ogImageHeight: 630,
	ogImageAlt: `${BRAND_NAME} — See the market clearly. Decide for yourself.`,
	logoImage: logoImageUrl,
} as const;

export const SEO_BASE_KEYWORDS = [
	"hyperliquid",
	"hyperliquid terminal",
	"trading terminal",
	"dex",
	"perpetuals",
	"perps",
	"spot trading",
	"hip-3",
	"crypto",
	"defi",
] as const;

export const ROUTE_SEO = {
	HOME: {
		title: SEO_DEFAULTS.defaultTitle,
		fullTitle: true,
		ogTitle: SEO_DEFAULTS.defaultOgTitle,
		description: SEO_DEFAULTS.defaultDescription,
		path: "/",
		keywords: ["wallet-native", "non-custodial", "stock perpetuals", "pre-IPO perpetuals"],
	},
	BLOG_INDEX: {
		title: "Blog",
		description: `Notes from building ${BRAND_NAME} — architecture, signing flows, and release notes.`,
		path: "/blog/",
		keywords: ["changelog", "architecture", "signing"],
	},
} as const;
