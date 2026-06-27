import { useEffect, useRef } from "react";
import { CHART_MIN_HEIGHT_PX } from "@/config/chart";
import { loadTradingViewScript } from "@/lib/chart/load-tradingview";
import {
	buildChartOverrides,
	generateChartCssUrl,
	getLoadingScreenColors,
	getToolbarBgColor,
} from "@/lib/chart/theme-colors";
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

interface Props {
	symbol?: string;
	interval?: string;
	theme?: "light" | "dark";
	onSwitchToDefault?: () => void;
}

export function TradingViewChart({
	symbol = DEFAULT_CHART_SYMBOL,
	interval = DEFAULT_CHART_INTERVAL,
	theme = DEFAULT_CHART_THEME,
	onSwitchToDefault,
}: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const widgetRef = useRef<IChartingLibraryWidget | null>(null);
	const cssUrlRef = useRef<string | null>(null);
	const chartReadyRef = useRef(false);
	const targetSymbolRef = useRef(symbol);
	const targetIntervalRef = useRef(interval);
	const appliedSymbolRef = useRef<string | null>(null);
	const appliedIntervalRef = useRef<string | null>(null);
	const onSwitchToDefaultRef = useRef(onSwitchToDefault);
	const applySymbolRef = useRef<() => void>(() => {});
	targetSymbolRef.current = symbol;
	targetIntervalRef.current = interval;
	onSwitchToDefaultRef.current = onSwitchToDefault;
	applySymbolRef.current = () => {
		const widget = widgetRef.current;
		if (!widget || !chartReadyRef.current) return;

		const nextSymbol = targetSymbolRef.current;
		const nextInterval = targetIntervalRef.current;
		if (appliedSymbolRef.current === nextSymbol && appliedIntervalRef.current === nextInterval) return;

		appliedSymbolRef.current = nextSymbol;
		appliedIntervalRef.current = nextInterval;
		widget.setSymbol(nextSymbol, nextInterval as ResolutionString, () => {});
	};

	useEffect(() => {
		if (!containerRef.current) return;
		let disposed = false;
		let readyTimeout: ReturnType<typeof setTimeout> | null = null;
		chartReadyRef.current = false;

		const clearReadyTimeout = () => {
			if (readyTimeout) {
				clearTimeout(readyTimeout);
				readyTimeout = null;
			}
		};

		const removeWidget = () => {
			clearReadyTimeout();
			if (widgetRef.current) {
				widgetRef.current.remove();
				widgetRef.current = null;
			}
			chartReadyRef.current = false;
			appliedSymbolRef.current = null;
			appliedIntervalRef.current = null;
			if (cssUrlRef.current) {
				URL.revokeObjectURL(cssUrlRef.current);
				cssUrlRef.current = null;
			}
		};

		const handleFinalFailure = (reason: string, attempt: number, error?: unknown) => {
			if (disposed) return;
			console.warn("[TradingViewChart] TradingView failed to initialize; switching to default chart.", {
				attempt,
				error,
				maxAttempts: MAX_CHART_INIT_ATTEMPTS,
				reason,
			});
			onSwitchToDefaultRef.current?.();
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

				const widget = new window.TradingView.widget({
					container: containerRef.current,
					library_path: CHART_LIBRARY_PATH,
					datafeed: createDatafeed(),
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

				if (onSwitchToDefaultRef.current) {
					widget.headerReady().then(() => {
						if (disposed || widgetRef.current !== widget) return;

						const btn = widget.createButton({ align: "right", useTradingViewStyle: false });
						btn.style.cssText =
							"display:inline-flex;align-items:center;gap:6px;padding:0 4px;cursor:default;height:100%;";

						const tvLabel = document.createElement("span");
						tvLabel.textContent = "TradingView";
						tvLabel.dataset.htActive = "true";
						tvLabel.style.cssText = "font-size:12px;color:var(--tv-fg,inherit);";

						const sep = document.createElement("span");
						sep.style.cssText =
							"display:inline-block;width:1px;height:12px;background:var(--tv-color-toolbar-divider-background,rgba(128,128,128,0.3));align-self:center;flex-shrink:0;";

						const defaultLabel = document.createElement("span");
						defaultLabel.textContent = "Default";
						defaultLabel.style.cssText =
							"font-size:12px;font-weight:400;color:var(--tv-muted-fg,rgba(128,128,128,0.8));cursor:pointer;";
						defaultLabel.addEventListener("pointerover", () => {
							defaultLabel.style.color = "var(--tv-fg,inherit)";
						});
						defaultLabel.addEventListener("pointerout", () => {
							defaultLabel.style.color = "var(--tv-muted-fg,rgba(128,128,128,0.8))";
						});
						defaultLabel.addEventListener("click", () => {
							onSwitchToDefaultRef.current?.();
						});

						btn.appendChild(defaultLabel);
						btn.appendChild(sep);
						btn.appendChild(tvLabel);
					});
				}
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
	}, [theme]);

	useEffect(() => {
		targetSymbolRef.current = symbol;
		targetIntervalRef.current = interval;
		applySymbolRef.current();
	}, [symbol, interval]);

	return (
		<div className="relative w-full h-full" style={{ minHeight: CHART_MIN_HEIGHT_PX }}>
			<div ref={containerRef} className="w-full h-full" />
		</div>
	);
}
