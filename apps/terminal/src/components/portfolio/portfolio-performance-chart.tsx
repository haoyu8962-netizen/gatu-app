import { Button } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import Big from "big.js";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PortfolioPeriod, PortfolioSnapshot } from "@/domain/portfolio";
import { cn } from "@/lib/cn";
import { formatDateTime, formatTime, formatUSD } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";

type ChartMetric = "accountValue" | "pnl" | "perpsPnl";
type History = PortfolioSnapshot["pnlHistory"];

interface Props {
	accountValueHistory: History;
	pnlHistory: History;
	perpsPnlHistory: History;
	isLoading: boolean;
	isUnavailable: boolean;
	onRetry: () => void;
	period?: PortfolioPeriod;
}

interface ChartSize {
	width: number;
	height: number;
}

interface ParsedPoint {
	timestamp: number;
	value: number;
	rawValue: string;
	sourceIndex: number;
}

interface ChartPoint extends ParsedPoint {
	x: number;
	y: number;
}

interface ChartTick {
	value: number;
	label: string;
	y: number;
}

interface TimeTick {
	timestamp: number;
	label: string;
	x: number;
}

interface ChartModel {
	path: string;
	points: ChartPoint[];
	timeTicks: TimeTick[];
	valueTicks: ChartTick[];
	plotBottom: number;
	plotLeft: number;
	plotRight: number;
	plotTop: number;
}

interface InteractionState {
	history: History;
	index: number;
	metric: ChartMetric;
	period: PortfolioPeriod | undefined;
	pointerXRatio: number;
	pointerYRatio: number;
	source: "keyboard" | "pointer";
}

interface InteractionStore {
	history: History;
	metric: ChartMetric;
	period: PortfolioPeriod | undefined;
	value: InteractionState | null;
}

const DEFAULT_CHART_SIZE: ChartSize = { width: 640, height: 174 };
const MIN_CHART_WIDTH = 200;
const MIN_CHART_HEIGHT = 120;
const PLOT_PADDING_TOP = 8;
const PLOT_PADDING_RIGHT = 8;
const PLOT_PADDING_BOTTOM = 24;
const PLOT_PADDING_LEFT = 60;
const TIME_TICK_SPACING = 108;
const TOOLTIP_GAP = 6;
const TOOLTIP_HEIGHT = 32;
const TOOLTIP_INSET = 6;
const TOOLTIP_WIDTH = 176;

export function PortfolioPerformanceChart({
	accountValueHistory,
	pnlHistory,
	perpsPnlHistory,
	isLoading,
	isUnavailable,
	onRetry,
	period,
}: Props) {
	const numberFormatRevision = useNumberFormatRevision();
	const { i18n, t } = useLingui();
	const plotRef = useRef<HTMLDivElement>(null);
	const [metric, setMetric] = useState<ChartMetric>("pnl");
	const [chartSize, setChartSize] = useState<ChartSize>(DEFAULT_CHART_SIZE);
	const history = selectHistory(metric, accountValueHistory, pnlHistory, perpsPnlHistory);
	const [interactionStore, setInteractionStore] = useState<InteractionStore>(() => ({
		history,
		metric,
		period,
		value: null,
	}));
	const interactionContextIsCurrent =
		interactionStore.history === history && interactionStore.metric === metric && interactionStore.period === period;
	if (!interactionContextIsCurrent) {
		setInteractionStore({ history, metric, period, value: null });
	}
	// biome-ignore lint/correctness/useExhaustiveDependencies: chart labels also read Lingui and number-format external state
	const chart = useMemo(
		() => buildChart(history, period, chartSize),
		[chartSize, history, i18n.locale, numberFormatRevision, period],
	);
	const activeInteraction = interactionContextIsCurrent ? interactionStore.value : null;
	const activePoint = activeInteraction ? chart.points[activeInteraction.index] : undefined;
	const latestValue = chart.points.at(-1)?.rawValue ?? null;
	const formattedLatestValue = formatLatestValue(latestValue, metric);
	const activeLabel = activePoint ? formatPointLabel(activePoint) : null;
	const hasRenderableChart = !isLoading && !isUnavailable && chart.points.length > 0;
	const tooltipAnchor =
		activeInteraction?.source === "pointer"
			? {
					x: activeInteraction.pointerXRatio * chartSize.width,
					y: activeInteraction.pointerYRatio * chartSize.height,
				}
			: activePoint;
	const tooltipPosition =
		activeInteraction && tooltipAnchor ? getTooltipPosition(tooltipAnchor.x, tooltipAnchor.y, chartSize) : null;

	useEffect(() => {
		if (!hasRenderableChart) return;
		const plot = plotRef.current;
		if (!plot) return;
		const plotElement = plot;

		function updateSize() {
			const rect = plotElement.getBoundingClientRect();
			const nextSize = {
				width: Math.max(MIN_CHART_WIDTH, Math.round(rect.width)),
				height: Math.max(MIN_CHART_HEIGHT, Math.round(rect.height)),
			};
			setChartSize((current) =>
				current.width === nextSize.width && current.height === nextSize.height ? current : nextSize,
			);
		}

		updateSize();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(updateSize);
		observer.observe(plotElement);
		return () => observer.disconnect();
	}, [hasRenderableChart]);

	function handleMetricChange(nextMetric: ChartMetric) {
		setInteractionStore((current) => ({ ...current, value: null }));
		setMetric(nextMetric);
	}

	function setInteraction(value: InteractionState | null) {
		setInteractionStore({ history, metric, period, value });
	}

	function updateInteractionFromPointer(event: React.PointerEvent<HTMLDivElement>) {
		if (!chart.points.length) return;
		const rect = event.currentTarget.getBoundingClientRect();
		const scaleX = chartSize.width / Math.max(rect.width, 1);
		const scaleY = chartSize.height / Math.max(rect.height, 1);
		const pointerX = clamp((event.clientX - rect.left) * scaleX, 0, chartSize.width);
		const pointerY = clamp((event.clientY - rect.top) * scaleY, 0, chartSize.height);
		const pointerPlotX = clamp(pointerX, chart.plotLeft, chart.plotRight);
		const firstTimestamp = chart.points[0]?.timestamp ?? 0;
		const lastTimestamp = chart.points.at(-1)?.timestamp ?? firstTimestamp;
		const pointerPlotRatio =
			(pointerPlotX - chart.plotLeft) / Math.max(chart.plotRight - chart.plotLeft, Number.EPSILON);
		const targetTimestamp = firstTimestamp + (lastTimestamp - firstTimestamp) * pointerPlotRatio;
		const index = findNearestPortfolioPointIndex(chart.points, targetTimestamp);
		setInteraction({
			history,
			index,
			metric,
			period,
			pointerXRatio: pointerX / chartSize.width,
			pointerYRatio: pointerY / chartSize.height,
			source: "pointer",
		});
	}

	function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
		if (event.pointerType !== "touch") return;
		event.currentTarget.setPointerCapture?.(event.pointerId);
		updateInteractionFromPointer(event);
	}

	function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
		updateInteractionFromPointer(event);
	}

	function handlePointerCancel() {
		setInteraction(null);
	}

	function handlePointerLeave() {
		setInteractionStore((current) =>
			current.history === history &&
			current.metric === metric &&
			current.period === period &&
			current.value?.source === "pointer"
				? { ...current, value: null }
				: current,
		);
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		if (!chart.points.length) return;
		if (event.key === "Escape") {
			event.preventDefault();
			setInteraction(null);
			return;
		}
		if (event.key === "Home") {
			event.preventDefault();
			setInteraction(null);
			return;
		}
		if (event.key === "End") {
			event.preventDefault();
			setKeyboardInteraction(chart.points.length - 1);
			return;
		}
		if (
			event.key !== "ArrowLeft" &&
			event.key !== "ArrowRight" &&
			event.key !== "ArrowDown" &&
			event.key !== "ArrowUp"
		) {
			return;
		}

		event.preventDefault();
		const direction = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : -1;
		const index = clamp((activeInteraction?.index ?? -1) + direction, -1, chart.points.length - 1);
		if (index === -1) {
			setInteraction(null);
			return;
		}
		setKeyboardInteraction(index);
	}

	function setKeyboardInteraction(index: number) {
		const point = chart.points[index];
		if (!point) return;
		setInteraction({
			history,
			index,
			metric,
			period,
			pointerXRatio: point.x / chartSize.width,
			pointerYRatio: point.y / chartSize.height,
			source: "keyboard",
		});
	}

	return (
		<section
			className="flex h-60 flex-col overflow-hidden rounded-12 bg-surface min-[1001px]:h-[249px]"
			aria-label={t`Portfolio performance`}
			aria-busy={isLoading}
		>
			<div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-stroke-weak px-3">
				<div className="flex min-w-0 items-center gap-1">
					<ChartTab active={metric === "accountValue"} onClick={() => handleMetricChange("accountValue")}>
						<Trans>Account Value</Trans>
					</ChartTab>
					<ChartTab active={metric === "pnl"} onClick={() => handleMetricChange("pnl")}>
						<Trans>PNL</Trans>
					</ChartTab>
					<ChartTab active={metric === "perpsPnl"} onClick={() => handleMetricChange("perpsPnl")}>
						<Trans>Perps PNL</Trans>
					</ChartTab>
				</div>
				<span className={cn("text-xs font-medium tabular-nums", Number(latestValue) < 0 ? "text-error" : "text-fg")}>
					{formattedLatestValue}
				</span>
			</div>

			<div className="relative min-h-0 flex-1 px-3 pb-3 pt-2">
				{isLoading || isUnavailable ? (
					<div
						className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center"
						role={isUnavailable ? "alert" : "status"}
					>
						<p className="text-sm font-medium text-fg">
							{isLoading ? <Trans>Loading...</Trans> : <Trans>Something went wrong</Trans>}
						</p>
						{isUnavailable ? (
							<Button variant="outline" intent="neutral" size="xs" onClick={onRetry}>
								<Trans>Retry</Trans>
							</Button>
						) : null}
					</div>
				) : chart.points.length ? (
					<div
						ref={plotRef}
						className="relative block size-full min-h-0 touch-pan-y cursor-crosshair overflow-hidden rounded-xs border-0 bg-transparent p-0 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus"
						aria-label={t`Portfolio history chart`}
						aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home End Escape"
						aria-orientation="horizontal"
						aria-valuemax={chart.points.length - 1}
						aria-valuemin={-1}
						aria-valuenow={activeInteraction?.index ?? -1}
						aria-valuetext={activeLabel ?? t`No data point selected`}
						role="slider"
						tabIndex={0}
						onKeyDown={handleKeyDown}
						onPointerCancel={handlePointerCancel}
						onPointerDown={handlePointerDown}
						onPointerLeave={handlePointerLeave}
						onPointerMove={handlePointerMove}
						data-portfolio-chart-plot
					>
						<svg
							viewBox={`0 0 ${chartSize.width} ${chartSize.height}`}
							className="size-full text-brand"
							aria-hidden="true"
							preserveAspectRatio="none"
						>
							<title>{t`Portfolio history`}</title>
							<line
								x1={chart.plotLeft}
								y1={chart.plotBottom}
								x2={chart.plotRight}
								y2={chart.plotBottom}
								className="stroke-stroke-weak"
								strokeWidth="1"
								vectorEffect="non-scaling-stroke"
								data-x-axis
							/>
							{chart.valueTicks.map((tick) => {
								const isZero = tick.value === 0;
								return (
									<g key={tick.value} data-y-tick={tick.value}>
										<line
											x1={chart.plotLeft}
											y1={tick.y}
											x2={chart.plotRight}
											y2={tick.y}
											className={isZero ? "stroke-stroke-strong" : "stroke-stroke-weak"}
											strokeWidth={isZero ? "1.25" : "1"}
											strokeOpacity={isZero ? undefined : "0.55"}
											vectorEffect="non-scaling-stroke"
											data-zero-line={isZero ? "true" : undefined}
										/>
										<text
											x={chart.plotLeft - 7}
											y={tick.y}
											className="fill-fg-muted text-[10px] tabular-nums"
											textAnchor="end"
											dominantBaseline="middle"
										>
											{tick.label}
										</text>
									</g>
								);
							})}
							{chart.timeTicks.map((tick, index) => (
								<g key={`${tick.timestamp}-${index}`} data-x-tick={tick.timestamp}>
									<line
										x1={tick.x}
										y1={chart.plotBottom}
										x2={tick.x}
										y2={chart.plotBottom + 3}
										className="stroke-stroke-weak"
										strokeWidth="1"
										vectorEffect="non-scaling-stroke"
									/>
									<text
										x={tick.x}
										y={chart.plotBottom + 15}
										className="fill-fg-muted text-[10px] tabular-nums"
										textAnchor={index === 0 ? "start" : index === chart.timeTicks.length - 1 ? "end" : "middle"}
									>
										{tick.label}
									</text>
								</g>
							))}
							{chart.path ? (
								<path
									d={chart.path}
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinejoin="round"
									strokeLinecap="round"
									vectorEffect="non-scaling-stroke"
									data-chart-path
								/>
							) : (
								<circle
									cx={chart.points[0].x}
									cy={chart.points[0].y}
									r="2.5"
									fill="currentColor"
									vectorEffect="non-scaling-stroke"
									data-single-point
								/>
							)}
							{activePoint ? (
								<>
									<line
										x1={activePoint.x}
										y1={chart.plotTop}
										x2={activePoint.x}
										y2={chart.plotBottom}
										className="stroke-stroke-strong"
										strokeWidth="1"
										strokeDasharray="3 3"
										vectorEffect="non-scaling-stroke"
										data-crosshair
									/>
									<circle
										cx={activePoint.x}
										cy={activePoint.y}
										r="3"
										className="fill-surface stroke-brand"
										strokeWidth="1.5"
										vectorEffect="non-scaling-stroke"
										data-active-point={activePoint.timestamp}
									/>
								</>
							) : null}
						</svg>
						{activeLabel && tooltipPosition ? (
							<span
								role="tooltip"
								className="pointer-events-none absolute z-[var(--z-tooltip)] flex h-8 items-center justify-center break-words rounded-32 border border-stroke-weak bg-overlay px-2 text-center text-2xs font-medium leading-3 text-fg shadow-raised tabular-nums [overflow-wrap:anywhere]"
								style={{
									left: `${tooltipPosition.left}px`,
									top: `${tooltipPosition.top}px`,
									width: `${tooltipPosition.width}px`,
								}}
								data-tooltip
							>
								{activeLabel}
							</span>
						) : null}
					</div>
				) : (
					<output className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-fg-muted">
						<Trans>No performance history</Trans>
					</output>
				)}
			</div>
		</section>
	);
}

function selectHistory(
	metric: ChartMetric,
	accountValueHistory: History,
	pnlHistory: History,
	perpsPnlHistory: History,
): History {
	if (metric === "accountValue") return accountValueHistory;
	if (metric === "perpsPnl") return perpsPnlHistory;
	return pnlHistory;
}

function formatLatestValue(latestValue: string | null, metric: ChartMetric): string {
	if (latestValue === null) return "—";
	return formatUSD(latestValue, {
		compact: false,
		signDisplay: metric === "accountValue" ? "auto" : "exceptZero",
	});
}

function formatPointLabel(point: ChartPoint): string {
	const date = formatDateTime(point.timestamp, { year: "numeric", month: "long", day: "numeric" });
	const value = formatUSD(point.rawValue, {
		compact: false,
		signDisplay: "exceptZero",
	});
	return `${date} · ${value}`;
}

function ChartTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<Button
			type="button"
			variant="ghost"
			intent="neutral"
			size="xs"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"relative h-10 rounded-none px-2 text-xs font-normal",
				active ? "text-fg after:absolute after:inset-x-1 after:bottom-0 after:h-px after:bg-brand" : "text-fg-muted",
			)}
		>
			{children}
		</Button>
	);
}

function buildChart(history: History, period: PortfolioPeriod | undefined, size: ChartSize): ChartModel {
	const points = parsePoints(history);
	const plotLeft = PLOT_PADDING_LEFT;
	const plotRight = Math.max(plotLeft + 1, size.width - PLOT_PADDING_RIGHT);
	const plotTop = PLOT_PADDING_TOP;
	const plotBottom = Math.max(plotTop + 1, size.height - PLOT_PADDING_BOTTOM);
	if (!points.length) {
		return { path: "", points: [], timeTicks: [], valueTicks: [], plotBottom, plotLeft, plotRight, plotTop };
	}

	const startTime = points[0].timestamp;
	const endTime = points.at(-1)?.timestamp ?? startTime;
	const timeRange = endTime - startTime;
	const plotWidth = plotRight - plotLeft;
	const toX = (timestamp: number) =>
		timeRange === 0 ? plotLeft + plotWidth / 2 : plotLeft + ((timestamp - startTime) / timeRange) * plotWidth;
	const yScale = createYScale(
		points.map((point) => point.value),
		plotTop,
		plotBottom,
	);
	const chartPoints = points.map((point) => ({ ...point, x: toX(point.timestamp), y: yScale.toY(point.value) }));
	const path =
		chartPoints.length < 2
			? ""
			: chartPoints
					.map((point, index) => `${index === 0 ? "M" : "L"}${roundCoordinate(point.x)},${roundCoordinate(point.y)}`)
					.join(" ");
	const resolvedPeriod = period ?? inferPeriod(points);
	const timeTicks = createTimeTicks(startTime, endTime, plotLeft, plotRight, resolvedPeriod);

	return {
		path,
		points: chartPoints,
		timeTicks,
		valueTicks: yScale.ticks,
		plotBottom,
		plotLeft,
		plotRight,
		plotTop,
	};
}

function parsePoints(history: History): ParsedPoint[] {
	return history
		.flatMap(([timestamp, rawValue], sourceIndex) => {
			if (!Number.isSafeInteger(timestamp) || timestamp < 0) return [];
			try {
				const value = Big(rawValue).toNumber();
				if (!Number.isFinite(value)) return [];
				return [{ timestamp, value, rawValue, sourceIndex }];
			} catch {
				return [];
			}
		})
		.sort((first, second) => first.timestamp - second.timestamp || first.sourceIndex - second.sourceIndex);
}

function createYScale(values: number[], plotTop: number, plotBottom: number) {
	const rawMinimum = Math.min(...values, 0);
	const rawMaximum = Math.max(...values, 0);
	let minimum = rawMinimum;
	let maximum = rawMaximum;
	if (minimum === maximum) {
		minimum = -1;
		maximum = 1;
	} else {
		const padding = (maximum - minimum) * 0.08;
		if (minimum < 0) minimum -= padding;
		if (maximum > 0) maximum += padding;
	}

	const step = getNiceStep((maximum - minimum) / 4);
	const niceMinimum = Math.floor(minimum / step) * step;
	const niceMaximum = Math.ceil(maximum / step) * step;
	const range = niceMaximum - niceMinimum || step;
	const decimals = getStepDecimals(step);
	const tickValues: number[] = [];
	for (let index = 0; index <= 12; index += 1) {
		const value = normalizeZero(niceMinimum + step * index, step);
		if (value > niceMaximum + step / 2) break;
		tickValues.push(value);
	}
	if (!tickValues.some((value) => value === 0)) tickValues.push(0);
	tickValues.sort((first, second) => first - second);

	const toY = (value: number) => plotTop + ((niceMaximum - value) / range) * (plotBottom - plotTop);
	return {
		toY,
		ticks: tickValues.map((value) => ({
			value,
			label: formatUSD(value, {
				compact: true,
				minimumFractionDigits: 0,
				maximumFractionDigits: decimals,
			}),
			y: toY(value),
		})),
	};
}

function getNiceStep(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return 1;
	const exponent = Math.floor(Math.log10(value));
	const magnitude = 10 ** exponent;
	const fraction = value / magnitude;
	const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
	return niceFraction * magnitude;
}

function getStepDecimals(step: number): number {
	for (let decimals = 0; decimals <= 20; decimals += 1) {
		const scaledStep = step * 10 ** decimals;
		const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaledStep)) * 4;
		if (Math.abs(scaledStep - Math.round(scaledStep)) <= tolerance) return decimals;
	}
	return 20;
}

function normalizeZero(value: number, step: number): number {
	const rounded = Number(value.toFixed(Math.min(20, getStepDecimals(step) + 2)));
	return Math.abs(rounded) < step / 1_000_000 ? 0 : rounded;
}

function inferPeriod(points: ParsedPoint[]): PortfolioPeriod {
	const startTime = points[0]?.timestamp ?? 0;
	const endTime = points.at(-1)?.timestamp ?? startTime;
	const span = endTime - startTime;
	if (span <= 36 * 60 * 60 * 1000) return "day";
	if (span <= 10 * 24 * 60 * 60 * 1000) return "week";
	if (span <= 45 * 24 * 60 * 60 * 1000) return "month";
	return "allTime";
}

function createTimeTicks(
	startTime: number,
	endTime: number,
	plotLeft: number,
	plotRight: number,
	period: PortfolioPeriod,
): TimeTick[] {
	if (startTime === endTime) {
		return [{ timestamp: startTime, label: formatTimeTick(startTime, period), x: (plotLeft + plotRight) / 2 }];
	}
	const plotWidth = plotRight - plotLeft;
	const count = clamp(Math.floor(plotWidth / TIME_TICK_SPACING) + 1, 2, 5);
	const ticks = Array.from({ length: count }, (_, index) => {
		const ratio = index / (count - 1);
		const timestamp = Math.round(startTime + (endTime - startTime) * ratio);
		return {
			timestamp,
			label: formatTimeTick(timestamp, period),
			x: plotLeft + plotWidth * ratio,
		};
	});
	return ticks.filter((tick, index) => index === 0 || tick.label !== ticks[index - 1].label);
}

function formatTimeTick(timestamp: number, period: PortfolioPeriod): string {
	if (period === "day") {
		return formatTime(timestamp, { hour: "2-digit", minute: "2-digit", hour12: false });
	}
	const date = new Date(timestamp);
	const month = String(date.getMonth() + 1).padStart(2, "0");
	if (period === "allTime") {
		return `${date.getFullYear()}-${month}`;
	}
	return `${month}-${String(date.getDate()).padStart(2, "0")}`;
}

export function findNearestPortfolioPointIndex(
	points: readonly { timestamp: number }[],
	targetTimestamp: number,
): number {
	if (points.length === 0) return -1;

	let lowerBound = 0;
	let upperBound = points.length;
	while (lowerBound < upperBound) {
		const midpoint = lowerBound + Math.floor((upperBound - lowerBound) / 2);
		const point = points[midpoint];
		if (point && point.timestamp < targetTimestamp) lowerBound = midpoint + 1;
		else upperBound = midpoint;
	}

	if (lowerBound === 0) return 0;
	if (lowerBound === points.length) return points.length - 1;
	const pointBefore = points[lowerBound - 1];
	const pointAfter = points[lowerBound];
	if (!pointBefore || !pointAfter) return Math.max(0, lowerBound - 1);
	return targetTimestamp - pointBefore.timestamp <= pointAfter.timestamp - targetTimestamp
		? lowerBound - 1
		: lowerBound;
}

function getTooltipPosition(pointerX: number, pointerY: number, size: ChartSize) {
	const width = Math.min(TOOLTIP_WIDTH, Math.max(0, size.width - TOOLTIP_INSET * 2));
	const left = clamp(pointerX - width / 2, TOOLTIP_INSET, Math.max(TOOLTIP_INSET, size.width - width - TOOLTIP_INSET));
	const above = pointerY - TOOLTIP_GAP - TOOLTIP_HEIGHT;
	const below = pointerY + TOOLTIP_GAP;
	const top =
		above >= TOOLTIP_INSET
			? above
			: clamp(below, TOOLTIP_INSET, Math.max(TOOLTIP_INSET, size.height - TOOLTIP_HEIGHT - TOOLTIP_INSET));
	return { left, top, width };
}

function roundCoordinate(value: number): string {
	return Big(value).round(2).toString();
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
}
