import { t } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";
import { CHART_MIN_HEIGHT_PX } from "@/config/chart";
import { loadTradingViewScript } from "@/lib/chart/load-tradingview";
import { priceScaleFromMid } from "@/lib/chart/symbol";
import { buildChartOverrides, getChartCssUrl, getLoadingScreenColors } from "@/lib/chart/theme-colors";
import { cn } from "@/lib/cn";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import type { IChartingLibraryWidget, ResolutionString } from "@/types/charting_library";
import {
	CHART_CUSTOM_FONT_FAMILY,
	CHART_DISABLED_FEATURES,
	CHART_ENABLED_FEATURES,
	CHART_FAVORITE_INTERVALS,
	CHART_LIBRARY_PATH,
	CHART_LOCALE,
	CHART_TIME_FRAMES,
	CHART_WIDGET_DEFAULTS,
	DEFAULT_CHART_INTERVAL,
	DEFAULT_CHART_SYMBOL,
	DEFAULT_CHART_THEME,
	QUOTE_ASSET,
	TIMEZONE,
} from "./constants";
import { createDatafeed } from "./datafeed";

const MAX_SYMBOL_SWITCH_ATTEMPTS = 2;
const SYMBOL_SWITCH_TIMEOUT_MS = 4_000;
const CHART_READY_SOFT_TIMEOUT_MS = 45_000;

function priceScaleFromSzDecimals(szDecimals: number): number {
	const decimals = Math.min(Math.max(6 - szDecimals, 2), 8);
	return 10 ** decimals;
}

function getChartSymbol(market: UnifiedMarketInfo): string {
	return market.name;
}

function getChartDisplayName(market: UnifiedMarketInfo): string {
	return market.pairName ?? market.name;
}

function getLegacyChartDisplaySymbol(market: UnifiedMarketInfo): string {
	if (market.kind === "builderPerp") {
		const quoteToken = market.quoteToken?.displayName ?? market.quoteToken?.name ?? QUOTE_ASSET;
		return `${market.name}/${quoteToken}`;
	}
	return getChartDisplayName(market);
}

function getChartMarketKeys(market: UnifiedMarketInfo): string[] {
	const keys = new Set<string>();
	keys.add(market.name);
	keys.add(market.pairName);
	keys.add(getLegacyChartDisplaySymbol(market));
	return Array.from(keys);
}

interface Props {
	symbol?: string;
	market?: UnifiedMarketInfo;
	interval?: string;
	theme?: "light" | "dark";
	yAxisInside?: boolean;
}

export function TradingViewChart({
	symbol = DEFAULT_CHART_SYMBOL,
	market,
	interval = DEFAULT_CHART_INTERVAL,
	theme = DEFAULT_CHART_THEME,
	yAxisInside = false,
}: Props) {
	const widgetSymbol = market ? getChartSymbol(market) : symbol;
	const containerRef = useRef<HTMLDivElement>(null);
	const widgetRef = useRef<IChartingLibraryWidget | null>(null);
	const chartReadyRef = useRef(false);
	const targetSymbolRef = useRef(symbol);
	const targetIntervalRef = useRef(interval);
	const targetThemeRef = useRef(theme);
	const marketRef = useRef(market);
	const appliedSymbolRef = useRef<string | null>(null);
	const appliedIntervalRef = useRef<string | null>(null);
	const appliedThemeRef = useRef<"light" | "dark" | null>(null);
	const pendingSymbolRef = useRef<string | null>(null);
	const pendingIntervalRef = useRef<string | null>(null);
	const symbolSwitchAttemptRef = useRef(0);
	const symbolSwitchTargetRef = useRef<string | null>(null);
	const symbolSwitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const symbolSwitchRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const symbolSwitchCleanupRef = useRef<(() => void) | null>(null);
	const themeSwitchSequenceRef = useRef(0);
	const marketBySymbolRef = useRef(new Map<string, UnifiedMarketInfo>());
	const applySymbolRef = useRef<() => void>(() => {});
	const applyThemeRef = useRef<(nextTheme: "light" | "dark") => void>(() => {});
	const [initError, setInitError] = useState<string | null>(null);
	const [showReadyPrompt, setShowReadyPrompt] = useState(false);
	const [retryNonce, setRetryNonce] = useState(0);
	targetSymbolRef.current = widgetSymbol;
	targetIntervalRef.current = interval;
	targetThemeRef.current = theme;
	marketRef.current = market;
	if (market) {
		for (const key of getChartMarketKeys(market)) {
			marketBySymbolRef.current.set(key, market);
		}
	}

	const clearSymbolSwitchTimeout = () => {
		if (symbolSwitchTimeoutRef.current) {
			clearTimeout(symbolSwitchTimeoutRef.current);
			symbolSwitchTimeoutRef.current = null;
		}
		if (symbolSwitchRetryTimeoutRef.current) {
			clearTimeout(symbolSwitchRetryTimeoutRef.current);
			symbolSwitchRetryTimeoutRef.current = null;
		}
	};

	const clearSymbolSwitchListeners = () => {
		const cleanup = symbolSwitchCleanupRef.current;
		symbolSwitchCleanupRef.current = null;
		cleanup?.();
	};

	const clearPendingSymbolSwitch = () => {
		clearSymbolSwitchTimeout();
		clearSymbolSwitchListeners();
		pendingSymbolRef.current = null;
		pendingIntervalRef.current = null;
	};

	const finishSymbolSwitch = () => {
		clearPendingSymbolSwitch();
	};

	const completeSymbolSwitch = (nextSymbol: string, nextInterval: string) => {
		appliedSymbolRef.current = nextSymbol;
		appliedIntervalRef.current = nextInterval;
		symbolSwitchAttemptRef.current = 0;
		symbolSwitchTargetRef.current = null;
		finishSymbolSwitch();
	};

	applySymbolRef.current = () => {
		const widget = widgetRef.current;
		if (!widget || !chartReadyRef.current) return;

		const nextSymbol = targetSymbolRef.current;
		const nextInterval = targetIntervalRef.current;
		const pendingMatches = pendingSymbolRef.current === nextSymbol && pendingIntervalRef.current === nextInterval;
		if (pendingMatches) return;
		if (
			!pendingSymbolRef.current &&
			appliedSymbolRef.current === nextSymbol &&
			appliedIntervalRef.current === nextInterval
		) {
			return;
		}

		clearPendingSymbolSwitch();
		pendingSymbolRef.current = nextSymbol;
		pendingIntervalRef.current = nextInterval;
		setInitError(null);

		const switchTarget = `${nextSymbol}\u0000${nextInterval}`;
		if (symbolSwitchTargetRef.current !== switchTarget) {
			symbolSwitchTargetRef.current = switchTarget;
			symbolSwitchAttemptRef.current = 0;
		}
		symbolSwitchAttemptRef.current += 1;

		const handleSymbolSwitchComplete = () => {
			if (
				widgetRef.current === widget &&
				targetSymbolRef.current === nextSymbol &&
				targetIntervalRef.current === nextInterval
			) {
				completeSymbolSwitch(nextSymbol, nextInterval);
			}
		};

		symbolSwitchTimeoutRef.current = setTimeout(() => {
			if (
				widgetRef.current !== widget ||
				pendingSymbolRef.current !== nextSymbol ||
				pendingIntervalRef.current !== nextInterval
			) {
				return;
			}

			finishSymbolSwitch();
			if (symbolSwitchAttemptRef.current < MAX_SYMBOL_SWITCH_ATTEMPTS) {
				symbolSwitchRetryTimeoutRef.current = setTimeout(() => {
					if (
						widgetRef.current === widget &&
						targetSymbolRef.current === nextSymbol &&
						targetIntervalRef.current === nextInterval
					) {
						applySymbolRef.current();
					}
				}, 0);
				return;
			}
			symbolSwitchAttemptRef.current = 0;
			symbolSwitchTargetRef.current = null;
			setInitError("symbol-switch-timeout");
		}, SYMBOL_SWITCH_TIMEOUT_MS);

		try {
			const chart = widget.activeChart();
			const symbolChanged = chart.onSymbolChanged();
			symbolChanged.subscribe(null, handleSymbolSwitchComplete, true);
			symbolSwitchCleanupRef.current = () => {
				symbolChanged.unsubscribe(null, handleSymbolSwitchComplete);
			};
			widget.setSymbol(nextSymbol, nextInterval as ResolutionString, handleSymbolSwitchComplete);
		} catch {
			finishSymbolSwitch();
			symbolSwitchAttemptRef.current = 0;
			symbolSwitchTargetRef.current = null;
		}
	};

	applyThemeRef.current = (nextTheme) => {
		const widget = widgetRef.current;
		if (!widget || !chartReadyRef.current) return;

		const sequence = themeSwitchSequenceRef.current + 1;
		themeSwitchSequenceRef.current = sequence;
		if (appliedThemeRef.current === nextTheme && widget.getTheme() === nextTheme) return;

		void widget
			.changeTheme(nextTheme)
			.then(() => {
				if (widgetRef.current !== widget || themeSwitchSequenceRef.current !== sequence) return;
				appliedThemeRef.current = nextTheme;
				widget.applyOverrides(buildChartOverrides());
			})
			.catch(() => undefined);
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: switch cleanup only reads refs; adding the helper would recreate the widget on every render.
	useEffect(() => {
		void retryNonce;
		if (!containerRef.current) return;
		let disposed = false;
		let readyPromptTimeout: ReturnType<typeof setTimeout> | null = null;
		chartReadyRef.current = false;

		const clearReadyPromptTimeout = () => {
			if (readyPromptTimeout) {
				clearTimeout(readyPromptTimeout);
				readyPromptTimeout = null;
			}
		};

		const scheduleReadyPrompt = (widget: IChartingLibraryWidget) => {
			clearReadyPromptTimeout();
			readyPromptTimeout = setTimeout(() => {
				if (disposed || chartReadyRef.current || widgetRef.current !== widget) return;
				setShowReadyPrompt(true);
			}, CHART_READY_SOFT_TIMEOUT_MS);
		};

		function getMarketForChartSymbol(symbolName: string, coin: string): UnifiedMarketInfo | undefined {
			return marketBySymbolRef.current.get(coin) ?? marketBySymbolRef.current.get(symbolName) ?? marketRef.current;
		}

		function isSelectedMarketCoin(coin: string): boolean | undefined {
			const currentMarket = getMarketForChartSymbol(coin, coin);
			return currentMarket?.name === coin ? true : undefined;
		}

		function getSelectedMarketPriceScale(coin: string): number | undefined {
			const currentMarket = getMarketForChartSymbol(coin, coin);
			if (currentMarket?.name !== coin) return undefined;
			if (currentMarket.markPx) return priceScaleFromMid(currentMarket.markPx);

			return priceScaleFromSzDecimals(currentMarket.szDecimals);
		}

		function getSelectedMarketSymbolInfo(symbolName: string, coin: string) {
			const currentMarket = getMarketForChartSymbol(symbolName, coin);
			if (!currentMarket) return undefined;
			const displayName = getChartDisplayName(currentMarket);
			if (
				symbolName !== currentMarket.name &&
				coin !== currentMarket.name &&
				symbolName !== currentMarket.pairName &&
				symbolName !== getLegacyChartDisplaySymbol(currentMarket)
			) {
				return undefined;
			}
			return {
				name: displayName,
				ticker: currentMarket.name,
				description: displayName,
				pricescale: getSelectedMarketPriceScale(currentMarket.name),
			};
		}

		const removeWidget = () => {
			clearReadyPromptTimeout();
			clearPendingSymbolSwitch();
			if (widgetRef.current) {
				widgetRef.current.remove();
				widgetRef.current = null;
			}
			chartReadyRef.current = false;
			appliedSymbolRef.current = null;
			appliedIntervalRef.current = null;
			appliedThemeRef.current = null;
			themeSwitchSequenceRef.current += 1;
		};

		const handleFinalFailure = (reason: string) => {
			if (disposed) return;
			setInitError(reason);
		};

		const initWidget = async () => {
			try {
				await loadTradingViewScript();

				if (disposed || !containerRef.current || !window.TradingView) return;

				removeWidget();

				const overrides = buildChartOverrides();
				const loadingColors = getLoadingScreenColors();
				const initialTheme = targetThemeRef.current;
				const customCssUrl = getChartCssUrl(initialTheme);

				const initialSymbol = targetSymbolRef.current;
				const initialInterval = targetIntervalRef.current;
				setInitError(null);
				setShowReadyPrompt(false);

				const widget = new window.TradingView.widget({
					container: containerRef.current,
					library_path: CHART_LIBRARY_PATH,
					datafeed: createDatafeed({
						getPriceScale: getSelectedMarketPriceScale,
						getSymbolInfo: getSelectedMarketSymbolInfo,
						isKnownCoin: isSelectedMarketCoin,
					}),
					symbol: initialSymbol,
					interval: initialInterval as ResolutionString,
					locale: CHART_LOCALE,
					fullscreen: CHART_WIDGET_DEFAULTS.FULLSCREEN,
					autosize: CHART_WIDGET_DEFAULTS.AUTOSIZE,
					theme: initialTheme,
					timezone: TIMEZONE,
					debug: CHART_WIDGET_DEFAULTS.DEBUG,
					custom_font_family: CHART_CUSTOM_FONT_FAMILY,
					time_frames: CHART_TIME_FRAMES,
					enabled_features: CHART_ENABLED_FEATURES,
					disabled_features: CHART_DISABLED_FEATURES,
					overrides: overrides,
					loading_screen: loadingColors,
					custom_css_url: customCssUrl,
					studies_overrides: {},
					favorites: {
						intervals: CHART_FAVORITE_INTERVALS,
					},
				});
				widgetRef.current = widget;
				appliedSymbolRef.current = initialSymbol;
				appliedIntervalRef.current = initialInterval;
				appliedThemeRef.current = initialTheme;
				scheduleReadyPrompt(widget);

				widget.onChartReady(() => {
					if (disposed || widgetRef.current !== widget) return;
					clearReadyPromptTimeout();
					chartReadyRef.current = true;
					setInitError(null);
					setShowReadyPrompt(false);
					applyThemeRef.current(targetThemeRef.current);
					applySymbolRef.current();
				});
			} catch {
				if (disposed) return;
				removeWidget();
				handleFinalFailure("exception");
			}
		};

		initWidget();

		return () => {
			disposed = true;
			clearReadyPromptTimeout();
			removeWidget();
		};
	}, [retryNonce]);

	useEffect(() => {
		targetSymbolRef.current = widgetSymbol;
		targetIntervalRef.current = interval;
		applySymbolRef.current();
	}, [widgetSymbol, interval]);

	useEffect(() => {
		targetThemeRef.current = theme;
		applyThemeRef.current(theme);
	}, [theme]);

	return (
		<div
			className={cn("relative w-full h-full", yAxisInside && "[--tv-y-axis-inside:1]")}
			style={{ minHeight: CHART_MIN_HEIGHT_PX }}
		>
			<div ref={containerRef} className="w-full h-full" />
			{(initError || showReadyPrompt) && (
				<div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-surface px-4 text-center">
					<p className="text-sm font-medium text-fg">{initError ? t`Something went wrong` : t`Loading...`}</p>
					<button
						type="button"
						className="rounded-xs border border-stroke-weak px-3 py-1.5 text-xs font-medium text-fg hover:bg-fill-hover"
						onClick={() => {
							setInitError(null);
							setShowReadyPrompt(false);
							setRetryNonce((value) => value + 1);
						}}
					>
						{t`Retry`}
					</button>
				</div>
			)}
		</div>
	);
}
