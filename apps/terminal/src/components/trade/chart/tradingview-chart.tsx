import { t } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";
import { CHART_MIN_HEIGHT_PX } from "@/config/chart";
import { loadTradingViewScript } from "@/lib/chart/load-tradingview";
import { priceScaleFromMid } from "@/lib/chart/symbol";
import {
	buildChartOverrides,
	generateChartCssUrl,
	getLoadingScreenColors,
	getToolbarBgColor,
} from "@/lib/chart/theme-colors";
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
	TIMEZONE,
} from "./constants";
import { createDatafeed } from "./datafeed";

const CHART_READY_TIMEOUT_MS = 12_000;
const MAX_CHART_INIT_ATTEMPTS = 2;
const SYMBOL_SWITCH_TIMEOUT_MS = 8_000;
const MAX_SYMBOL_SWITCH_RETRIES = 1;

function priceScaleFromSzDecimals(szDecimals: number): number {
	const decimals = Math.min(Math.max(6 - szDecimals, 2), 8);
	return 10 ** decimals;
}

function symbolSwitchKey(symbol: string, interval: string): string {
	return `${symbol}\u0000${interval}`;
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
	const containerRef = useRef<HTMLDivElement>(null);
	const widgetRef = useRef<IChartingLibraryWidget | null>(null);
	const cssUrlRef = useRef<string | null>(null);
	const chartReadyRef = useRef(false);
	const targetSymbolRef = useRef(symbol);
	const targetIntervalRef = useRef(interval);
	const marketRef = useRef(market);
	const appliedSymbolRef = useRef<string | null>(null);
	const appliedIntervalRef = useRef<string | null>(null);
	const pendingSymbolRef = useRef<string | null>(null);
	const pendingIntervalRef = useRef<string | null>(null);
	const symbolSwitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const symbolSwitchRetryRef = useRef<{ key: string; count: number }>({ key: "", count: 0 });
	const applySymbolRef = useRef<() => void>(() => {});
	const [isSwitchingSymbol, setIsSwitchingSymbol] = useState(false);
	const [initError, setInitError] = useState<string | null>(null);
	const [retryNonce, setRetryNonce] = useState(0);
	targetSymbolRef.current = symbol;
	targetIntervalRef.current = interval;
	marketRef.current = market;

	const clearSymbolSwitchTimeout = () => {
		if (symbolSwitchTimeoutRef.current) {
			clearTimeout(symbolSwitchTimeoutRef.current);
			symbolSwitchTimeoutRef.current = null;
		}
	};

	const clearPendingSymbolSwitch = () => {
		clearSymbolSwitchTimeout();
		pendingSymbolRef.current = null;
		pendingIntervalRef.current = null;
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

		const key = symbolSwitchKey(nextSymbol, nextInterval);
		clearPendingSymbolSwitch();
		pendingSymbolRef.current = nextSymbol;
		pendingIntervalRef.current = nextInterval;
		setInitError(null);
		setIsSwitchingSymbol(true);

		symbolSwitchTimeoutRef.current = setTimeout(() => {
			if (
				widgetRef.current !== widget ||
				pendingSymbolRef.current !== nextSymbol ||
				pendingIntervalRef.current !== nextInterval
			) {
				return;
			}

			console.warn("[TradingViewChart] TradingView symbol switch timed out.", {
				symbol: nextSymbol,
				interval: nextInterval,
			});

			if (symbolSwitchRetryRef.current.key !== key) {
				symbolSwitchRetryRef.current = { key, count: 0 };
			}

			if (symbolSwitchRetryRef.current.count < MAX_SYMBOL_SWITCH_RETRIES) {
				symbolSwitchRetryRef.current = { key, count: symbolSwitchRetryRef.current.count + 1 };
				clearPendingSymbolSwitch();
				applySymbolRef.current();
				return;
			}

			clearPendingSymbolSwitch();
			setIsSwitchingSymbol(false);
			setInitError("symbol-timeout");
		}, SYMBOL_SWITCH_TIMEOUT_MS);

		try {
			widget.setSymbol(nextSymbol, nextInterval as ResolutionString, () => {
				if (
					widgetRef.current === widget &&
					targetSymbolRef.current === nextSymbol &&
					targetIntervalRef.current === nextInterval
				) {
					appliedSymbolRef.current = nextSymbol;
					appliedIntervalRef.current = nextInterval;
					clearPendingSymbolSwitch();
					symbolSwitchRetryRef.current = { key, count: 0 };
					setIsSwitchingSymbol(false);
				}
			});
		} catch (error) {
			console.warn("[TradingViewChart] TradingView symbol switch failed.", {
				error,
				symbol: nextSymbol,
				interval: nextInterval,
			});
			clearPendingSymbolSwitch();
			setIsSwitchingSymbol(false);
			setInitError("symbol-exception");
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: switch cleanup only reads refs; adding the helper would recreate the widget on every render.
	useEffect(() => {
		void retryNonce;
		if (!containerRef.current) return;
		let disposed = false;
		let readyTimeout: ReturnType<typeof setTimeout> | null = null;
		chartReadyRef.current = false;

		function isSelectedMarketCoin(coin: string): boolean | undefined {
			const currentMarket = marketRef.current;
			return currentMarket?.name === coin ? true : undefined;
		}

		function getSelectedMarketPriceScale(coin: string): number | undefined {
			const currentMarket = marketRef.current;
			if (currentMarket?.name !== coin) return undefined;
			if (currentMarket.markPx) return priceScaleFromMid(currentMarket.markPx);

			return priceScaleFromSzDecimals(currentMarket.szDecimals);
		}

		const clearReadyTimeout = () => {
			if (readyTimeout) {
				clearTimeout(readyTimeout);
				readyTimeout = null;
			}
		};

		const removeWidget = () => {
			clearReadyTimeout();
			clearPendingSymbolSwitch();
			if (widgetRef.current) {
				widgetRef.current.remove();
				widgetRef.current = null;
			}
			chartReadyRef.current = false;
			appliedSymbolRef.current = null;
			appliedIntervalRef.current = null;
			symbolSwitchRetryRef.current = { key: "", count: 0 };
			if (cssUrlRef.current) {
				URL.revokeObjectURL(cssUrlRef.current);
				cssUrlRef.current = null;
			}
		};

		const handleFinalFailure = (reason: string, attempt: number, error?: unknown) => {
			if (disposed) return;
			console.warn("[TradingViewChart] TradingView failed to initialize.", {
				attempt,
				error,
				maxAttempts: MAX_CHART_INIT_ATTEMPTS,
				reason,
			});
			setInitError(reason);
		};

		const scheduleReadyTimeout = (widget: IChartingLibraryWidget, attempt: number) => {
			clearReadyTimeout();
			readyTimeout = setTimeout(() => {
				if (disposed || chartReadyRef.current || widgetRef.current !== widget) return;
				removeWidget();
				if (attempt < MAX_CHART_INIT_ATTEMPTS) {
					void initWidget(attempt + 1);
					return;
				}
				handleFinalFailure("ready-timeout", attempt);
			}, CHART_READY_TIMEOUT_MS);
		};

		const initWidget = async (attempt = 1) => {
			try {
				await loadTradingViewScript();

				if (disposed || !containerRef.current || !window.TradingView) return;

				removeWidget();

				const overrides = buildChartOverrides();
				const loadingColors = getLoadingScreenColors();
				const toolbarBg = getToolbarBgColor();
				const customCssUrl = await generateChartCssUrl();
				if (disposed || !containerRef.current || !window.TradingView) {
					URL.revokeObjectURL(customCssUrl);
					return;
				}
				cssUrlRef.current = customCssUrl;

				const initialSymbol = targetSymbolRef.current;
				const initialInterval = targetIntervalRef.current;
				setInitError(null);
				setIsSwitchingSymbol(false);

				const widget = new window.TradingView.widget({
					container: containerRef.current,
					library_path: CHART_LIBRARY_PATH,
					datafeed: createDatafeed({
						getPriceScale: getSelectedMarketPriceScale,
						isKnownCoin: isSelectedMarketCoin,
					}),
					symbol: initialSymbol,
					interval: initialInterval as ResolutionString,
					locale: CHART_LOCALE,
					fullscreen: CHART_WIDGET_DEFAULTS.FULLSCREEN,
					autosize: CHART_WIDGET_DEFAULTS.AUTOSIZE,
					theme: theme,
					timezone: TIMEZONE,
					debug: CHART_WIDGET_DEFAULTS.DEBUG,
					custom_font_family: CHART_CUSTOM_FONT_FAMILY,
					time_frames: CHART_TIME_FRAMES,
					enabled_features: CHART_ENABLED_FEATURES,
					disabled_features: CHART_DISABLED_FEATURES,
					overrides: overrides,
					loading_screen: loadingColors,
					toolbar_bg: toolbarBg,
					custom_css_url: customCssUrl,
					studies_overrides: {},
					favorites: {
						intervals: CHART_FAVORITE_INTERVALS,
					},
				});
				widgetRef.current = widget;
				appliedSymbolRef.current = initialSymbol;
				appliedIntervalRef.current = initialInterval;
				scheduleReadyTimeout(widget, attempt);

				widget.onChartReady(() => {
					if (disposed || widgetRef.current !== widget) return;
					clearReadyTimeout();
					chartReadyRef.current = true;
					applySymbolRef.current();
				});
			} catch (error) {
				if (disposed) return;
				removeWidget();
				if (attempt < MAX_CHART_INIT_ATTEMPTS) {
					void initWidget(attempt + 1);
					return;
				}
				handleFinalFailure("exception", attempt, error);
			}
		};

		initWidget();

		return () => {
			disposed = true;
			clearReadyTimeout();
			removeWidget();
		};
	}, [theme, retryNonce]);

	useEffect(() => {
		targetSymbolRef.current = symbol;
		targetIntervalRef.current = interval;
		applySymbolRef.current();
	}, [symbol, interval]);

	return (
		<div
			className={cn("relative w-full h-full", yAxisInside && "[--tv-y-axis-inside:1]")}
			style={{ minHeight: CHART_MIN_HEIGHT_PX }}
		>
			<div ref={containerRef} className="w-full h-full" />
			{isSwitchingSymbol && !initError && (
				<div className="pointer-events-none absolute right-2 top-2 z-10">
					<span className="rounded-xs border border-stroke-weak bg-background/90 px-2 py-1 text-xs font-medium text-fg shadow-sm">
						{t`Loading...`}
					</span>
				</div>
			)}
			{initError && (
				<div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-surface px-4 text-center">
					<p className="text-sm font-medium text-fg">{t`Something went wrong`}</p>
					<button
						type="button"
						className="rounded-xs border border-stroke-weak px-3 py-1.5 text-xs font-medium text-fg hover:bg-fill-hover"
						onClick={() => {
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
