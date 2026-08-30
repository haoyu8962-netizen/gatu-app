import { Trans, useLingui } from "@lingui/react/macro";
import Big from "big.js";
import { cn } from "@/lib/cn";
import {
	formatVaultSignedUsd,
	formatVaultUsd,
	getLatestVaultHistoryValue,
	getVaultValueTone,
	type VaultPeriod,
	type VaultPortfolioSnapshot,
} from "./domain/vaults";

interface VaultPerformanceChartProps {
	snapshot: VaultPortfolioSnapshot;
	kind: "accountValue" | "pnl";
	period: VaultPeriod;
	compact?: boolean;
}

export function VaultPerformanceChart({ snapshot, kind, period, compact = false }: VaultPerformanceChartProps) {
	const { t } = useLingui();
	const history = kind === "accountValue" ? snapshot.accountValueHistory : snapshot.pnlHistory;
	const latest = getLatestVaultHistoryValue(snapshot, kind);
	const tone = kind === "pnl" ? getVaultValueTone(latest) : "neutral";
	const path = createChartPath(history);
	const label = kind === "accountValue" ? t`Account value` : t`PNL`;
	const periodLabel =
		period === "day" ? t`24 hours` : period === "week" ? t`7 days` : period === "month" ? t`30 days` : t`all time`;
	const direction = tone === "positive" ? t`Positive PNL` : tone === "negative" ? t`Negative PNL` : t`PNL is zero`;
	const latestValue = kind === "pnl" ? formatVaultSignedUsd(latest) : formatVaultUsd(latest);
	const accessibleLabel = path
		? kind === "pnl"
			? t`${label} over ${periodLabel}. Latest value ${latestValue}. ${direction}.`
			: t`${label} over ${periodLabel}. Latest value ${latestValue}.`
		: t`${label} over ${periodLabel}. No performance history.`;

	return (
		<figure
			role="img"
			className={cn("relative w-full overflow-hidden", compact ? "h-9" : "h-52 min-[1001px]:h-64")}
			aria-label={accessibleLabel}
		>
			{compact ? null : (
				<figcaption className="absolute top-3 left-3 z-10">
					<p className="text-2xs text-fg-muted">{label}</p>
					<p
						className={cn(
							"mt-0.5 text-base font-bold tabular-nums",
							tone === "positive" ? "text-market-up" : tone === "negative" ? "text-market-down" : "text-fg",
						)}
					>
						{latestValue}
					</p>
				</figcaption>
			)}
			{path ? (
				<svg
					aria-hidden="true"
					focusable="false"
					viewBox="0 0 100 36"
					preserveAspectRatio="none"
					className={cn(
						"size-full",
						tone === "positive" ? "text-market-up" : tone === "negative" ? "text-market-down" : "text-chart-accent",
					)}
				>
					{compact ? null : (
						<g className="text-stroke-weak">
							<path d="M0 9 H100 M0 18 H100 M0 27 H100" stroke="currentColor" strokeWidth="0.3" />
						</g>
					)}
					<path
						d={path}
						fill="none"
						stroke="currentColor"
						strokeWidth={compact ? 1.5 : 1}
						vectorEffect="non-scaling-stroke"
						strokeLinejoin="round"
						strokeLinecap="round"
					/>
				</svg>
			) : (
				<div className="grid size-full place-items-center text-xs text-fg-muted">
					<Trans>No performance history</Trans>
				</div>
			)}
		</figure>
	);
}

/** Financial inputs remain decimal strings until this chart-rendering boundary. */
export function createChartPath(points: readonly { timestamp: number; value: string }[]): string | null {
	if (points.length < 2) return null;
	let parsed: Big[];
	try {
		parsed = points.map((point) => Big(point.value));
	} catch {
		return null;
	}
	if (points.some((point) => !Number.isSafeInteger(point.timestamp) || point.timestamp < 0)) return null;
	const startTime = Big(points[0].timestamp);
	const endTime = Big(points[points.length - 1].timestamp);
	const timeRange = endTime.minus(startTime);
	if (timeRange.lte(0)) return null;
	let minimum = parsed[0];
	let maximum = parsed[0];
	for (const value of parsed.slice(1)) {
		if (value.lt(minimum)) minimum = value;
		if (value.gt(maximum)) maximum = value;
	}
	const range = maximum.minus(minimum);
	return parsed
		.map((value, index) => {
			const x = Big(points[index].timestamp).minus(startTime).times(100).div(timeRange).toNumber();
			const normalized = range.eq(0) ? Big("0.5") : value.minus(minimum).div(range);
			const y = Big(34).minus(normalized.times(32)).toNumber();
			return `${index === 0 ? "M" : "L"}${roundCoordinate(x)} ${roundCoordinate(y)}`;
		})
		.join(" ");
}

function roundCoordinate(value: number): string {
	return Big(value).round(3).toString();
}
