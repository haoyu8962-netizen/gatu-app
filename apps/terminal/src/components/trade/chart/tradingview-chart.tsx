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

function getChartDisplaySymbol(market: UnifiedMarketInfo): string {
	if (market.kind === "spot") return market.pairName;
	if (market.kind === "builderPerp") {
		const quoteToken = market.quoteToken?.displayName ?? market.quoteToken?.name ?? QUOTE_ASSET;
		return `${market.name}/${quoteToken}`;
	}
	return `${market.name}/${QUOTE_ASSET}`;
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
	const widgetSymbol = market ? getChartDisplaySymbol(market) : symbol;
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
	const symbolSwitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const symbolSwitchRetryRef = useRef<{ key: string; count: number }>({ key: "", count: 0 });
	const themeSwitchSequenceRef = useRef(0);
	const applySymbolRef = useRef<() => void>(() => {});
	const applyThemeRef = useRef<(nextTheme: "light" | "dark") => void>(() => {});
	const [initError, setInitError] = useState<string | null>(null);
	const [retryNonce, setRetryNonce] = useState(0);
	targetSymbolRef.current = widgetSymbol;
	targetIntervalRef.current = interval;
	targetThemeRef.current = theme;
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

	const finishSymbolSwitch = () => {
		clearPendingSymbolSwitch();
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

			finishSymbolSwitch();
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
					symbolSwitchRetryRef.current = { key, count: 0 };
					finishSymbolSwitch();
				}
			});
		} catch (error) {
			console.warn("[TradingViewChart] TradingView symbol switch failed.", {
				error,
				symbol: nextSymbol,
				interval: nextInterval,
			});
			finishSymbolSwitch();
			setInitError("symbol-exception");
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
			.catch((error) => {
				if (widgetRef.current !== widget || themeSwitchSequenceRef.current !== sequence) return;
				console.warn("[TradingViewChart] TradingView theme switch failed.", {
					error,
					theme: nextTheme,
				});
			});
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

		function getSelectedMarketSymbolInfo(symbolName: string, coin: string) {
			const currentMarket = marketRef.current;
			if (!currentMarket) return undefined;
			const name = getChartDisplaySymbol(currentMarket);
			if (symbolName !== name && coin !== currentMarket.name) return undefined;
			return {
				name,
				ticker: currentMarket.name,
				description: currentMarket.pairName ?? name,
				pricescale: getSelectedMarketPriceScale(coin),
			};
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
			appliedThemeRef.current = null;
			symbolSwitchRetryRef.current = { key: "", count: 0 };
			themeSwitchSequenceRef.current += 1;
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
				const initialTheme = targetThemeRef.current;
				const customCssUrl = getChartCssUrl(initialTheme);

				const initialSymbol = targetSymbolRef.current;
				const initialInterval = targetIntervalRef.current;
				setInitError(null);

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
				scheduleReadyTimeout(widget, attempt);

				widget.onChartReady(() => {
					if (disposed || widgetRef.current !== widget) return;
					clearReadyTimeout();
					chartReadyRef.current = true;
					applyThemeRef.current(targetThemeRef.current);
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
