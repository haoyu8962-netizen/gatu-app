import { Dropdown } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import type { Chart, KLineData } from "klinecharts";
import { dispose, FormatDateType, init, LoadDataType } from "klinecharts";
import { useEffect, useRef, useState } from "react";
import { useConnection } from "wagmi";
import { HL_ALL_DEXS } from "@/config/constants";
import { candleEventToKLineData, candlesToKLineData } from "@/lib/chart/candle";
import {
	CHART_TYPES,
	type ChartTypeConfig,
	DEFAULT_CHART_TYPE,
	DEFAULT_INTERVAL,
	FAVORITE_SET,
	MORE_INTERVALS,
	STARRED_INTERVALS,
} from "@/lib/chart/kline-config";
import { buildKlineStyles } from "@/lib/chart/kline-styles";
import { ORDER_LINE_NAME, registerOrderLineOverlay } from "@/lib/chart/order-line-overlay";
import { POSITION_LINE_NAME, registerPositionLineOverlay } from "@/lib/chart/position-line-overlay";
import { cn } from "@/lib/cn";
import { getInfoClient, useSubscription } from "@/lib/hyperliquid";
import { type ChartSource, ChartSourceToggle, type ChartSourceToggleIntentHandlers } from "./chart-source-toggle";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatShortDate(date: Date): string {
	return `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function formatTime(date: Date): string {
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatTooltipDate(date: Date): string {
	const m = date.getMonth() + 1;
	const d = date.getDate();
	const y = String(date.getFullYear()).slice(2);
	return `${m}/${d}/${y} ${formatTime(date)}`;
}

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
	const { address, isConnected } = useConnection();

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
						if (activeInterval.barMs >= 86_400_000) return formatShortDate(date);
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
		chart.createIndicator("VOL");

		chart.setLoadDataCallback(({ type, data, callback }) => {
			const interval = intervalRef.current;

			if (type === LoadDataType.Forward && data) {
				const endTime = data.timestamp;
				const startTime = endTime - 500 * interval.barMs;

				getInfoClient()
					.candleSnapshot({
						coin: symbol,
						interval: interval.candleInterval,
						startTime,
						endTime,
					})
					.then((candles) => callback(candlesToKLineData(candles), candles.length > 0))
					.catch(() => callback([], false));
			}

			if (type === LoadDataType.Backward) {
				callback([], false);
			}
		});

		const endTime = Date.now();
		const startTime = endTime - 500 * activeInterval.barMs;

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
			.catch(() => {});

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

			if (gapMs >= 30_000 && symbol) {
				const interval = intervalRef.current;
				const endTime = Date.now();
				const startTime = endTime - 500 * interval.barMs;
				getInfoClient()
					.candleSnapshot({ coin: symbol, interval: interval.candleInterval, startTime, endTime })
					.then((candles) => {
						if (chartRef.current === chart) {
							chart.applyNewData(candlesToKLineData(candles), true);
						}
					})
					.catch(() => {});
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

	const { data: openOrdersEvent } = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);

	useEffect(() => {
		const chart = chartRef.current;
		if (!chart) return;

		chart.removeOverlay({ name: ORDER_LINE_NAME });

		const orders = openOrdersEvent?.orders;
		if (!orders) return;

		const symbolOrders = orders.filter((o) => o.coin === symbol);

		for (const order of symbolOrders) {
			const price = Number(order.limitPx);
			if (!Number.isFinite(price)) continue;

			const label = order.side === "B" ? "Limit Buy" : "Limit Sell";

			chart.createOverlay({
				name: ORDER_LINE_NAME,
				points: [{ value: price }],
				modeSensitivity: 0,
				styles: {
					rect: { color: "transparent", borderColor: "transparent", borderSize: 0 },
					polygon: { color: "transparent", borderColor: "transparent", borderSize: 0 },
				},
				extendData: {
					side: order.side,
					label,
				},
			});
		}
	}, [openOrdersEvent, symbol]);

	const { data: clearinghouseEvent } = useSubscription(
		"allDexsClearinghouseState",
		{ user: address ?? "" },
		{ enabled: isConnected && !!address },
	);

	useEffect(() => {
		const chart = chartRef.current;
		if (!chart) return;

		chart.removeOverlay({ name: POSITION_LINE_NAME });

		const states = clearinghouseEvent?.clearinghouseStates;
		if (!states) return;

		const mainDex = states.find(([dex]) => dex === "")?.[1];
		if (!mainDex) return;

		const position = mainDex.assetPositions.find((p) => p.position.coin === symbol);
		if (!position) return;

		const entryPx = Number(position.position.entryPx);
		const szi = Number(position.position.szi);
		if (!Number.isFinite(entryPx) || !Number.isFinite(szi) || szi === 0) return;

		chart.createOverlay({
			name: POSITION_LINE_NAME,
			points: [{ value: entryPx }],
			modeSensitivity: 0,
			styles: {
				rect: { color: "transparent", borderColor: "transparent", borderSize: 0 },
				polygon: { color: "transparent", borderColor: "transparent", borderSize: 0 },
			},
			extendData: {
				isLong: szi > 0,
			},
		});
	}, [clearinghouseEvent, symbol]);

	const isNonFavoriteActive = !FAVORITE_SET.has(activeInterval.resolution);

	const showChartSourceToggle = Boolean(onChartSourceChange && tradingViewIntentHandlers);

	return (
		<div className="flex flex-col h-full">
			<div className="flex min-w-0 items-center justify-between gap-2 border-b border-stroke-weak/60 bg-bg-raised">
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 p-2 py-1.5">
					{STARRED_INTERVALS.map((interval) => (
						<button
							key={interval.resolution}
							type="button"
							onClick={() => setActiveInterval(interval)}
							className={cn(
								"px-1.5 py-0.5 text-xs rounded-8 transition-colors",
								activeInterval.resolution === interval.resolution
									? "text-text-strong font-semibold"
									: "text-text-weak hover:text-text-strong",
							)}
						>
							{interval.label}
						</button>
					))}
					<Dropdown
						trigger={
							<span
								className={cn(
									"flex items-center gap-0.5",
									isNonFavoriteActive ? "text-text-strong font-semibold" : "text-text-weak font-normal",
								)}
							>
								{isNonFavoriteActive ? activeInterval.label : null}
							</span>
						}
						items={MORE_INTERVALS.map((interval) => ({
							label: interval.label,
							active: activeInterval.resolution === interval.resolution,
							onSelect: () => setActiveInterval(interval),
						}))}
						align="start"
						size="sm"
						triggerVariant="minimal"
						triggerAriaLabel={isNonFavoriteActive ? undefined : t`More intervals`}
						className="inline-flex"
						popupClassName="min-w-0 w-max"
					/>
					<div className="h-3 w-px shrink-0 self-center bg-stroke-weak/50" aria-hidden />
					<Dropdown
						trigger={
							<span className="flex items-center gap-0.5 font-semibold text-text-strong">{activeChartType.label}</span>
						}
						items={CHART_TYPES.map((ct) => ({
							label: ct.label,
							active: activeChartType.type === ct.type,
							onSelect: () => setActiveChartType(ct),
						}))}
						align="start"
						size="sm"
						triggerVariant="minimal"
						className="inline-flex"
						popupClassName="min-w-0 w-max"
					/>
				</div>
				{showChartSourceToggle ? (
					<div className="shrink-0 pr-2">
						<ChartSourceToggle
							value="default"
							onValueChange={onChartSourceChange}
							tradingViewIntentHandlers={tradingViewIntentHandlers}
						/>
					</div>
				) : null}
			</div>
			<div ref={containerRef} className="flex-1 min-h-0" />
		</div>
	);
}
