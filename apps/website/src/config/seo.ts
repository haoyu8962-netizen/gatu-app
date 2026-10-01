import { APP_URL, BRAND_NAME, SITE_URL } from "./brand";

export const SEO_DEFAULTS = {
	siteName: BRAND_NAME,
	siteUrl: SITE_URL,
	appUrl: APP_URL,
	defaultTitle: `${BRAND_NAME} — Gateway to on-chain transactions`,
	defaultOgTitle: BRAND_NAME,
	defaultDescription: "Perpetual and spot trading—direct on-chain access via a single gateway.",
	locale: "en_US",
	themeColor: "#0a0a0a",
	ogImage: "/og-website-1200x630.png",
	ogImageWidth: 1200,
	ogImageHeight: 630,
	ogImageAlt: `${BRAND_NAME} — Gateway to on-chain transactions`,
	logoImage: "/gatu-logo-1024.png",
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
	"open source",
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
		keywords: ["wallet-native", "self-hosted", "websocket", "leverage"],
	},
	BLOG_INDEX: {
		title: "Blog",
		description:
			`Notes from building ${BRAND_NAME} — architecture, signing flows, self-hosting, and the weekly changelog.`,
		path: "/blog",
		keywords: ["changelog", "architecture", "self-hosting", "signing"],
	},
} as const;
