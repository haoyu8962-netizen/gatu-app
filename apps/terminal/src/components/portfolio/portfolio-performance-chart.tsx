import { Button } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import type { PortfolioSnapshot } from "@/domain/portfolio";
import { cn } from "@/lib/cn";
import { formatUSD } from "@/lib/format";

type ChartMetric = "accountValue" | "pnl" | "perpsPnl";
type History = PortfolioSnapshot["pnlHistory"];

interface Props {
	accountValueHistory: History;
	pnlHistory: History;
	perpsPnlHistory: History;
	isLoading: boolean;
	isUnavailable: boolean;
	onRetry: () => void;
}

const VIEWBOX_WIDTH = 640;
const VIEWBOX_HEIGHT = 214;
const CHART_PADDING_X = 18;
const CHART_PADDING_Y = 18;

export function PortfolioPerformanceChart({
	accountValueHistory,
	pnlHistory,
	perpsPnlHistory,
	isLoading,
	isUnavailable,
	onRetry,
}: Props) {
	const { t } = useLingui();
	const [metric, setMetric] = useState<ChartMetric>("pnl");
	const history = selectHistory(metric, accountValueHistory, pnlHistory, perpsPnlHistory);
	const chart = useMemo(() => buildChart(history), [history]);
	const latestValue = history.at(-1)?.[1] ?? null;
	const formattedLatestValue = formatLatestValue(latestValue, metric);

	return (
		<section
			className="flex h-60 flex-col overflow-hidden rounded-12 bg-surface min-[1001px]:h-[249px]"
			aria-label={t`Portfolio performance`}
			aria-busy={isLoading}
		>
			<div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-stroke-weak px-3">
				<div className="flex min-w-0 items-center gap-1">
					<ChartTab active={metric === "accountValue"} onClick={() => setMetric("accountValue")}>
						<Trans>Account Value</Trans>
					</ChartTab>
					<ChartTab active={metric === "pnl"} onClick={() => setMetric("pnl")}>
						<Trans>PNL</Trans>
					</ChartTab>
					<ChartTab active={metric === "perpsPnl"} onClick={() => setMetric("perpsPnl")}>
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
				) : (
					<svg
						viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
						className="h-full min-h-40 w-full overflow-visible text-brand"
						role="img"
						aria-label={t`Portfolio history chart`}
						preserveAspectRatio="none"
					>
						<title>{t`Portfolio history`}</title>
						<line
							x1={CHART_PADDING_X}
							y1={chart.zeroY}
							x2={VIEWBOX_WIDTH - CHART_PADDING_X}
							y2={chart.zeroY}
							className="stroke-stroke-weak"
							strokeWidth="1"
							vectorEffect="non-scaling-stroke"
						/>
						{chart.path ? (
							<path
								d={chart.path}
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinejoin="round"
								strokeLinecap="round"
								vectorEffect="non-scaling-stroke"
							/>
						) : null}
					</svg>
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

function buildChart(history: History): { path: string; zeroY: number } {
	const values = history.map(([, value]) => Number(value)).filter((value) => Number.isFinite(value));
	if (!values.length) {
		return { path: "", zeroY: VIEWBOX_HEIGHT - CHART_PADDING_Y };
	}

	const rawMin = Math.min(...values, 0);
	const rawMax = Math.max(...values, 0);
	const span = rawMax - rawMin || Math.max(Math.abs(rawMax), 1);
	const min = rawMin - span * 0.08;
	const max = rawMax + span * 0.08;
	const range = max - min;
	const chartWidth = VIEWBOX_WIDTH - CHART_PADDING_X * 2;
	const chartHeight = VIEWBOX_HEIGHT - CHART_PADDING_Y * 2;
	const toY = (value: number) => CHART_PADDING_Y + ((max - value) / range) * chartHeight;
	const denominator = Math.max(values.length - 1, 1);
	const path = values
		.map((value, index) => {
			const x = CHART_PADDING_X + (index / denominator) * chartWidth;
			return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${toY(value).toFixed(2)}`;
		})
		.join(" ");

	return { path, zeroY: toY(0) };
}
