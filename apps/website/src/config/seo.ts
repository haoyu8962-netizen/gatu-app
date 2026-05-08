export const SEO_DEFAULTS = {
	siteName: "HypeTerminal",
	siteUrl: "https://hypeterminal.com",
	appUrl: "https://app.hypeterminal.com",
	githubUrl: "https://github.com/vipineth/hypeterminal",
	defaultTitle: "HypeTerminal — Open-source trading terminal for Hyperliquid",
	defaultDescription:
		"Open-source trading terminal for Hyperliquid. Perp, spot, and builder DEXs with sub-second charts, deep order books, and every order type — wallet-native, no signup.",
	twitterHandle: "@hypeterminal",
	locale: "en_US",
	themeColor: "#0a0a0a",
	ogImage: "/og.png",
	ogImageWidth: 1200,
	ogImageHeight: 630,
	ogImageAlt: "HypeTerminal — Open-source trading terminal for Hyperliquid",
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
		description: SEO_DEFAULTS.defaultDescription,
		path: "/",
		keywords: ["wallet-native", "self-hosted", "websocket", "leverage"],
	},
	BLOG_INDEX: {
		title: "Blog",
		description:
			"Notes from building HypeTerminal — architecture, signing flows, self-hosting, and the weekly changelog.",
		path: "/blog",
		keywords: ["changelog", "architecture", "self-hosting", "signing"],
	},
} as const;
