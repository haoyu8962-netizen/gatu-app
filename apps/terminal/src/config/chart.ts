import type {
	ChartingLibraryFeatureset,
	LanguageCode,
	ResolutionString,
	TimeFrameItem,
} from "@/types/charting_library";
import { DEFAULT_QUOTE_TOKEN } from "./app";
import { isValidLocale, type LocaleCode } from "./i18n";

export { CHART_LIBRARY_PATH } from "./chart-library";

export const CHART_TIME_FRAMES: TimeFrameItem[] = [
	{ text: "5y", resolution: "1W" as ResolutionString, description: "5 Years" },
	{ text: "1y", resolution: "1D" as ResolutionString, description: "1 Year" },
	{ text: "3m", resolution: "240" as ResolutionString, description: "3 Months" },
	{ text: "1m", resolution: "60" as ResolutionString, description: "1 Month" },
	{ text: "5d", resolution: "15" as ResolutionString, description: "5 Days" },
	{ text: "1d", resolution: "5" as ResolutionString, description: "1 Day" },
];

export const CHART_DEFAULT_SYMBOL = "AAVE/USDC";
export const CHART_DEFAULT_INTERVAL = "60";
export const CHART_DEFAULT_THEME = "dark" as const;
export const CHART_EXCHANGE = "Hyperliquid";
export const CHART_QUOTE_ASSET = DEFAULT_QUOTE_TOKEN;
export const CHART_SESSION = "24x7";
export const CHART_TIMEZONE = "Etc/UTC";
export const CHART_DEFAULT_PRICESCALE = 100;

export const CHART_SUPPORTED_RESOLUTIONS = [
	"1",
	"3",
	"5",
	"15",
	"30",
	"60",
	"120",
	"240",
	"480",
	"720",
	"1D",
	"1W",
	"1M",
] as unknown as ResolutionString[];

export const CHART_LOCALE = "en" satisfies LanguageCode;

const chartLocaleByAppLocale: Record<LocaleCode, LanguageCode> = {
	en: "en",
	zh: "zh",
	hi: "en",
	es: "es",
	fr: "fr",
	ar: "ar",
};

export function resolveChartLocale(locale: string): LanguageCode {
	return isValidLocale(locale) ? chartLocaleByAppLocale[locale] : CHART_LOCALE;
}
export const CHART_CUSTOM_FONT_FAMILY = "ui-sans-serif, system-ui, sans-serif";

export const CHART_ENABLED_FEATURES = [
	// Load the chart from a real same-origin iframe (charting_library/sameorigin.html) instead of
	// TradingView's about:blank injection (compatibility_mode), whose injection timing intermittently
	// leaves onChartReady unfired in production. Still avoids the blob iframe path; frame-ancestors stays strict.
	"iframe_loading_same_origin",
	"side_toolbar_in_fullscreen_mode",
	"header_in_fullscreen_mode",
	"hide_last_na_study_output",
	"constraint_dialogs_to_chart",
	"dont_show_boolean_study_arguments",
	"hide_resolution_in_legend",
	"items_favoriting",
	"save_shortcut",
] as ChartingLibraryFeatureset[];

export const CHART_DISABLED_FEATURES = [
	"header_symbol_search",
	"header_quick_search",
	"header_compare",
	"display_market_status",
	"popup_hints",
	"header_saveload",
	"header_screenshot",
	"volume_force_overlay",
	"show_logo_on_all_charts",
	"caption_buttons_text_if_possible",
	"symbol_search_hot_key",
	"compare_symbol",
	"border_around_the_chart",
	"remove_library_container_border",
	"header_undo_redo",
	"go_to_date",
	"timezone_menu",
	"study_templates",
	"use_localstorage_for_settings",
	"save_chart_properties_to_local_storage",
	"countdown",
	"timeframes_toolbar",
	"main_series_scale_menu",
	// Internal flag behind the library's sampled Google Analytics ping (2% of loads); the chart CSP
	// blocks the loader host anyway. See docs/runtime-guardrails.md §4.
	"14851",
] as ChartingLibraryFeatureset[];

export const CHART_FAVORITE_INTERVALS = ["1", "5", "60", "240", "1D"] as ResolutionString[];

export const CHART_WIDGET_DEFAULTS = {
	AUTOSIZE: true,
	FULLSCREEN: false,
	DEBUG: false,
} as const;

export const CHART_DATAFEED_CONFIG = {
	SYMBOL_TYPE: "crypto",
	SYMBOL_TYPES: [{ name: "crypto", value: "crypto" }],
	DATA_STATUS: "streaming",
	FORMAT: "price",
	MIN_MOVEMENT: 1,
	VOLUME_PRECISION: 2,
	SEARCH_LIMIT: 50,
} as const;

export const CHART_MIN_HEIGHT_PX = 300;
