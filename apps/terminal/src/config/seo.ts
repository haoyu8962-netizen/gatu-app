export const SEO_DEFAULTS = {
	siteName: "GATU",
	siteUrl: "https://app.gatu.ai",
	defaultTitle: "GATU Terminal — 永续 · 现货交易终端",
	defaultOgTitle: "GATU Terminal",
	defaultDescription: "低延迟链上交易终端：永续、现货、组合与订单管理。",
	ogImagePath: "/og-terminal-1200x630.png",
	ogImageWidth: 1200,
	ogImageHeight: 630,
	ogImageType: "image/png",
	ogImageAlt: "GATU 永续与现货交易终端：低延迟、自托管、链上结算",
	locale: "en_US",
	// meta theme-color needs a literal CSS color value (tag consumer reads from HTML, not CSS vars)
	themeColor: "#0F1A1F",
} as const;

export const SEO_BASE_KEYWORDS = ["hyperliquid", "trading", "dex", "perpetuals", "crypto", "defi"] as const;

const TRADE_PAGE_SEO = {
	title: SEO_DEFAULTS.defaultTitle,
	fullTitle: true,
	description: SEO_DEFAULTS.defaultDescription,
	ogTitle: SEO_DEFAULTS.defaultOgTitle,
} as const;

export const ROUTE_SEO = {
	TRADE: {
		...TRADE_PAGE_SEO,
		path: "/",
		keywords: ["trade", "orderbook", "chart", "perpetuals", "spot"],
	},
	PERP: {
		...TRADE_PAGE_SEO,
		path: "/perp",
		keywords: ["perpetuals", "futures", "leverage", "trading"],
	},
	SPOT: {
		...TRADE_PAGE_SEO,
		path: "/spot",
		keywords: ["spot", "trading", "exchange"],
	},
	BUILDERS_PERP: {
		...TRADE_PAGE_SEO,
		path: "/builders-perp",
		keywords: ["builders", "hip-3", "perpetuals", "community"],
	},
	COMPONENTS: {
		title: "Components",
		description:
			"UI component showcase for the GATU design system. Explore buttons, badges, cards, and trading-specific components.",
		path: "/components",
		keywords: ["components", "design system", "ui"],
		noIndex: true,
	},
	NOT_FOUND: {
		title: "Page Not Found",
		description: "The page you are looking for does not exist.",
		path: "/404",
		noIndex: true,
	},
} as const;
