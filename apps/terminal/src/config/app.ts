export { APP_NAME } from "./build-meta";
export const APP_RELEASE_VERSION = import.meta.env.VITE_SAIRN_APP_VERSION?.trim() || "0.1.0";
export const APP_BUILD_COMMIT = import.meta.env.VITE_SAIRN_BUILD_SHA?.trim() || "dev";
export const APP_RELEASE_ID = import.meta.env.VITE_SAIRN_RELEASE_ID?.trim() || "local";
export const APP_BUILD_TIME = import.meta.env.VITE_SAIRN_BUILD_TIME?.trim() || "unknown";
export const APP_CHART_LIBRARY_HASH = import.meta.env.VITE_SAIRN_CHART_LIBRARY_HASH?.trim() || "";
export const APP_VERSION =
	APP_BUILD_COMMIT === "dev"
		? `v${APP_RELEASE_VERSION}-dev`
		: `v${APP_RELEASE_VERSION}+${APP_BUILD_COMMIT.slice(0, 8)}`;
const RELEASE_TAG_PATTERN = /-(p\d+[a-z]?)$/;
export const APP_RELEASE_TAG = APP_RELEASE_ID.match(RELEASE_TAG_PATTERN)?.[1] ?? APP_RELEASE_ID;
export const APP_RELEASE_LABEL =
	APP_BUILD_COMMIT === "dev" ? "dev" : `${APP_RELEASE_TAG} · ${APP_BUILD_COMMIT.slice(0, 8)}`;

export const FALLBACK_VALUE_PLACEHOLDER = "-";
export const FORMAT_COMPACT_THRESHOLD = 10_000;
export const FORMAT_COMPACT_DEFAULT = true;

export const DEFAULT_FAVORITE_MARKETS = ["BTC", "ETH", "HYPE"] as const;

export const DEFAULT_MARKET_KEY = "perp:BTC";
export const DEFAULT_MARKET_NAME = "BTC";
export const DEFAULT_MARKET_SCOPE = "perp" as const;
export const DEFAULT_QUOTE_TOKEN = "USDC";
export const USDC_TRANSFER_DECIMALS = 2;

export const HL_ALL_DEXS = "ALL_DEXS" as const;

export const STORAGE_KEYS = {
	MARKET_PREFS: "market-prefs-v2",
	GLOBAL_SETTINGS: "global-settings-v2",
	NETWORK: "hyperliquid-network-v1",
	LOCALE: "locale-v1",
	META_CACHE: "hyperliquid-meta-cache-v2",
	SIDEBAR_STATE: "sidebar_state-v2",
	ORDER_ENTRY: "order-entry-v2",
	LAST_MARK: "hl-last-mark-v1",
	MARKETS_STATS: "hl-mkt-stats-v2",
	HIP3_DISCLAIMER: "hip3-deployer-disclaimer-v1",
	PENDING_ORDERS: "hl-pending-orders-v1",
	PENDING_TWAPS: "hl-pending-twaps-v1",
	RQ_CACHE: "hl-rq-cache-v1",
	LEGACY_METADATA: "hl-markets-meta-v1",
	LEGACY_RECENT_WALLETS: "hypeterminal:recent-wallets",
} as const;

export const RQ_CACHE_BUSTER = "v3";

export const TOKEN_ICON_BASE_URL = "https://app.hyperliquid.xyz/coins";

export const LIFI_INTEGRATOR = "sairn";
