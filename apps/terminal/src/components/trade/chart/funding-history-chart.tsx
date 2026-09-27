import { useLingui } from "@lingui/react/macro";
import { type PointerEvent, useId, useLayoutEffect, useRef, useState } from "react";
import {
	type FundingHistoryRange,
	type FundingRateBucket,
	getFundingRateTone,
	summarizeFundingRateBuckets,
} from "@/domain/market/funding-rate-history";
import {
	formatFundingBucketLabels,
	formatFundingChartAxisLabels,
	formatFundingSummaryLabels,
} from "@/lib/chart/funding-history-chart-labels";
import {
	buildFundingHistoryChartModel,
	type FundingChartSize,
	findNearestFundingPointIndex,
	getFundingTooltipLeft,
} from "@/lib/chart/funding-history-chart-model";
import { cn } from "@/lib/cn";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";

interface Props {
	buckets: readonly FundingRateBucket[];
	range: FundingHistoryRange;
}

interface HoverState {
	buckets: readonly FundingRateBucket[];
	index: number;
}

const DEFAULT_CHART_SIZE: FundingChartSize = { height: 240, width: 640 };
const MIN_CHART_WIDTH = 200;
const MIN_CHART_HEIGHT = 120;
const TOOLTIP_WIDTH = 208;
const TONE_CLASS = { down: "text-market-down", neutral: "text-fg", up: "text-market-up" } as const;

export function FundingHistoryChart({ buckets, range }: Props) {
	const numberFormatRevision = useNumberFormatRevision();
	const { i18n, t } = useLingui();
	const plotRef = useRef<HTMLDivElement>(null);
	const gradientId = `funding-rate-${useId().replace(/[^\w-]/g, "")}`;
	const summaryId = useId();
	const [size, setSize] = useState<FundingChartSize>(DEFAULT_CHART_SIZE);
	const [hover, setHover] = useState<HoverState | null>(null);
	const model = buildFundingHistoryChartModel(buckets, size);
	const axisLabels = formatFundingChartAxisLabels(model, range, i18n.locale, numberFormatRevision);
	const summary = summarizeFundingRateBuckets(buckets);
	const summaryLabels = summary ? formatFundingSummaryLabels(summary, range, i18n.locale, numberFormatRevision) : null;
	const activeIndex = hover?.buckets === buckets ? hover.index : -1;
	const activeBucket = buckets[activeIndex];
	const activePoint = model.points[activeIndex];
	const activeLabels = activeBucket
		? formatFundingBucketLabels(activeBucket, range, i18n.locale, numberFormatRevision)
		: null;
	const activeTone = activeBucket ? TONE_CLASS[getFundingRateTone(activeBucket.rate)] : TONE_CLASS.neutral;
	const lastTimeTickIndex = axisLabels.timeTicks.length - 1;

	useLayoutEffect(() => {
		const plot = plotRef.current;
		if (!plot) return;
		const plotElement = plot;

		function updateSize() {
			const rect = plotElement.getBoundingClientRect();
			const nextSize = {
				height: Math.max(MIN_CHART_HEIGHT, Math.round(rect.height)),
				width: Math.max(MIN_CHART_WIDTH, Math.round(rect.width)),
			};
			setSize((current) =>
				current.width === nextSize.width && current.height === nextSize.height ? current : nextSize,
			);
		}

		updateSize();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(updateSize);
		observer.observe(plotElement);
		return () => observer.disconnect();
	}, []);

	function updateHover(event: PointerEvent<HTMLDivElement>) {
		if (model.points.length === 0) return;
		const rect = event.currentTarget.getBoundingClientRect();
		const x = ((event.clientX - rect.left) * size.width) / Math.max(rect.width, 1);
		setHover({ buckets, index: findNearestFundingPointIndex(model.points, x) });
	}

	function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
		if (event.pointerType === "touch") updateHover(event);
	}

	function handlePointerLeave(event: PointerEvent<HTMLDivElement>) {
		if (event.pointerType !== "touch") setHover(null);
	}

	function handlePointerCancel() {
		setHover(null);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			{summaryLabels && (
				<FundingHistorySummary
					id={summaryId}
					startTime={summaryLabels.startTime}
					endTime={summaryLabels.endTime}
					latestRate={summaryLabels.latestRate}
					cumulativeRate={summaryLabels.cumulativeRate}
					maxRate={summaryLabels.maxRate}
					minRate={summaryLabels.minRate}
				/>
			)}
			<div
				ref={plotRef}
				role="img"
				dir="ltr"
				aria-label={t`Funding rate history`}
				aria-describedby={summaryLabels ? summaryId : undefined}
				data-funding-history-plot
				className="relative min-h-0 flex-1 cursor-crosshair touch-pan-y overflow-hidden"
				onPointerCancel={handlePointerCancel}
				onPointerDown={handlePointerDown}
				onPointerLeave={handlePointerLeave}
				onPointerMove={updateHover}
			>
				<svg
					aria-hidden="true"
					focusable="false"
					viewBox={`0 0 ${size.width} ${size.height}`}
					preserveAspectRatio="none"
					className="absolute inset-0 size-full"
				>
					<defs>
						<linearGradient
							id={gradientId}
							gradientUnits="userSpaceOnUse"
							x1="0"
							x2="0"
							y1={model.plotTop}
							y2={model.plotBottom}
						>
							<stop offset="0" stopColor="currentColor" className="text-market-up" />
							<stop offset={model.zeroOffset} stopColor="currentColor" className="text-market-up" />
							<stop offset={model.zeroOffset} stopColor="currentColor" className="text-market-down" />
							<stop offset="1" stopColor="currentColor" className="text-market-down" />
						</linearGradient>
					</defs>
					{model.rateTicks.map((tick, index) => (
						<g key={tick.y} data-funding-y-tick={tick.value}>
							<line
								x1={model.plotLeft}
								x2={model.plotRight}
								y1={tick.y}
								y2={tick.y}
								className={tick.value === 0 ? "stroke-stroke-strong" : "stroke-stroke-weak"}
								strokeDasharray={tick.value === 0 ? "3 3" : undefined}
								strokeWidth="1"
								vectorEffect="non-scaling-stroke"
								data-zero-line={tick.value === 0 ? "true" : undefined}
							/>
							<text
								x={model.plotLeft - 6}
								y={tick.y}
								textAnchor="end"
								dominantBaseline="middle"
								className="fill-fg-muted text-3xs tabular-nums"
								data-funding-rate-tick
							>
								{axisLabels.rateTicks[index]}
							</text>
							<text
								x={model.plotRight + 6}
								y={tick.y}
								textAnchor="start"
								dominantBaseline="middle"
								className="fill-fg-muted text-3xs tabular-nums"
								data-funding-cumulative-tick
							>
								{axisLabels.cumulativeTicks[index]}
							</text>
						</g>
					))}
					{axisLabels.timeTicks.map((tick, index) => (
						<text
							key={tick.time}
							x={tick.x}
							y={model.plotBottom + 15}
							textAnchor={getTimeTickAnchor(index, lastTimeTickIndex)}
							className="fill-fg-muted text-3xs tabular-nums"
							data-funding-time-tick={tick.time}
						>
							{tick.label}
						</text>
					))}
					{model.cumulativePath && (
						<path
							d={model.cumulativePath}
							fill="none"
							stroke="currentColor"
							strokeWidth="1.25"
							strokeLinejoin="round"
							vectorEffect="non-scaling-stroke"
							className="text-fg-muted"
							data-funding-cumulative-path
						/>
					)}
					{model.ratePath && (
						<path
							d={model.ratePath}
							fill="none"
							stroke={`url(#${gradientId})`}
							strokeWidth="1.5"
							strokeLinejoin="round"
							vectorEffect="non-scaling-stroke"
							data-funding-rate-path
						/>
					)}
					{model.points.length === 1 && (
						<>
							<circle
								cx={model.points[0].x}
								cy={model.points[0].cumulativeY}
								r="2.5"
								fill="currentColor"
								className="text-fg-muted"
							/>
							<circle
								cx={model.points[0].x}
								cy={model.points[0].rateY}
								r="2.5"
								fill="currentColor"
								className={TONE_CLASS[getFundingRateTone(buckets[0]?.rate ?? "0")]}
							/>
						</>
					)}
					{activePoint && (
						<>
							<line
								x1={activePoint.x}
								x2={activePoint.x}
								y1={model.plotTop}
								y2={model.plotBottom}
								className="stroke-stroke-strong"
								strokeDasharray="3 3"
								strokeWidth="1"
								vectorEffect="non-scaling-stroke"
								data-funding-crosshair
							/>
							<circle
								cx={activePoint.x}
								cy={activePoint.cumulativeY}
								r="3"
								strokeWidth="1.5"
								className="fill-surface stroke-fg-muted"
							/>
							<circle
								cx={activePoint.x}
								cy={activePoint.rateY}
								r="3"
								stroke="currentColor"
								strokeWidth="1.5"
								className={cn("fill-surface", activeTone)}
							/>
						</>
					)}
				</svg>
				{activeLabels && activePoint && (
					<div
						data-funding-history-tooltip
						className="pointer-events-none absolute z-10 w-52 space-y-1 rounded-16 border border-stroke-weak bg-overlay px-2.5 py-2 text-2xs shadow-raised"
						style={{
							left: getFundingTooltipLeft(activePoint.x, TOOLTIP_WIDTH, size.width),
							top: model.plotTop,
						}}
					>
						<div className="tabular-nums text-fg-muted">{activeLabels.time}</div>
						<div className="flex items-baseline justify-between gap-3">
							<span className="min-w-0 text-fg-muted">{t`Funding Rate`}</span>
							<span className={cn("shrink-0 font-medium tabular-nums", activeTone)}>{activeLabels.rate}</span>
						</div>
						<div className="flex items-baseline justify-between gap-3">
							<span className="min-w-0 text-fg-muted">{t`Cumulative Funding Rate`}</span>
							<span className="shrink-0 font-medium tabular-nums text-fg">{activeLabels.cumulativeRate}</span>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function FundingHistorySummary({
	id,
	startTime,
	endTime,
	latestRate,
	cumulativeRate,
	maxRate,
	minRate,
}: {
	id: string;
	startTime: string;
	endTime: string;
	latestRate: string;
	cumulativeRate: string;
	maxRate: string;
	minRate: string;
}) {
	const { t } = useLingui();

	return (
		<p id={id} className="sr-only" data-funding-history-summary>
			{t`From ${startTime} to ${endTime}. Latest funding rate ${latestRate}; cumulative funding rate ${cumulativeRate}. Highest ${maxRate}; lowest ${minRate}.`}
		</p>
	);
}

function getTimeTickAnchor(index: number, lastIndex: number): "end" | "middle" | "start" {
	if (lastIndex === 0) return "middle";
	if (index === 0) return "start";
	if (index === lastIndex) return "end";
	return "middle";
}
