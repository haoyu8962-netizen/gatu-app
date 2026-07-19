import { t } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";
import { CHART_MIN_HEIGHT_PX } from "@/config/chart";
import { loadTradingViewScript } from "@/lib/chart/load-tradingview";
import {
	getChartApiSymbol,
	getChartMarketKeys,
	getChartMarketLookupKey,
	getChartPriceScale,
	getChartSymbolInfo,
	isChartMarketSymbol,
} from "@/lib/chart/market-symbol";
import { buildChartOverrides, getChartCssUrl, getLoadingScreenColors } from "@/lib/chart/theme-colors";
import { cn } from "@/lib/cn";
import { subscribeWsReconnect, type UnifiedMarketInfo } from "@/lib/hyperliquid";
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
	TIMEZONE,
} from "./constants";
import { type ChartDatafeed, createDatafeed } from "./datafeed";

const CHART_READY_SOFT_TIMEOUT_MS = 45_000;
const SYMBOL_SWITCH_RETRY_TIMEOUT_MS = 8_000;
const SYMBOL_SWITCH_MAX_RETRIES = 1;

interface Props {
	active?: boolean;
	symbol?: string;
	market?: UnifiedMarketInfo;
	interval?: string;
	theme?: "light" | "dark";
	yAxisInside?: boolean;
}

export function TradingViewChart({
	active = true,
	symbol = DEFAULT_CHART_SYMBOL,
	market,
	interval = DEFAULT_CHART_INTERVAL,
	theme = DEFAULT_CHART_THEME,
	yAxisInside = false,
}: Props) {
	const widgetSymbol = market ? getChartApiSymbol(market) : symbol;
	const containerRef = useRef<HTMLDivElement>(null);
	const widgetRef = useRef<IChartingLibraryWidget | null>(null);
	const datafeedRef = useRef<ChartDatafeed | null>(null);
	const chartReadyRef = useRef(false);
	const pendingDataResetRef = useRef(false);
	const scheduledDataResetWidgetRef = useRef<IChartingLibraryWidget | null>(null);
	const targetSymbolRef = useRef(symbol);
	const targetIntervalRef = useRef(interval);
	const targetThemeRef = useRef(theme);
	const activeRef = useRef(active);
	const appliedSymbolRef = useRef<string | null>(null);
	const appliedIntervalRef = useRef<string | null>(null);
	const appliedThemeRef = useRef<"light" | "dark" | null>(null);
	const pendingSymbolRef = useRef<string | null>(null);
	const pendingIntervalRef = useRef<string | null>(null);
	const symbolSwitchRetryCountRef = useRef(0);
	const symbolSwitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const symbolSwitchCleanupRef = useRef<(() => void) | null>(null);
	const cancelSymbolSwitchRef = useRef<() => void>(() => {});
	const themeSwitchSequenceRef = useRef(0);
	const marketBySymbolRef = useRef(new Map<string, UnifiedMarketInfo>());
	const applySymbolRef = useRef<() => void>(() => {});
	const applyThemeRef = useRef<(nextTheme: "light" | "dark") => void>(() => {});
	const requestDataResetRef = useRef<() => void>(() => {});
	const [initError, setInitError] = useState<string | null>(null);
	const [isInitializing, setIsInitializing] = useState(true);
	const [showReadyPrompt, setShowReadyPrompt] = useState(false);
	const [retryNonce, setRetryNonce] = useState(0);
	targetSymbolRef.current = widgetSymbol;
	targetIntervalRef.current = interval;
	targetThemeRef.current = theme;
	activeRef.current = active;
	if (market) {
		for (const key of getChartMarketKeys(market)) {
			marketBySymbolRef.current.set(getChartMarketLookupKey(key), market);
		}
	}

	const clearSymbolSwitchTimeout = () => {
		if (symbolSwitchTimeoutRef.current) {
			clearTimeout(symbolSwitchTimeoutRef.current);
			symbolSwitchTimeoutRef.current = null;
		}
	};

	const clearSymbolSwitchListeners = () => {
		clearSymbolSwitchTimeout();
		const cleanup = symbolSwitchCleanupRef.current;
		symbolSwitchCleanupRef.current = null;
		cleanup?.();
	};

	const clearPendingSymbolSwitch = () => {
		clearSymbolSwitchListeners();
		pendingSymbolRef.current = null;
		pendingIntervalRef.current = null;
		symbolSwitchRetryCountRef.current = 0;
	};
	cancelSymbolSwitchRef.current = clearPendingSymbolSwitch;

	const finishSymbolSwitch = () => {
		clearPendingSymbolSwitch();
	};

	const completeSymbolSwitch = (nextSymbol: string, nextInterval: string) => {
		appliedSymbolRef.current = nextSymbol;
		appliedIntervalRef.current = nextInterval;
		finishSymbolSwitch();
	};

	const isChartSymbolApplied = (actualSymbol: string | undefined, nextSymbol: string) => {
		if (!actualSymbol) return false;
		if (actualSymbol === nextSymbol) return true;

		const targetMarket = marketBySymbolRef.current.get(getChartMarketLookupKey(nextSymbol));
		if (!targetMarket) return false;
		return isChartMarketSymbol(targetMarket, actualSymbol);
	};

	const getActiveChartSymbol = (widget: IChartingLibraryWidget) => {
		try {
			return widget.activeChart().symbol();
		} catch {
			return undefined;
		}
	};

	applySymbolRef.current = () => {
		const widget = widgetRef.current;
		if (!widget || !chartReadyRef.current) return;
		if (!activeRef.current) return;

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

		const handleSymbolSwitchComplete = (actualSymbol = getActiveChartSymbol(widget)) => {
			if (
				widgetRef.current === widget &&
				targetSymbolRef.current === nextSymbol &&
				targetIntervalRef.current === nextInterval &&
				isChartSymbolApplied(actualSymbol, nextSymbol)
			) {
				completeSymbolSwitch(nextSymbol, nextInterval);
			}
		};
		const handleSymbolChanged = () => handleSymbolSwitchComplete();

		const scheduleSymbolSwitchRetry = () => {
			clearSymbolSwitchTimeout();
			symbolSwitchTimeoutRef.current = setTimeout(() => {
				if (
					widgetRef.current !== widget ||
					targetSymbolRef.current !== nextSymbol ||
					targetIntervalRef.current !== nextInterval ||
					pendingSymbolRef.current !== nextSymbol ||
					pendingIntervalRef.current !== nextInterval
				) {
					return;
				}

				if (isChartSymbolApplied(getActiveChartSymbol(widget), nextSymbol)) {
					completeSymbolSwitch(nextSymbol, nextInterval);
					return;
				}

				if (symbolSwitchRetryCountRef.current < SYMBOL_SWITCH_MAX_RETRIES) {
					symbolSwitchRetryCountRef.current += 1;
					tryApplySymbol();
					return;
				}

				finishSymbolSwitch();
				setInitError("symbol-switch");
			}, SYMBOL_SWITCH_RETRY_TIMEOUT_MS);
		};

		const tryApplySymbol = () => {
			clearSymbolSwitchListeners();
			try {
				const chart = widget.activeChart();
				const symbolChanged = chart.onSymbolChanged();
				symbolChanged.subscribe(null, handleSymbolChanged);
				symbolSwitchCleanupRef.current = () => {
					symbolChanged.unsubscribe(null, handleSymbolChanged);
				};
				scheduleSymbolSwitchRetry();
				widget.setSymbol(nextSymbol, nextInterval as ResolutionString, () => handleSymbolSwitchComplete());
			} catch {
				finishSymbolSwitch();
				setInitError("symbol-switch");
			}
		};

		tryApplySymbol();
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

	requestDataResetRef.current = () => {
		const widget = widgetRef.current;
		if (!widget || scheduledDataResetWidgetRef.current === widget) return;
		scheduledDataResetWidgetRef.current = widget;

		queueMicrotask(() => {
			if (scheduledDataResetWidgetRef.current === widget) {
				scheduledDataResetWidgetRef.current = null;
			}
			if (widgetRef.current !== widget) return;
			if (!chartReadyRef.current) {
				pendingDataResetRef.current = true;
				return;
			}

			try {
				pendingDataResetRef.current = false;
				widget.activeChart().resetData();
			} catch {
				pendingDataResetRef.current = true;
			}
		});
	};

	useEffect(
		() =>
			subscribeWsReconnect(() => {
				datafeedRef.current?.resetRealtimeCache();
			}),
		[],
	);

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
			return (
				marketBySymbolRef.current.get(getChartMarketLookupKey(symbolName)) ??
				marketBySymbolRef.current.get(getChartMarketLookupKey(coin))
			);
		}

		function isSelectedMarketCoin(coin: string): boolean | undefined {
			const currentMarket = getMarketForChartSymbol(coin, coin);
			return currentMarket?.name === coin ? true : undefined;
		}

		function getSelectedMarketPriceScale(coin: string): number | undefined {
			const currentMarket = getMarketForChartSymbol(coin, coin);
			if (currentMarket?.name !== coin) return undefined;
			return getChartPriceScale(currentMarket);
		}

		function getSelectedMarketSymbolInfo(symbolName: string, coin: string) {
			const currentMarket = getMarketForChartSymbol(symbolName, coin);
			if (!currentMarket) return undefined;
			return getChartSymbolInfo(currentMarket);
		}

		const removeWidget = () => {
			clearReadyPromptTimeout();
			clearPendingSymbolSwitch();
			if (widgetRef.current) {
				widgetRef.current.remove();
				widgetRef.current = null;
			}
			datafeedRef.current = null;
			chartReadyRef.current = false;
			pendingDataResetRef.current = false;
			scheduledDataResetWidgetRef.current = null;
			appliedSymbolRef.current = null;
			appliedIntervalRef.current = null;
			appliedThemeRef.current = null;
			themeSwitchSequenceRef.current += 1;
		};

		const handleFinalFailure = (reason: string) => {
			if (disposed) return;
			setIsInitializing(false);
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

				const datafeed = createDatafeed({
					getPriceScale: getSelectedMarketPriceScale,
					getSymbolInfo: getSelectedMarketSymbolInfo,
					isKnownCoin: isSelectedMarketCoin,
					onRealtimeReset: () => requestDataResetRef.current(),
				});
				datafeedRef.current = datafeed;

				const widget = new window.TradingView.widget({
					container: containerRef.current,
					library_path: CHART_LIBRARY_PATH,
					datafeed,
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
					setIsInitializing(false);
					setInitError(null);
					setShowReadyPrompt(false);
					if (pendingDataResetRef.current) requestDataResetRef.current();
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
		if (!active) {
			// A cancelled in-flight setSymbol may still land inside the hidden iframe, so the
			// applied bookkeeping can no longer be trusted; drop it to force a verified re-apply
			// (with watchdog) on the next activation even when the target loops back.
			if (pendingSymbolRef.current !== null) {
				appliedSymbolRef.current = null;
				appliedIntervalRef.current = null;
			}
			cancelSymbolSwitchRef.current();
			return;
		}
		applySymbolRef.current();
	}, [widgetSymbol, interval, active]);

	useEffect(() => {
		targetThemeRef.current = theme;
		applyThemeRef.current(theme);
	}, [theme]);

	return (
		<div
			className={cn("relative w-full h-full", yAxisInside && "[--tv-y-axis-inside:1]")}
			style={{ minHeight: CHART_MIN_HEIGHT_PX }}
			aria-busy={isInitializing}
		>
			<div ref={containerRef} className="w-full h-full" />
			<div
				data-chart-initializing
				aria-hidden="true"
				className={cn(
					"pointer-events-none absolute inset-0 z-10 bg-background transition-opacity duration-150 ease-out motion-reduce:transition-none",
					isInitializing ? "opacity-100" : "opacity-0",
				)}
			/>
			{(initError || showReadyPrompt) && (
				<div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-surface px-4 text-center">
					<p className="text-sm font-medium text-fg">{initError ? t`Something went wrong` : t`Loading...`}</p>
					<button
						type="button"
						className="rounded-xs border border-stroke-weak px-3 py-1.5 text-xs font-medium text-fg hover:bg-fill-hover"
						onClick={() => {
							setIsInitializing(true);
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
