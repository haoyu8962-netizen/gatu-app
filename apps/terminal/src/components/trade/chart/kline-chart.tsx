import type { Chart, KLineData } from "klinecharts";
import { dispose, FormatDateType, init, LoadDataType } from "klinecharts";
import { useEffect, useRef, useState } from "react";
import { type ChartTypeConfig, DEFAULT_CHART_TYPE, INITIAL_CANDLE_COUNT, VOLUME_INDICATOR_NAME } from "@/config/chart";
import { MS_PER_DAY, TAB_RESTORE_THRESHOLD_MS } from "@/config/time";
import { candleEventToKLineData, candlesToKLineData } from "@/lib/chart/candle";
import { formatShortDate, formatTime, formatTooltipDate } from "@/lib/chart/format";
import { DEFAULT_INTERVAL } from "@/lib/chart/kline-config";
import { buildKlineStyles } from "@/lib/chart/kline-styles";
import { registerOrderLineOverlay } from "@/lib/chart/order-line-overlay";
import { registerPositionLineOverlay } from "@/lib/chart/position-line-overlay";
import { getInfoClient, useSubscription } from "@/lib/hyperliquid";
import type { ChartSource, ChartSourceToggleIntentHandlers } from "./chart-source-toggle";
import { KlineToolbar } from "./kline-toolbar";
import { useKlineOrderOverlays } from "./use-kline-order-overlays";
import { useKlinePositionOverlays } from "./use-kline-position-overlays";

interface Props {
	symbol?: string;
	theme?: "light" | "dark";
	yAxisInside?: boolean;
	onChartSourceChange?: (source: ChartSource) => void;
	tradingViewIntentHandlers?: ChartSourceToggleIntentHandlers;
}

export function KlineChart({
	symbol = "",
	theme,
	yAxisInside = false,
	onChartSourceChange,
	tradingViewIntentHandlers,
}: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<Chart | null>(null);
	const [activeInterval, setActiveInterval] = useState(DEFAULT_INTERVAL);
	const [activeChartType, setActiveChartType] = useState<ChartTypeConfig>(DEFAULT_CHART_TYPE);
	const intervalRef = useRef(activeInterval);
	intervalRef.current = activeInterval;
	const isHiddenRef = useRef(false);
	const hiddenAtRef = useRef<number | null>(null);
	const candleBufferRef = useRef<KLineData[]>([]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || !symbol) return;

		registerOrderLineOverlay();
		registerPositionLineOverlay();

		const chart = init(container, {
			customApi: {
				formatDate: (_dateTimeFormat, timestamp, _format, type) => {
					const date = new Date(timestamp);
					if (type === FormatDateType.XAxis) {
						if (activeInterval.barMs >= MS_PER_DAY) return formatShortDate(date);
						if (date.getHours() === 0 && date.getMinutes() === 0) return formatShortDate(date);
						return formatTime(date);
					}
					return formatTooltipDate(date);
				},
			},
		});
		if (!chart) return;
		chartRef.current = chart;

		chart.setStyles(buildKlineStyles(activeChartType.type, { yAxisInside }));
		chart.createIndicator(VOLUME_INDICATOR_NAME);

		chart.setLoadDataCallback(({ type, data, callback }) => {
			const interval = intervalRef.current;

			if (type === LoadDataType.Forward && data) {
				const endTime = data.timestamp;
				const startTime = endTime - INITIAL_CANDLE_COUNT * interval.barMs;

				getInfoClient()
					.candleSnapshot({
						coin: symbol,
						interval: interval.candleInterval,
						startTime,
						endTime,
					})
					.then((candles) => callback(candlesToKLineData(candles), candles.length > 0))
					.catch((err) => {
						console.error("kline forward-load failed", err);
						callback([], false);
					});
			}

			if (type === LoadDataType.Backward) {
				callback([], false);
			}
		});

		const endTime = Date.now();
		const startTime = endTime - INITIAL_CANDLE_COUNT * activeInterval.barMs;

		getInfoClient()
			.candleSnapshot({
				coin: symbol,
				interval: activeInterval.candleInterval,
				startTime,
				endTime,
			})
			.then((candles) => {
				if (chartRef.current === chart) {
					chart.applyNewData(candlesToKLineData(candles), true);
				}
			})
			.catch((err) => console.error("kline initial candle fetch failed", err));

		const ro = new ResizeObserver(() => chart.resize());
		ro.observe(container);

		return () => {
			ro.disconnect();
			chartRef.current = null;
			candleBufferRef.current = [];
			dispose(container);
		};
	}, [symbol, activeInterval, activeChartType, yAxisInside, theme]);

	useEffect(() => {
		isHiddenRef.current = document.visibilityState === "hidden";
		candleBufferRef.current = [];

		function handleVisibility() {
			if (document.visibilityState === "hidden") {
				isHiddenRef.current = true;
				hiddenAtRef.current = Date.now();
				return;
			}

			const gapMs = hiddenAtRef.current !== null ? Date.now() - hiddenAtRef.current : 0;
			isHiddenRef.current = false;
			hiddenAtRef.current = null;

			const chart = chartRef.current;
			if (!chart) return;

			for (const kline of candleBufferRef.current) {
				chart.updateData(kline);
			}
			candleBufferRef.current = [];

			chart.resize();

			if (gapMs >= TAB_RESTORE_THRESHOLD_MS && symbol) {
				const interval = intervalRef.current;
				const endTime = Date.now();
				const startTime = endTime - INITIAL_CANDLE_COUNT * interval.barMs;
				getInfoClient()
					.candleSnapshot({ coin: symbol, interval: interval.candleInterval, startTime, endTime })
					.then((candles) => {
						if (chartRef.current === chart) {
							chart.applyNewData(candlesToKLineData(candles), true);
						}
					})
					.catch((err) => console.error("kline tab-restore refetch failed", err));
			}
		}

		document.addEventListener("visibilitychange", handleVisibility);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibility);
			candleBufferRef.current = [];
		};
	}, [symbol]);

	const candleData = useSubscription(
		"candle",
		{ coin: symbol, interval: activeInterval.candleInterval },
		{ enabled: !!symbol },
	);

	useEffect(() => {
		const chart = chartRef.current;
		const event = candleData.data;
		if (!chart || !event) return;

		const klineData = candleEventToKLineData(event);
		if (!klineData) return;

		if (isHiddenRef.current) {
			candleBufferRef.current.push(klineData);
		} else {
			chart.updateData(klineData);
		}
	}, [candleData.data]);

	useKlineOrderOverlays({ chartRef, symbol });
	useKlinePositionOverlays({ chartRef, symbol });

	return (
		<div className="flex flex-col h-full">
			<KlineToolbar
				activeInterval={activeInterval}
				onIntervalChange={setActiveInterval}
				activeChartType={activeChartType}
				onChartTypeChange={setActiveChartType}
				onChartSourceChange={onChartSourceChange}
				tradingViewIntentHandlers={tradingViewIntentHandlers}
			/>
			<div ref={containerRef} className="flex-1 min-h-0" />
		</div>
	);
}
