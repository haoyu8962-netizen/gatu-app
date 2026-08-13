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
import {
	buildChartOverrides,
	colorToHex,
	colorToRgba,
	getChartColors,
	getChartCssUrl,
	getLoadingScreenColors,
} from "@/lib/chart/theme-colors";
import { TradingViewOverlayController, type TradingViewOverlayPalette } from "@/lib/chart/tradingview-overlays";
import { cn } from "@/lib/cn";
import { subscribeWsReconnect, type UnifiedMarketInfo } from "@/lib/hyperliquid";
import type { IChartingLibraryWidget, LanguageCode, ResolutionString } from "@/types/charting_library";
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
import { useTradingViewOverlayLines } from "./use-tradingview-overlay-lines";

const CHART_READY_TIMEOUT_MS = 15_000;
const CHART_READY_MAX_AUTO_RETRIES = 1;
const SYMBOL_SWITCH_RETRY_TIMEOUT_MS = 8_000;
const SYMBOL_SWITCH_MAX_RETRIES = 1;

function getTradingViewOverlayPalette(): TradingViewOverlayPalette {
	const colors = getChartColors();
	return {
		buy: {
			lineColor: colorToRgba(colors.green, 0.45),
			textColor: colorToHex(colors.green),
		},
		sell: {
			lineColor: colorToRgba(colors.red, 0.45),
			textColor: colorToHex(colors.red),
		},
		liquidation: {
			lineColor: colorToRgba(colors.red, 0.55),
			textColor: colorToHex(colors.red),
		},
	};
}

interface Props {
	active?: boolean;
	symbol?: string;
	market?: UnifiedMarketInfo;
	interval?: string;
	theme?: "light" | "dark";
	locale?: LanguageCode;
	yAxisInside?: boolean;
}

export function TradingViewChart({
	active = true,
	symbol = DEFAULT_CHART_SYMBOL,
	market,
	interval = DEFAULT_CHART_INTERVAL,
	theme = DEFAULT_CHART_THEME,
	locale = CHART_LOCALE,
	yAxisInside = false,
}: Props) {
	const widgetSymbol = market ? getChartApiSymbol(market) : symbol;
	const overlayLines = useTradingViewOverlayLines(market, symbol);
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
	const pauseReadyWatchdogRef = useRef<() => void>(() => {});
	const resumeReadyWatchdogRef = useRef<() => void>(() => {});
	const themeSwitchInFlightWidgetRef = useRef<IChartingLibraryWidget | null>(null);
	const themeSwitchRetryTargetRef = useRef<"light" | "dark" | null>(null);
	const marketBySymbolRef = useRef(new Map<string, UnifiedMarketInfo>());
	const overlayLinesRef = useRef(overlayLines);
	const overlayControllerRef = useRef<TradingViewOverlayController | null>(null);
	const applySymbolRef = useRef<() => void>(() => {});
	const applyThemeRef = useRef<(nextTheme: "light" | "dark") => void>(() => {});
	const requestDataResetRef = useRef<() => void>(() => {});
	const syncOverlaysRef = useRef<() => void>(() => {});
	const [initError, setInitError] = useState<string | null>(null);
	const [isInitializing, setIsInitializing] = useState(true);
	const [retryNonce, setRetryNonce] = useState(0);
	if (!overlayControllerRef.current) overlayControllerRef.current = new TradingViewOverlayController();
	targetSymbolRef.current = widgetSymbol;
	targetIntervalRef.current = interval;
	targetThemeRef.current = theme;
	activeRef.current = active;
	overlayLinesRef.current = overlayLines;
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
		syncOverlaysRef.current();
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

	syncOverlaysRef.current = () => {
		const widget = widgetRef.current;
		if (!widget || !chartReadyRef.current || !activeRef.current || pendingSymbolRef.current) return;
		const nextSymbol = targetSymbolRef.current;
		if (!isChartSymbolApplied(getActiveChartSymbol(widget), nextSymbol)) return;

		try {
			overlayControllerRef.current?.sync(
				widget.activeChart(),
				nextSymbol,
				overlayLinesRef.current,
				getTradingViewOverlayPalette(),
			);
		} catch {}
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
		overlayControllerRef.current?.clear();
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
		if (themeSwitchInFlightWidgetRef.current === widget) return;

		if (widget.getTheme() === nextTheme) {
			themeSwitchRetryTargetRef.current = null;
			if (appliedThemeRef.current !== nextTheme) {
				widget.applyOverrides(buildChartOverrides());
			}
			appliedThemeRef.current = nextTheme;
			syncOverlaysRef.current();
			return;
		}

		themeSwitchInFlightWidgetRef.current = widget;
		let themeSwitchFailed = false;
		void widget
			.changeTheme(nextTheme)
			.then(() => {
				if (widgetRef.current !== widget) return;
				if (targetThemeRef.current !== nextTheme) return;
				widget.applyOverrides(buildChartOverrides());
				appliedThemeRef.current = nextTheme;
				themeSwitchRetryTargetRef.current = null;
				syncOverlaysRef.current();
			})
			.catch(() => {
				themeSwitchFailed = true;
			})
			.finally(() => {
				if (themeSwitchInFlightWidgetRef.current === widget) {
					themeSwitchInFlightWidgetRef.current = null;
				}
				if (widgetRef.current !== widget) return;
				const targetTheme = targetThemeRef.current;
				if (targetTheme !== nextTheme) {
					themeSwitchRetryTargetRef.current = null;
					applyThemeRef.current(targetTheme);
					return;
				}
				if (!themeSwitchFailed || themeSwitchRetryTargetRef.current === nextTheme) return;
				themeSwitchRetryTargetRef.current = nextTheme;
				applyThemeRef.current(nextTheme);
			});
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
		let readyWatchdog:
			| {
					widget: IChartingLibraryWidget;
					automaticRetryCount: number;
					remainingMs: number;
					startedAt: number;
					timeout: ReturnType<typeof setTimeout> | null;
			  }
			| undefined;
		let deferredInitializationFailure: { reason: string; automaticRetryCount: number } | undefined;
		chartReadyRef.current = false;

		const clearReadyWatchdog = () => {
			if (readyWatchdog?.timeout) {
				clearTimeout(readyWatchdog.timeout);
			}
			readyWatchdog = undefined;
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
			clearReadyWatchdog();
			clearPendingSymbolSwitch();
			overlayControllerRef.current?.clear();
			const widget = widgetRef.current;
			const datafeed = datafeedRef.current;
			widgetRef.current = null;
			datafeedRef.current = null;
			try {
				widget?.remove();
			} catch {
			} finally {
				datafeed?.destroy();
			}
			chartReadyRef.current = false;
			pendingDataResetRef.current = false;
			scheduledDataResetWidgetRef.current = null;
			appliedSymbolRef.current = null;
			appliedIntervalRef.current = null;
			appliedThemeRef.current = null;
			themeSwitchRetryTargetRef.current = null;
			if (themeSwitchInFlightWidgetRef.current === widget) {
				themeSwitchInFlightWidgetRef.current = null;
			}
		};

		const handleFinalFailure = (reason: string) => {
			if (disposed) return;
			setIsInitializing(false);
			setInitError(reason);
		};

		const shouldPauseReadyWatchdog = () =>
			!activeRef.current || document.visibilityState === "hidden" || !navigator.onLine;

		const retryOrFail = (reason: string, automaticRetryCount: number) => {
			removeWidget();
			if (shouldPauseReadyWatchdog()) {
				deferredInitializationFailure = { reason, automaticRetryCount };
				return;
			}
			if (automaticRetryCount < CHART_READY_MAX_AUTO_RETRIES) {
				void initWidget(automaticRetryCount + 1);
				return;
			}
			handleFinalFailure(reason);
		};

		const handleReadyDeadline = (watchdog: NonNullable<typeof readyWatchdog>) => {
			if (
				disposed ||
				readyWatchdog !== watchdog ||
				chartReadyRef.current ||
				widgetRef.current !== watchdog.widget ||
				shouldPauseReadyWatchdog()
			) {
				return;
			}
			retryOrFail("ready-timeout", watchdog.automaticRetryCount);
		};

		const armReadyWatchdog = (watchdog: NonNullable<typeof readyWatchdog>) => {
			if (disposed || readyWatchdog !== watchdog || watchdog.timeout || shouldPauseReadyWatchdog()) return;
			if (watchdog.remainingMs <= 0) {
				handleReadyDeadline(watchdog);
				return;
			}

			watchdog.startedAt = Date.now();
			watchdog.timeout = setTimeout(() => {
				watchdog.timeout = null;
				watchdog.remainingMs = 0;
				handleReadyDeadline(watchdog);
			}, watchdog.remainingMs);
		};

		const pauseReadyWatchdog = () => {
			const watchdog = readyWatchdog;
			if (!watchdog?.timeout) return;
			clearTimeout(watchdog.timeout);
			watchdog.timeout = null;
			watchdog.remainingMs = Math.max(0, watchdog.remainingMs - (Date.now() - watchdog.startedAt));
		};

		const resumeReadyWatchdog = () => {
			if (shouldPauseReadyWatchdog()) return;
			if (deferredInitializationFailure) {
				const { automaticRetryCount } = deferredInitializationFailure;
				deferredInitializationFailure = undefined;
				void initWidget(automaticRetryCount);
				return;
			}
			if (readyWatchdog) armReadyWatchdog(readyWatchdog);
		};
		pauseReadyWatchdogRef.current = pauseReadyWatchdog;
		resumeReadyWatchdogRef.current = resumeReadyWatchdog;

		const handlePageLifecycleChange = () => {
			if (shouldPauseReadyWatchdog()) {
				pauseReadyWatchdog();
				return;
			}
			resumeReadyWatchdog();
		};

		document.addEventListener("visibilitychange", handlePageLifecycleChange);
		window.addEventListener("online", handlePageLifecycleChange);
		window.addEventListener("offline", handlePageLifecycleChange);
		window.addEventListener("pageshow", handlePageLifecycleChange);

		async function initWidget(automaticRetryCount: number): Promise<void> {
			setIsInitializing(true);
			setInitError(null);
			try {
				await loadTradingViewScript();

				if (disposed || !containerRef.current) return;
				const tradingView = window.TradingView;
				if (!tradingView) throw new Error("tradingview-unavailable");

				removeWidget();

				const overrides = buildChartOverrides();
				const loadingColors = getLoadingScreenColors();
				const initialTheme = targetThemeRef.current;
				const customCssUrl = getChartCssUrl(initialTheme);

				const initialSymbol = targetSymbolRef.current;
				const initialInterval = targetIntervalRef.current;
				setInitError(null);

				const datafeed = createDatafeed({
					getPriceScale: getSelectedMarketPriceScale,
					getSymbolInfo: getSelectedMarketSymbolInfo,
					isKnownCoin: isSelectedMarketCoin,
					onRealtimeReset: () => requestDataResetRef.current(),
				});
				datafeedRef.current = datafeed;

				const widget = new tradingView.widget({
					container: containerRef.current,
					library_path: CHART_LIBRARY_PATH,
					datafeed,
					symbol: initialSymbol,
					interval: initialInterval as ResolutionString,
					locale,
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

				const watchdog = {
					widget,
					automaticRetryCount,
					remainingMs: CHART_READY_TIMEOUT_MS,
					startedAt: 0,
					timeout: null,
				};
				readyWatchdog = watchdog;
				armReadyWatchdog(watchdog);

				widget.onChartReady(() => {
					if (disposed || widgetRef.current !== widget) return;
					clearReadyWatchdog();
					chartReadyRef.current = true;
					setIsInitializing(false);
					setInitError(null);
					if (pendingDataResetRef.current) requestDataResetRef.current();
					applyThemeRef.current(targetThemeRef.current);
					applySymbolRef.current();
					syncOverlaysRef.current();
				});
			} catch {
				if (disposed) return;
				retryOrFail("exception", automaticRetryCount);
			}
		}

		void initWidget(0);

		return () => {
			disposed = true;
			pauseReadyWatchdogRef.current = () => {};
			resumeReadyWatchdogRef.current = () => {};
			deferredInitializationFailure = undefined;
			document.removeEventListener("visibilitychange", handlePageLifecycleChange);
			window.removeEventListener("online", handlePageLifecycleChange);
			window.removeEventListener("offline", handlePageLifecycleChange);
			window.removeEventListener("pageshow", handlePageLifecycleChange);
			clearReadyWatchdog();
			removeWidget();
		};
	}, [retryNonce, locale]);

	useEffect(() => {
		targetSymbolRef.current = widgetSymbol;
		targetIntervalRef.current = interval;
		if (!active) {
			pauseReadyWatchdogRef.current();
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
		resumeReadyWatchdogRef.current();
		applyThemeRef.current(targetThemeRef.current);
		applySymbolRef.current();
		syncOverlaysRef.current();
	}, [widgetSymbol, interval, active]);

	useEffect(() => {
		syncOverlaysRef.current();
	});

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
			{isInitializing && !initError && (
				<output
					data-chart-loading
					aria-live="polite"
					className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-background px-4 text-center"
				>
					<span
						aria-hidden="true"
						className="size-5 animate-spin rounded-full border-2 border-stroke-weak border-t-fg motion-reduce:animate-none"
					/>
					<p className="text-xs font-medium text-fg-muted">{t`Loading...`}</p>
				</output>
			)}
			{initError && (
				<div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-surface px-4 text-center">
					<p className="text-sm font-medium text-fg">{t`Something went wrong`}</p>
					<button
						type="button"
						className="rounded-xs border border-stroke-weak px-3 py-1.5 text-xs font-medium text-fg hover:bg-fill-hover"
						onClick={() => {
							setIsInitializing(true);
							setInitError(null);
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
