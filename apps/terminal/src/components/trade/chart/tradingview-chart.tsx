import { useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GatuOrbitLoader } from "@/components/brand/gatu-orbit-loader";
import { CHART_MIN_HEIGHT_PX } from "@/config/chart";
import { getCandleGateRetryAt, subscribeCandleGate } from "@/lib/chart/candle-gate";
import { createHistoryRecoveryController } from "@/lib/chart/history-recovery";
import { loadTradingViewScript } from "@/lib/chart/load-tradingview";
import {
	getChartApiSymbol,
	getChartMarketKeys,
	getChartMarketLookupKey,
	getChartPriceScale,
	getChartSymbolInfo,
	isChartMarketSymbol,
} from "@/lib/chart/market-symbol";
import { coinFromSymbolName } from "@/lib/chart/symbol";
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
import type {
	DrawingEventType,
	EntityId,
	IChartingLibraryWidget,
	LanguageCode,
	ResolutionString,
} from "@/types/charting_library";
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
import { type ChartDatafeed, createDatafeed, type HistoryRequestIdentity } from "./datafeed";
import { useTradingViewOverlayLines } from "./use-tradingview-overlay-lines";

const CHART_READY_TIMEOUT_MS = 15_000;
const CHART_READY_MAX_AUTO_RETRIES = 1;
const SYMBOL_SWITCH_RETRY_TIMEOUT_MS = 8_000;
const SYMBOL_SWITCH_MAX_RETRIES = 1;
const THEME_SWITCH_TIMEOUT_MS = 5_000;
const LOCALE_STATE_SAVE_TIMEOUT_MS = 2_000;

interface HistoryRateLimitState extends HistoryRequestIdentity {
	phase: "recovering" | "waiting";
	retryAt: number;
}

function cloneChartState(state: object): object | null {
	try {
		return structuredClone(state);
	} catch {
		try {
			return JSON.parse(JSON.stringify(state)) as object;
		} catch {
			return null;
		}
	}
}

function getTradingViewOverlayPalette(): TradingViewOverlayPalette {
	const colors = getChartColors();
	return {
		buy: {
			line: colorToRgba(colors.green, 0.45),
			text: colorToHex(colors.green),
		},
		sell: {
			line: colorToRgba(colors.red, 0.45),
			text: colorToHex(colors.red),
		},
		liquidation: {
			line: colorToRgba(colors.red, 0.55),
			text: colorToHex(colors.red),
		},
		neutral: {
			text: colorToHex(colors.textSecondary),
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
	const { t } = useLingui();
	const widgetSymbol = market ? getChartApiSymbol(market) : symbol;
	const overlayLines = useTradingViewOverlayLines(market, symbol);
	const containerRef = useRef<HTMLDivElement>(null);
	const widgetRef = useRef<IChartingLibraryWidget | null>(null);
	const widgetEpochRef = useRef(0);
	const datafeedRef = useRef<ChartDatafeed | null>(null);
	const chartReadyRef = useRef(false);
	const hasCompletedInitialWidgetLoadRef = useRef(false);
	const pendingDataResetRef = useRef(false);
	const pendingRealtimeResetRef = useRef(false);
	const failedHistoryStreamKeyRef = useRef<string | null>(null);
	const hasLoadedHistoryRef = useRef(false);
	const historyRecoveryExhaustedRef = useRef(false);
	const historyTargetKeyRef = useRef(`${widgetSymbol}\u0000${interval}`);
	const historyTargetGenerationRef = useRef(0);
	const latestHistoryRequestRef = useRef<HistoryRequestIdentity | null>(null);
	const wsReconnectGenerationRef = useRef(0);
	const scheduledDataResetWidgetRef = useRef<IChartingLibraryWidget | null>(null);
	const targetSymbolRef = useRef(symbol);
	const targetIntervalRef = useRef(interval);
	const intervalPropRef = useRef(interval);
	const intervalSequenceRef = useRef(0);
	const targetThemeRef = useRef(theme);
	const targetLocaleRef = useRef(locale);
	const committedLocaleRef = useRef(locale);
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
	const pauseThemeWatchdogRef = useRef<() => void>(() => {});
	const resumeThemeWatchdogRef = useRef<() => void>(() => {});
	const pauseStateSaveWatchdogRef = useRef<() => void>(() => {});
	const resumeStateSaveWatchdogRef = useRef<() => void>(() => {});
	const themeSwitchInFlightWidgetRef = useRef<IChartingLibraryWidget | null>(null);
	const themeSwitchRetryTargetRef = useRef<"light" | "dark" | null>(null);
	const themeSwitchSequenceRef = useRef(0);
	const themeSwitchWatchdogRef = useRef<{
		widget: IChartingLibraryWidget;
		widgetEpoch: number;
		sequence: number;
		remainingMs: number;
		startedAt: number;
		timeout: ReturnType<typeof setTimeout> | null;
	} | null>(null);
	const themeRecoveryWidgetRef = useRef<IChartingLibraryWidget | null>(null);
	const appliedLocaleRef = useRef<LanguageCode | null>(null);
	const stateSaveSequenceRef = useRef(0);
	const stateSaveRef = useRef<{
		widget: IChartingLibraryWidget;
		widgetEpoch: number;
		sequence: number;
		sourceSymbol: string | undefined;
		targetInterval: string;
		intervalSequence: number;
		historyRebuild: boolean;
		historyTargetGeneration: number | null;
		localeRebuild: boolean;
		overlayRebuild: boolean;
		themeRebuild: boolean;
		remainingMs: number;
		startedAt: number;
		timeout: ReturnType<typeof setTimeout> | null;
	} | null>(null);
	const pendingChartStateRef = useRef<object | null>(null);
	const pendingChartStateSymbolRef = useRef<string | null>(null);
	const pendingChartIntervalRef = useRef<string | null>(null);
	const marketBySymbolRef = useRef(new Map<string, UnifiedMarketInfo>());
	const overlayLinesRef = useRef(overlayLines);
	const overlayControllerRef = useRef<TradingViewOverlayController | null>(null);
	const overlayRetryRef = useRef<{
		at: number;
		widgetEpoch: number;
		timeout: ReturnType<typeof setTimeout>;
	} | null>(null);
	const overlayDisabledWidgetRef = useRef<IChartingLibraryWidget | null>(null);
	const overlayDisabledSymbolRef = useRef<string | null>(null);
	const overlayRecoveryConsumedRef = useRef(false);
	const overlayRecoverySymbolRef = useRef<string | null>(null);
	const overlayRecoveryWidgetRef = useRef<IChartingLibraryWidget | null>(null);
	const overlayDisableNextWidgetRef = useRef(false);
	const applySymbolRef = useRef<() => void>(() => {});
	const applyThemeRef = useRef<(nextTheme: "light" | "dark") => void>(() => {});
	const requestLocaleSwitchRef = useRef<() => void>(() => {});
	const requestDataResetRef = useRef<() => void>(() => {});
	const requestRealtimeResetRef = useRef<() => void>(() => {});
	const flushPendingRealtimeResetRef = useRef<() => void>(() => {});
	const flushHistoryRecoveryRef = useRef<() => void>(() => {});
	const reportDataResetFailureRef = useRef<() => void>(() => {});
	const resetHistoryRecoveryRef = useRef<() => void>(() => {});
	const retryHistoryWidgetRef = useRef<() => void>(() => {});
	const syncOverlaysRef = useRef<() => void>(() => {});
	const [initError, setInitError] = useState<string | null>(null);
	const [isInitializing, setIsInitializing] = useState(true);
	const [retryNonce, setRetryNonce] = useState(0);
	const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
	const [historyRateLimit, setHistoryRateLimit] = useState<HistoryRateLimitState | null>(null);
	const historyRateLimitRef = useRef<HistoryRateLimitState | null>(null);
	if (!overlayControllerRef.current) overlayControllerRef.current = new TradingViewOverlayController();

	useLayoutEffect(() => {
		targetThemeRef.current = theme;
		activeRef.current = active;
		overlayLinesRef.current = overlayLines;
	}, [theme, active, overlayLines]);

	function classifyHistoryRequest(
		historyStreamKey?: string,
		identity?: HistoryRequestIdentity,
	): "current" | "superseded" | "stale" {
		if (!identity) return "current";
		if (identity.targetGeneration !== historyTargetGenerationRef.current) return "stale";
		if (historyStreamKey && identity.streamKey !== historyStreamKey) return "stale";

		const latest = latestHistoryRequestRef.current;
		if (latest) {
			if (identity.streamGeneration < latest.streamGeneration) return "stale";
			if (identity.streamGeneration === latest.streamGeneration) {
				if (identity.streamKey !== latest.streamKey) return "stale";
				if (identity.requestId < latest.requestId) return "superseded";
			}
			if (identity.streamGeneration > latest.streamGeneration) {
				failedHistoryStreamKeyRef.current = null;
				hasLoadedHistoryRef.current = false;
				historyRateLimitRef.current = null;
				setHistoryRateLimit(null);
				resetHistoryRecoveryRef.current();
				resumeReadyWatchdogRef.current();
			}
		}

		latestHistoryRequestRef.current = identity;
		return "current";
	}

	const activateHistoryTarget = useCallback((nextSymbol: string, nextInterval: string) => {
		const nextTargetKey = `${nextSymbol}\u0000${nextInterval}`;
		if (historyTargetKeyRef.current === nextTargetKey) return;
		historyTargetKeyRef.current = nextTargetKey;
		historyTargetGenerationRef.current += 1;
		latestHistoryRequestRef.current = null;
		failedHistoryStreamKeyRef.current = null;
		hasLoadedHistoryRef.current = false;
		historyRateLimitRef.current = null;
		setHistoryRateLimit(null);
		resetHistoryRecoveryRef.current();
		datafeedRef.current?.invalidateHistoryRequests?.();
		resumeReadyWatchdogRef.current();
	}, []);

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

	const resetOverlayRecoveryForVerifiedSymbol = (widget: IChartingLibraryWidget, nextSymbol: string) => {
		const recoverySymbol = overlayRecoverySymbolRef.current;
		const disabledSymbol = overlayDisabledWidgetRef.current === widget ? overlayDisabledSymbolRef.current : null;
		if (
			(recoverySymbol === null || recoverySymbol === nextSymbol) &&
			(disabledSymbol === null || disabledSymbol === nextSymbol)
		) {
			return;
		}
		overlayRecoveryConsumedRef.current = false;
		overlayRecoverySymbolRef.current = null;
		overlayDisableNextWidgetRef.current = false;
		if (overlayDisabledWidgetRef.current === widget) {
			overlayDisabledWidgetRef.current = null;
			overlayDisabledSymbolRef.current = null;
		}
	};

	const completeSymbolSwitch = (nextSymbol: string, nextInterval: string) => {
		appliedSymbolRef.current = nextSymbol;
		appliedIntervalRef.current = nextInterval;
		finishSymbolSwitch();
		const widget = widgetRef.current;
		if (widget) resetOverlayRecoveryForVerifiedSymbol(widget, nextSymbol);
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

	const clearOverlayRetry = () => {
		const retry = overlayRetryRef.current;
		if (!retry) return;
		clearTimeout(retry.timeout);
		overlayRetryRef.current = null;
	};

	const beginWidgetRebuild = () => {
		widgetEpochRef.current += 1;
		chartReadyRef.current = false;
		clearOverlayRetry();
		setIsInitializing(true);
		setInitError(null);
		setRetryNonce((value) => value + 1);
	};

	const disableOverlaysForWidget = (widget: IChartingLibraryWidget) => {
		if (widgetRef.current !== widget) return;
		clearOverlayRetry();
		overlayDisabledWidgetRef.current = widget;
		overlayDisabledSymbolRef.current = appliedSymbolRef.current ?? targetSymbolRef.current;
		overlayRecoverySymbolRef.current ??= overlayDisabledSymbolRef.current;
		overlayControllerRef.current?.dispose();
	};

	const handleFatalOverlaySync = (widget: IChartingLibraryWidget, cleanupAlreadyFailed = false): boolean => {
		if (widgetRef.current !== widget || !chartReadyRef.current) return false;
		if (overlayDisabledWidgetRef.current === widget) return true;
		if (overlayRecoveryWidgetRef.current === widget) return false;
		clearOverlayRetry();
		if (overlayRecoveryConsumedRef.current) {
			const overlayController = overlayControllerRef.current;
			const cleared = !cleanupAlreadyFailed && (!overlayController || overlayController.clear());
			if (cleared) {
				disableOverlaysForWidget(widget);
				return true;
			}
			overlayDisableNextWidgetRef.current = true;
			overlayRecoveryWidgetRef.current = widget;
			requestStatePreservingRebuild(widget, "overlay");
			return false;
		}

		overlayRecoveryConsumedRef.current = true;
		overlayRecoverySymbolRef.current = appliedSymbolRef.current ?? targetSymbolRef.current;
		overlayRecoveryWidgetRef.current = widget;
		requestStatePreservingRebuild(widget, "overlay");
		return false;
	};

	const scheduleOverlayRetry = (widget: IChartingLibraryWidget, attemptAtMs: number) => {
		const widgetEpoch = widgetEpochRef.current;
		const pending = overlayRetryRef.current;
		if (pending && pending.widgetEpoch === widgetEpoch && pending.at <= attemptAtMs) return;
		clearOverlayRetry();
		const timeout = setTimeout(
			() => {
				if (overlayRetryRef.current?.timeout === timeout) overlayRetryRef.current = null;
				if (widgetEpochRef.current === widgetEpoch && widgetRef.current === widget) syncOverlaysRef.current();
			},
			Math.max(0, attemptAtMs - Date.now()),
		);
		overlayRetryRef.current = { at: attemptAtMs, widgetEpoch, timeout };
	};

	syncOverlaysRef.current = () => {
		const widget = widgetRef.current;
		if (!widget || !chartReadyRef.current || !activeRef.current || pendingSymbolRef.current) return;
		if (
			overlayDisabledWidgetRef.current === widget ||
			overlayRecoveryWidgetRef.current === widget ||
			themeSwitchInFlightWidgetRef.current === widget
		) {
			return;
		}
		const nextSymbol = targetSymbolRef.current;
		if (!isChartSymbolApplied(getActiveChartSymbol(widget), nextSymbol)) return;

		try {
			const overlayController = overlayControllerRef.current;
			if (!overlayController) return;
			const retryAt = overlayController.sync(
				widget.activeChart(),
				nextSymbol,
				overlayLinesRef.current,
				getTradingViewOverlayPalette(),
			);
			if (retryAt === false) {
				handleFatalOverlaySync(widget);
				return;
			}
			if (retryAt !== null) scheduleOverlayRetry(widget, retryAt);
			else {
				clearOverlayRetry();
			}
		} catch {
			handleFatalOverlaySync(widget);
		}
	};

	applySymbolRef.current = () => {
		const widget = widgetRef.current;
		if (!widget || !chartReadyRef.current) return;
		const widgetEpoch = widgetEpochRef.current;
		if (!activeRef.current) return;
		if (overlayRecoveryWidgetRef.current === widget) return;
		if (
			themeSwitchInFlightWidgetRef.current === widget ||
			(appliedThemeRef.current !== null && appliedThemeRef.current !== targetThemeRef.current)
		) {
			return;
		}

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
		const overlayController = overlayControllerRef.current;
		if (overlayDisabledWidgetRef.current !== widget && overlayController && !overlayController.clear()) {
			if (!handleFatalOverlaySync(widget, true)) return;
		}
		pendingSymbolRef.current = nextSymbol;
		pendingIntervalRef.current = nextInterval;
		setInitError(null);

		const handleSymbolSwitchComplete = (actualSymbol = getActiveChartSymbol(widget)) => {
			if (
				widgetEpochRef.current === widgetEpoch &&
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
					widgetEpochRef.current !== widgetEpoch ||
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
				if (widgetEpochRef.current === widgetEpoch) setInitError("symbol-switch");
			}
		};

		tryApplySymbol();
	};

	const clearThemeSwitchWatchdog = (widget?: IChartingLibraryWidget, sequence?: number) => {
		const watchdog = themeSwitchWatchdogRef.current;
		if (!watchdog) return;
		if (widget && watchdog.widget !== widget) return;
		if (sequence !== undefined && watchdog.sequence !== sequence) return;
		if (watchdog.timeout) clearTimeout(watchdog.timeout);
		themeSwitchWatchdogRef.current = null;
	};

	const shouldPauseThemeWatchdog = () => document.visibilityState === "hidden" || !navigator.onLine;

	const armThemeSwitchWatchdog = () => {
		const watchdog = themeSwitchWatchdogRef.current;
		if (!watchdog || watchdog.timeout || shouldPauseThemeWatchdog()) return;
		if (watchdog.widgetEpoch !== widgetEpochRef.current) {
			clearThemeSwitchWatchdog(watchdog.widget, watchdog.sequence);
			return;
		}
		if (watchdog.remainingMs <= 0) {
			rebuildThemeWidget(watchdog.widget, watchdog.sequence, watchdog.widgetEpoch);
			return;
		}
		watchdog.startedAt = Date.now();
		watchdog.timeout = setTimeout(() => {
			watchdog.timeout = null;
			watchdog.remainingMs = 0;
			rebuildThemeWidget(watchdog.widget, watchdog.sequence, watchdog.widgetEpoch);
		}, watchdog.remainingMs);
	};

	const pauseThemeSwitchWatchdog = () => {
		const watchdog = themeSwitchWatchdogRef.current;
		if (!watchdog?.timeout) return;
		clearTimeout(watchdog.timeout);
		watchdog.timeout = null;
		watchdog.remainingMs = Math.max(0, watchdog.remainingMs - (Date.now() - watchdog.startedAt));
	};

	const rebuildThemeWidget = (
		widget: IChartingLibraryWidget,
		sequence?: number,
		widgetEpoch = widgetEpochRef.current,
	) => {
		if (widgetEpochRef.current !== widgetEpoch) return;
		if (widgetRef.current !== widget || themeRecoveryWidgetRef.current === widget) return;
		if (sequence !== undefined && themeSwitchSequenceRef.current !== sequence) return;
		themeRecoveryWidgetRef.current = widget;
		themeSwitchSequenceRef.current += 1;
		clearThemeSwitchWatchdog(widget);
		requestStatePreservingRebuild(widget, "theme");
	};

	const retryOrRebuildTheme = (widget: IChartingLibraryWidget, nextTheme: "light" | "dark") => {
		if (widgetRef.current !== widget || themeRecoveryWidgetRef.current === widget) return;
		const targetTheme = targetThemeRef.current;
		if (targetTheme !== nextTheme) {
			themeSwitchRetryTargetRef.current = null;
			applyThemeRef.current(targetTheme);
			return;
		}
		if (themeSwitchRetryTargetRef.current === nextTheme) {
			rebuildThemeWidget(widget);
			return;
		}
		themeSwitchRetryTargetRef.current = nextTheme;
		applyThemeRef.current(nextTheme);
	};

	applyThemeRef.current = (nextTheme) => {
		const widget = widgetRef.current;
		if (!widget || !chartReadyRef.current) return;
		const widgetEpoch = widgetEpochRef.current;
		if (themeRecoveryWidgetRef.current === widget) return;
		if (themeSwitchInFlightWidgetRef.current === widget) return;

		let currentTheme: "light" | "dark";
		try {
			currentTheme = widget.getTheme();
		} catch {
			retryOrRebuildTheme(widget, nextTheme);
			return;
		}

		if (currentTheme === nextTheme) {
			try {
				if (appliedThemeRef.current !== nextTheme) {
					widget.applyOverrides(buildChartOverrides());
				}
			} catch {
				retryOrRebuildTheme(widget, nextTheme);
				return;
			}
			themeSwitchRetryTargetRef.current = null;
			appliedThemeRef.current = nextTheme;
			applySymbolRef.current();
			syncOverlaysRef.current();
			return;
		}

		const sequence = themeSwitchSequenceRef.current + 1;
		themeSwitchSequenceRef.current = sequence;
		themeSwitchInFlightWidgetRef.current = widget;
		themeSwitchWatchdogRef.current = {
			widget,
			widgetEpoch,
			sequence,
			remainingMs: THEME_SWITCH_TIMEOUT_MS,
			startedAt: 0,
			timeout: null,
		};
		armThemeSwitchWatchdog();
		let themeSwitchFailed = false;
		let themeSwitch: Promise<void>;
		try {
			themeSwitch = widget.changeTheme(nextTheme, { disableUndo: true });
		} catch {
			clearThemeSwitchWatchdog(widget, sequence);
			if (themeSwitchInFlightWidgetRef.current === widget) {
				themeSwitchInFlightWidgetRef.current = null;
			}
			retryOrRebuildTheme(widget, nextTheme);
			return;
		}

		void themeSwitch
			.then(() => {
				if (widgetEpochRef.current !== widgetEpoch) return;
				if (widgetRef.current !== widget) return;
				if (themeSwitchSequenceRef.current !== sequence) return;
				if (themeRecoveryWidgetRef.current === widget) return;
				if (targetThemeRef.current !== nextTheme) return;
				widget.applyOverrides(buildChartOverrides());
				appliedThemeRef.current = nextTheme;
				themeSwitchRetryTargetRef.current = null;
			})
			.catch(() => {
				themeSwitchFailed = true;
			})
			.finally(() => {
				if (widgetEpochRef.current !== widgetEpoch) return;
				if (themeSwitchInFlightWidgetRef.current === widget) {
					themeSwitchInFlightWidgetRef.current = null;
				}
				clearThemeSwitchWatchdog(widget, sequence);
				if (themeSwitchSequenceRef.current !== sequence) return;
				if (widgetRef.current !== widget) return;
				if (themeRecoveryWidgetRef.current === widget) return;
				const targetTheme = targetThemeRef.current;
				if (targetTheme !== nextTheme) {
					themeSwitchRetryTargetRef.current = null;
					applyThemeRef.current(targetTheme);
					return;
				}
				if (!themeSwitchFailed) {
					applySymbolRef.current();
					syncOverlaysRef.current();
					return;
				}
				retryOrRebuildTheme(widget, nextTheme);
			});
	};

	const clearStateSave = (widget?: IChartingLibraryWidget, sequence?: number) => {
		const request = stateSaveRef.current;
		if (!request) return;
		if (widget && request.widget !== widget) return;
		if (sequence !== undefined && request.sequence !== sequence) return;
		if (request.timeout) clearTimeout(request.timeout);
		stateSaveRef.current = null;
	};

	const captureCurrentInterval = (widget: IChartingLibraryWidget) => {
		try {
			const resolution = widget.activeChart().resolution();
			return resolution || targetIntervalRef.current;
		} catch {}
		return targetIntervalRef.current;
	};

	const shouldPauseStateSaveWatchdog = () => document.visibilityState === "hidden" || !navigator.onLine;

	function finishStatePreservingRebuild(widget: IChartingLibraryWidget, sequence: number, state?: object) {
		const request = stateSaveRef.current;
		if (!request || request.widget !== widget || request.sequence !== sequence) return;
		if (request.widgetEpoch !== widgetEpochRef.current) {
			clearStateSave(widget, sequence);
			return;
		}
		const shouldRebuild =
			(request.historyRebuild && request.historyTargetGeneration === historyTargetGenerationRef.current) ||
			request.overlayRebuild ||
			request.themeRebuild ||
			(request.localeRebuild && targetLocaleRef.current !== appliedLocaleRef.current);
		const sourceMatchesTarget =
			request.sourceSymbol !== undefined && isChartSymbolApplied(request.sourceSymbol, targetSymbolRef.current);
		clearStateSave(widget, sequence);
		if (widgetRef.current !== widget || !shouldRebuild) {
			if (themeRecoveryWidgetRef.current === widget) themeRecoveryWidgetRef.current = null;
			if (overlayRecoveryWidgetRef.current === widget) overlayRecoveryWidgetRef.current = null;
			return;
		}
		const intervalChangedDuringSave =
			request.intervalSequence !== intervalSequenceRef.current || request.targetInterval !== targetIntervalRef.current;
		const currentInterval = intervalChangedDuringSave ? targetIntervalRef.current : captureCurrentInterval(widget);
		pendingChartStateRef.current = state && sourceMatchesTarget ? cloneChartState(state) : null;
		pendingChartStateSymbolRef.current = pendingChartStateRef.current ? (request.sourceSymbol ?? null) : null;
		pendingChartIntervalRef.current = currentInterval;
		if (request.historyRebuild && request.historyTargetGeneration === historyTargetGenerationRef.current) {
			retryHistoryWidgetRef.current();
			return;
		}
		themeRecoveryWidgetRef.current = widget;
		themeSwitchSequenceRef.current += 1;
		clearThemeSwitchWatchdog(widget);
		beginWidgetRebuild();
	}

	const armStateSaveWatchdog = () => {
		const request = stateSaveRef.current;
		if (!request || request.timeout || shouldPauseStateSaveWatchdog()) return;
		if (request.widgetEpoch !== widgetEpochRef.current) {
			clearStateSave(request.widget, request.sequence);
			return;
		}
		if (request.remainingMs <= 0) {
			finishStatePreservingRebuild(request.widget, request.sequence);
			return;
		}
		request.startedAt = Date.now();
		request.timeout = setTimeout(() => {
			request.timeout = null;
			request.remainingMs = 0;
			finishStatePreservingRebuild(request.widget, request.sequence);
		}, request.remainingMs);
	};

	const pauseStateSaveWatchdog = () => {
		const request = stateSaveRef.current;
		if (!request?.timeout) return;
		clearTimeout(request.timeout);
		request.timeout = null;
		request.remainingMs = Math.max(0, request.remainingMs - (Date.now() - request.startedAt));
	};

	function requestStatePreservingRebuild(
		widget: IChartingLibraryWidget,
		reason: "history" | "locale" | "overlay" | "theme",
	) {
		if (widgetRef.current !== widget) return;
		const pendingRequest = stateSaveRef.current;
		if (pendingRequest?.widget === widget) {
			if (reason === "history") {
				pendingRequest.historyRebuild = true;
				pendingRequest.historyTargetGeneration = historyTargetGenerationRef.current;
			}
			if (reason === "locale") pendingRequest.localeRebuild = true;
			if (reason === "overlay") pendingRequest.overlayRebuild = true;
			if (reason === "theme") pendingRequest.themeRebuild = true;
			return;
		}

		clearStateSave();
		const sequence = stateSaveSequenceRef.current + 1;
		stateSaveSequenceRef.current = sequence;
		const request = {
			widget,
			widgetEpoch: widgetEpochRef.current,
			sequence,
			sourceSymbol: getActiveChartSymbol(widget),
			targetInterval: targetIntervalRef.current,
			intervalSequence: intervalSequenceRef.current,
			historyRebuild: reason === "history",
			historyTargetGeneration: reason === "history" ? historyTargetGenerationRef.current : null,
			localeRebuild: reason === "locale",
			overlayRebuild: reason === "overlay",
			themeRebuild: reason === "theme",
			remainingMs: LOCALE_STATE_SAVE_TIMEOUT_MS,
			startedAt: 0,
			timeout: null,
		};
		stateSaveRef.current = request;
		armStateSaveWatchdog();

		try {
			widget.save((state) => finishStatePreservingRebuild(widget, sequence, state), { includeDrawings: true });
		} catch {
			finishStatePreservingRebuild(widget, sequence);
		}
	}

	requestLocaleSwitchRef.current = () => {
		const targetLocale = targetLocaleRef.current;
		if (targetLocale === appliedLocaleRef.current) {
			const request = stateSaveRef.current;
			if (request) {
				request.localeRebuild = false;
				if (!request.historyRebuild && !request.overlayRebuild && !request.themeRebuild) {
					clearStateSave(request.widget, request.sequence);
				}
			}
			return;
		}

		const widget = widgetRef.current;
		if (!widget || !chartReadyRef.current) {
			stateSaveSequenceRef.current += 1;
			clearStateSave();
			beginWidgetRebuild();
			return;
		}

		requestStatePreservingRebuild(widget, "locale");
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
				reportDataResetFailureRef.current();
			}
		});
	};

	const canRunRealtimeReset = () =>
		activeRef.current && document.visibilityState !== "hidden" && navigator.onLine && getCandleGateRetryAt() === null;

	requestRealtimeResetRef.current = () => {
		if (!datafeedRef.current) return;
		if (!canRunRealtimeReset()) {
			pendingRealtimeResetRef.current = true;
			return;
		}
		pendingRealtimeResetRef.current = false;
		datafeedRef.current.resetRealtimeCache();
	};

	flushPendingRealtimeResetRef.current = () => {
		flushHistoryRecoveryRef.current();
		if (pendingRealtimeResetRef.current) requestRealtimeResetRef.current();
		if (pendingDataResetRef.current && canRunRealtimeReset()) requestDataResetRef.current();
	};

	useEffect(
		() =>
			subscribeWsReconnect((generation) => {
				if (generation <= wsReconnectGenerationRef.current) return;
				wsReconnectGenerationRef.current = generation;
				requestRealtimeResetRef.current();
			}),
		[],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: switch cleanup only reads refs; adding the helper would recreate the widget on every render.
	useEffect(() => {
		void retryNonce;
		if (!containerRef.current) return;
		const widgetEpoch = widgetEpochRef.current;
		let disposed = false;
		let readyWatchdog:
			| {
					widget: IChartingLibraryWidget;
					widgetEpoch: number;
					automaticRetryCount: number;
					remainingMs: number;
					startedAt: number;
					timeout: ReturnType<typeof setTimeout> | null;
			  }
			| undefined;
		let deferredInitializationFailure: { reason: string; automaticRetryCount: number } | undefined;
		let drawingEventSubscription:
			| {
					widget: IChartingLibraryWidget;
					callback: (sourceId: EntityId, eventType: DrawingEventType) => void;
			  }
			| undefined;
		let intervalChangeSubscriptionCleanup: (() => void) | undefined;
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

		const clearDrawingEventSubscription = () => {
			const subscription = drawingEventSubscription;
			drawingEventSubscription = undefined;
			if (!subscription) return;
			try {
				subscription.widget.unsubscribe("drawing_event", subscription.callback);
			} catch {}
		};

		const clearIntervalChangeSubscription = () => {
			const cleanup = intervalChangeSubscriptionCleanup;
			intervalChangeSubscriptionCleanup = undefined;
			try {
				cleanup?.();
			} catch {}
		};

		const subscribeToIntervalChanges = (widget: IChartingLibraryWidget) => {
			clearIntervalChangeSubscription();
			try {
				const subscription = widget.activeChart().onIntervalChanged();
				const callback = (nextInterval: ResolutionString) => {
					if (
						disposed ||
						widgetEpochRef.current !== widgetEpoch ||
						widgetRef.current !== widget ||
						!isChartSymbolApplied(getActiveChartSymbol(widget), targetSymbolRef.current)
					) {
						return;
					}
					const intervalValue = String(nextInterval);
					if (targetIntervalRef.current === intervalValue) return;
					targetIntervalRef.current = intervalValue;
					appliedIntervalRef.current = intervalValue;
					intervalSequenceRef.current += 1;
					pendingChartIntervalRef.current = null;
					activateHistoryTarget(targetSymbolRef.current, intervalValue);
				};
				subscription.subscribe(null, callback);
				intervalChangeSubscriptionCleanup = () => subscription.unsubscribe(null, callback);
			} catch {}
		};

		const subscribeToDrawingEvents = (widget: IChartingLibraryWidget) => {
			clearDrawingEventSubscription();
			const callback = (sourceId: EntityId, eventType: DrawingEventType) => {
				if (eventType !== "remove") return;
				if (
					disposed ||
					widgetEpochRef.current !== widgetEpoch ||
					widgetRef.current !== widget ||
					!chartReadyRef.current
				)
					return;
				if (!overlayControllerRef.current?.handleDrawingRemoved(sourceId)) return;
				queueMicrotask(() => {
					if (
						!disposed &&
						widgetEpochRef.current === widgetEpoch &&
						widgetRef.current === widget &&
						chartReadyRef.current
					) {
						syncOverlaysRef.current();
					}
				});
			};
			try {
				widget.subscribe("drawing_event", callback);
				drawingEventSubscription = { widget, callback };
			} catch {}
		};

		const removeWidget = (resetHistoryRecovery = true) => {
			clearReadyWatchdog();
			clearPendingSymbolSwitch();
			stateSaveSequenceRef.current += 1;
			clearStateSave();
			const widget = widgetRef.current;
			if (
				widget &&
				overlayDisabledWidgetRef.current === widget &&
				overlayDisabledSymbolRef.current === targetSymbolRef.current
			) {
				overlayDisableNextWidgetRef.current = true;
			}
			clearDrawingEventSubscription();
			clearIntervalChangeSubscription();
			overlayControllerRef.current?.dispose();
			clearOverlayRetry();
			const datafeed = datafeedRef.current;
			themeSwitchSequenceRef.current += 1;
			clearThemeSwitchWatchdog(widget ?? undefined);
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
			pendingRealtimeResetRef.current = false;
			failedHistoryStreamKeyRef.current = null;
			hasLoadedHistoryRef.current = false;
			latestHistoryRequestRef.current = null;
			historyRateLimitRef.current = null;
			if (!disposed) setHistoryRateLimit(null);
			if (resetHistoryRecovery) resetHistoryRecoveryRef.current();
			scheduledDataResetWidgetRef.current = null;
			appliedSymbolRef.current = null;
			appliedIntervalRef.current = null;
			appliedThemeRef.current = null;
			appliedLocaleRef.current = null;
			themeSwitchRetryTargetRef.current = null;
			if (themeRecoveryWidgetRef.current === widget) {
				themeRecoveryWidgetRef.current = null;
			}
			if (overlayRecoveryWidgetRef.current === widget) {
				overlayRecoveryWidgetRef.current = null;
			}
			if (overlayDisabledWidgetRef.current === widget) {
				overlayDisabledWidgetRef.current = null;
				if (!overlayDisableNextWidgetRef.current) overlayDisabledSymbolRef.current = null;
			}
			if (themeSwitchInFlightWidgetRef.current === widget) {
				themeSwitchInFlightWidgetRef.current = null;
			}
		};

		const handleFinalFailure = (reason: string) => {
			if (disposed || widgetEpochRef.current !== widgetEpoch) return;
			setIsInitializing(false);
			setInitError(reason);
		};
		const historyRecovery = createHistoryRecoveryController({
			canRetry: () =>
				!disposed &&
				widgetEpochRef.current === widgetEpoch &&
				widgetRef.current !== null &&
				chartReadyRef.current &&
				canRunRealtimeReset(),
			onExhausted: () => {
				historyRecoveryExhaustedRef.current = true;
				if (!hasLoadedHistoryRef.current) {
					handleFinalFailure("history-recovery-exhausted");
					return;
				}
				pendingDataResetRef.current = false;
				historyRateLimitRef.current = null;
				setHistoryRateLimit(null);
				resumeReadyWatchdogRef.current();
			},
			onRetry: () => {
				pendingDataResetRef.current = false;
				pendingRealtimeResetRef.current = false;
				if (datafeedRef.current?.resetRealtimeCache(failedHistoryStreamKeyRef.current ?? undefined)) return;
				const widget = widgetRef.current;
				if (!widget) {
					reportDataResetFailureRef.current();
					return;
				}
				requestStatePreservingRebuild(widget, "history");
			},
		});
		flushHistoryRecoveryRef.current = historyRecovery.flush;
		reportDataResetFailureRef.current = historyRecovery.handleFailure;
		resetHistoryRecoveryRef.current = () => {
			historyRecoveryExhaustedRef.current = false;
			historyRecovery.reset();
		};
		retryHistoryWidgetRef.current = () => void initWidget(0, true);

		const shouldPauseReadyWatchdog = () =>
			!activeRef.current ||
			document.visibilityState === "hidden" ||
			!navigator.onLine ||
			historyRateLimitRef.current !== null ||
			getCandleGateRetryAt() !== null;

		const retryOrFail = (reason: string, automaticRetryCount: number) => {
			if (disposed || widgetEpochRef.current !== widgetEpoch) return;
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
				widgetEpochRef.current !== watchdog.widgetEpoch ||
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
			if (
				disposed ||
				widgetEpochRef.current !== watchdog.widgetEpoch ||
				readyWatchdog !== watchdog ||
				watchdog.timeout ||
				shouldPauseReadyWatchdog()
			)
				return;
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
		pauseThemeWatchdogRef.current = pauseThemeSwitchWatchdog;
		resumeThemeWatchdogRef.current = armThemeSwitchWatchdog;
		pauseStateSaveWatchdogRef.current = pauseStateSaveWatchdog;
		resumeStateSaveWatchdogRef.current = armStateSaveWatchdog;

		const handlePageLifecycleChange = () => {
			if (shouldPauseReadyWatchdog()) {
				pauseReadyWatchdog();
			} else {
				resumeReadyWatchdog();
			}
			if (shouldPauseThemeWatchdog()) {
				pauseThemeWatchdogRef.current();
			} else {
				resumeThemeWatchdogRef.current();
			}
			if (shouldPauseStateSaveWatchdog()) {
				pauseStateSaveWatchdogRef.current();
			} else {
				resumeStateSaveWatchdogRef.current();
			}
			flushPendingRealtimeResetRef.current();
		};

		let candleGateResumeTimer: ReturnType<typeof setTimeout> | null = null;
		const handleCandleGateChange = () => {
			if (candleGateResumeTimer) {
				clearTimeout(candleGateResumeTimer);
				candleGateResumeTimer = null;
			}
			const retryAt = getCandleGateRetryAt();
			if (retryAt !== null) {
				candleGateResumeTimer = setTimeout(
					() => {
						candleGateResumeTimer = null;
						handleCandleGateChange();
					},
					Math.max(0, retryAt - Date.now()),
				);
			}
			if (!disposed && widgetEpochRef.current === widgetEpoch) setRateLimitedUntil(retryAt);
			handlePageLifecycleChange();
		};

		document.addEventListener("visibilitychange", handlePageLifecycleChange);
		window.addEventListener("online", handlePageLifecycleChange);
		window.addEventListener("offline", handlePageLifecycleChange);
		window.addEventListener("pageshow", handlePageLifecycleChange);
		const unsubscribeCandleGate = subscribeCandleGate(handleCandleGateChange);
		handleCandleGateChange();

		async function initWidget(automaticRetryCount: number, preserveHistoryRecovery = false): Promise<void> {
			if (disposed || widgetEpochRef.current !== widgetEpoch) return;
			setIsInitializing(true);
			setInitError(null);
			try {
				await loadTradingViewScript();

				if (disposed || widgetEpochRef.current !== widgetEpoch || !containerRef.current) return;
				const tradingView = window.TradingView;
				if (!tradingView) throw new Error("tradingview-unavailable");

				removeWidget(!preserveHistoryRecovery);

				const overrides = buildChartOverrides();
				const loadingColors = getLoadingScreenColors();
				const initialTheme = targetThemeRef.current;
				const initialLocale = targetLocaleRef.current;
				const customCssUrl = getChartCssUrl(initialTheme);

				const initialSymbol = targetSymbolRef.current;
				const restoredInterval = pendingChartIntervalRef.current;
				const initialInterval = restoredInterval ?? targetIntervalRef.current;
				if (restoredInterval) {
					targetIntervalRef.current = restoredInterval;
					activateHistoryTarget(initialSymbol, restoredInterval);
				}
				const savedChartState =
					pendingChartStateRef.current &&
					pendingChartStateSymbolRef.current !== null &&
					isChartSymbolApplied(pendingChartStateSymbolRef.current, initialSymbol)
						? pendingChartStateRef.current
						: null;
				setInitError(null);

				const datafeed = createDatafeed({
					getPriceScale: getSelectedMarketPriceScale,
					getSymbolInfo: getSelectedMarketSymbolInfo,
					isKnownCoin: isSelectedMarketCoin,
					getHistoryTargetGeneration: () => historyTargetGenerationRef.current,
					getHistoryTarget: () => {
						const targetSymbol = targetSymbolRef.current;
						const targetMarket = getMarketForChartSymbol(targetSymbol, targetSymbol);
						return {
							coin: targetMarket?.name ?? coinFromSymbolName(targetSymbol),
							resolution: targetIntervalRef.current as ResolutionString,
						};
					},
					onRealtimeReset: () => requestDataResetRef.current(),
					requestRealtimeReset: () => requestRealtimeResetRef.current(),
					onHistoryError: (_error, historyStreamKey, identity) => {
						if (datafeedRef.current !== datafeed) return;
						if (classifyHistoryRequest(historyStreamKey, identity) !== "current") return;
						if (historyRecoveryExhaustedRef.current) resetHistoryRecoveryRef.current();
						failedHistoryStreamKeyRef.current = historyStreamKey ?? null;
						const limitedRequest = historyRateLimitRef.current;
						if (
							identity &&
							limitedRequest &&
							limitedRequest.targetGeneration === identity.targetGeneration &&
							limitedRequest.streamGeneration === identity.streamGeneration &&
							limitedRequest.streamKey === identity.streamKey &&
							identity.requestId >= limitedRequest.requestId
						) {
							const recoveringState = {
								...limitedRequest,
								requestId: identity.requestId,
								phase: "recovering" as const,
							};
							historyRateLimitRef.current = recoveringState;
							setHistoryRateLimit(recoveringState);
							pendingDataResetRef.current = true;
						}
						historyRecovery.handleFailure();
					},
					onHistoryRateLimit: (error, historyStreamKey, identity) => {
						if (datafeedRef.current !== datafeed) return;
						if (classifyHistoryRequest(historyStreamKey, identity) !== "current") return;
						if (historyRecoveryExhaustedRef.current) resetHistoryRecoveryRef.current();
						const limitedRequest = historyRateLimitRef.current;
						if (
							limitedRequest &&
							limitedRequest.targetGeneration === identity.targetGeneration &&
							limitedRequest.streamGeneration === identity.streamGeneration &&
							limitedRequest.streamKey === identity.streamKey &&
							limitedRequest.requestId > identity.requestId
						) {
							return;
						}
						const waitingState = { ...identity, phase: "waiting" as const, retryAt: error.retryAt };
						historyRateLimitRef.current = waitingState;
						setHistoryRateLimit(waitingState);
						pauseReadyWatchdog();
					},
					onHistorySuccess: (historyStreamKey, identity) => {
						if (datafeedRef.current !== datafeed) return;
						const requestState = classifyHistoryRequest(historyStreamKey, identity);
						if (requestState === "stale") return;
						hasLoadedHistoryRef.current = true;
						if (requestState === "superseded") return;
						const limitedRequest = historyRateLimitRef.current;
						if (
							identity &&
							limitedRequest &&
							limitedRequest.targetGeneration === identity.targetGeneration &&
							limitedRequest.streamGeneration === identity.streamGeneration &&
							limitedRequest.streamKey === identity.streamKey &&
							identity.requestId >= limitedRequest.requestId
						) {
							historyRateLimitRef.current = null;
							setHistoryRateLimit(null);
							handlePageLifecycleChange();
						}
						if (failedHistoryStreamKeyRef.current !== null && historyStreamKey !== failedHistoryStreamKeyRef.current) {
							return;
						}
						failedHistoryStreamKeyRef.current = null;
						historyRecoveryExhaustedRef.current = false;
						historyRecovery.handleSuccess();
					},
				});
				datafeedRef.current = datafeed;

				const widget = new tradingView.widget({
					container: containerRef.current,
					library_path: CHART_LIBRARY_PATH,
					datafeed,
					symbol: initialSymbol,
					interval: initialInterval as ResolutionString,
					locale: initialLocale,
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
					...(savedChartState ? { saved_data: savedChartState } : {}),
				});
				widgetRef.current = widget;
				if (overlayDisableNextWidgetRef.current) {
					overlayDisableNextWidgetRef.current = false;
					overlayDisabledWidgetRef.current = widget;
					overlayDisabledSymbolRef.current =
						overlayRecoverySymbolRef.current ?? overlayDisabledSymbolRef.current ?? initialSymbol;
					overlayControllerRef.current?.dispose();
				}
				appliedSymbolRef.current = savedChartState ? null : initialSymbol;
				appliedIntervalRef.current = savedChartState ? null : initialInterval;
				appliedThemeRef.current = savedChartState ? null : initialTheme;
				appliedLocaleRef.current = initialLocale;

				const watchdog = {
					widget,
					widgetEpoch,
					automaticRetryCount,
					remainingMs: CHART_READY_TIMEOUT_MS,
					startedAt: 0,
					timeout: null,
				};
				readyWatchdog = watchdog;
				armReadyWatchdog(watchdog);

				widget.onChartReady(() => {
					if (disposed || widgetEpochRef.current !== widgetEpoch || widgetRef.current !== widget) return;
					clearReadyWatchdog();
					chartReadyRef.current = true;
					hasCompletedInitialWidgetLoadRef.current = true;
					pendingChartStateRef.current = null;
					pendingChartStateSymbolRef.current = null;
					pendingChartIntervalRef.current = null;
					setIsInitializing(false);
					setInitError(null);
					subscribeToIntervalChanges(widget);
					subscribeToDrawingEvents(widget);
					const activeSymbol = getActiveChartSymbol(widget);
					if (isChartSymbolApplied(activeSymbol, targetSymbolRef.current)) {
						resetOverlayRecoveryForVerifiedSymbol(widget, targetSymbolRef.current);
					}
					flushPendingRealtimeResetRef.current();
					applyThemeRef.current(targetThemeRef.current);
					applySymbolRef.current();
					syncOverlaysRef.current();
				});
			} catch {
				if (disposed || widgetEpochRef.current !== widgetEpoch) return;
				retryOrFail("exception", automaticRetryCount);
			}
		}

		void initWidget(0);

		return () => {
			disposed = true;
			pauseReadyWatchdogRef.current = () => {};
			resumeReadyWatchdogRef.current = () => {};
			pauseThemeWatchdogRef.current = () => {};
			resumeThemeWatchdogRef.current = () => {};
			pauseStateSaveWatchdogRef.current = () => {};
			resumeStateSaveWatchdogRef.current = () => {};
			deferredInitializationFailure = undefined;
			document.removeEventListener("visibilitychange", handlePageLifecycleChange);
			window.removeEventListener("online", handlePageLifecycleChange);
			window.removeEventListener("offline", handlePageLifecycleChange);
			window.removeEventListener("pageshow", handlePageLifecycleChange);
			unsubscribeCandleGate();
			if (candleGateResumeTimer) {
				clearTimeout(candleGateResumeTimer);
				candleGateResumeTimer = null;
			}
			historyRecovery.destroy();
			clearReadyWatchdog();
			removeWidget();
			flushHistoryRecoveryRef.current = () => {};
			reportDataResetFailureRef.current = () => {};
			resetHistoryRecoveryRef.current = () => {};
			retryHistoryWidgetRef.current = () => {};
		};
	}, [retryNonce]);

	useLayoutEffect(() => {
		const symbolChanged = targetSymbolRef.current !== widgetSymbol;
		targetSymbolRef.current = widgetSymbol;
		if (market) {
			for (const key of getChartMarketKeys(market)) {
				marketBySymbolRef.current.set(getChartMarketLookupKey(key), market);
			}
		}
		const intervalChanged = intervalPropRef.current !== interval;
		if (intervalChanged) {
			intervalPropRef.current = interval;
			targetIntervalRef.current = interval;
			intervalSequenceRef.current += 1;
			pendingChartIntervalRef.current = null;
		}
		activateHistoryTarget(widgetSymbol, targetIntervalRef.current);
		if (intervalChanged && !symbolChanged) applySymbolRef.current();
	}, [widgetSymbol, market, interval, activateHistoryTarget]);

	useEffect(() => {
		if (targetSymbolRef.current !== widgetSymbol) return;
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
		flushPendingRealtimeResetRef.current();
		applyThemeRef.current(targetThemeRef.current);
		applySymbolRef.current();
		syncOverlaysRef.current();
	}, [widgetSymbol, active]);

	useEffect(() => {
		syncOverlaysRef.current();
	});

	useLayoutEffect(() => {
		applyThemeRef.current(theme);
	}, [theme]);

	useLayoutEffect(() => {
		targetLocaleRef.current = locale;
		if (committedLocaleRef.current === locale) return;
		committedLocaleRef.current = locale;
		requestLocaleSwitchRef.current();
	}, [locale]);

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
					className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-fg-muted"
				>
					{hasCompletedInitialWidgetLoadRef.current ? (
						<SpinnerGapIcon aria-hidden="true" className="size-4 animate-spin text-signal motion-reduce:animate-none" />
					) : (
						<GatuOrbitLoader className="size-9 shrink-0" />
					)}
					<span className="sr-only">{t`Loading...`}</span>
				</output>
			)}
			{(rateLimitedUntil !== null || historyRateLimit !== null) && !isInitializing && !initError && (
				<output
					data-chart-rate-limited
					aria-live="polite"
					className={cn(
						"pointer-events-none absolute z-20 text-xs font-medium text-fg-muted",
						historyRateLimit?.phase === "recovering" || !hasLoadedHistoryRef.current
							? "inset-0 flex items-center justify-center gap-2 bg-background px-4 text-center"
							: "bottom-2 left-2 rounded-xs border border-stroke-weak bg-overlay px-2 py-1 text-2xs",
					)}
				>
					{(historyRateLimit?.phase === "recovering" || !hasLoadedHistoryRef.current) && (
						<SpinnerGapIcon aria-hidden="true" className="size-4 animate-spin text-signal motion-reduce:animate-none" />
					)}
					{t`Live chart data is rate limited. Retrying shortly.`}
				</output>
			)}
			{initError && (
				<div
					role="alert"
					className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-surface px-4 text-center"
				>
					<p className="text-sm font-medium text-fg">{t`Something went wrong`}</p>
					<button
						type="button"
						className="rounded-xs border border-stroke-weak px-3 py-1.5 text-xs font-medium text-fg hover:bg-fill-hover"
						onClick={() => {
							beginWidgetRebuild();
						}}
					>
						{t`Retry`}
					</button>
				</div>
			)}
		</div>
	);
}
