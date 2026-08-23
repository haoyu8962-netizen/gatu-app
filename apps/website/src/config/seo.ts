export const SEO_DEFAULTS = {
	siteName: "GATU",
	siteUrl: "https://gatu.ai",
	appUrl: "https://app.gatu.ai",
	defaultTitle: "GATU — Gateway to on-chain transactions",
	defaultOgTitle: "GATU",
	defaultDescription: "Perpetual and spot trading—direct on-chain access via a single gateway.",
	locale: "en_US",
	themeColor: "#0a0a0a",
	ogImage: "/og-website-1200x630.png",
	ogImageWidth: 1200,
	ogImageHeight: 630,
	ogImageAlt: "GATU — Gateway to on-chain transactions",
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
			"Notes from building GATU — architecture, signing flows, self-hosting, and the weekly changelog.",
		path: "/blog",
		keywords: ["changelog", "architecture", "self-hosting", "signing"],
	},
} as const;
