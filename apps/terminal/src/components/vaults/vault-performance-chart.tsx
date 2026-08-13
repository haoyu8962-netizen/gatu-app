import { Trans, useLingui } from "@lingui/react/macro";
import Big from "big.js";
import { cn } from "@/lib/cn";
import {
	formatVaultUsd,
	getLatestVaultHistoryValue,
	getVaultValueTone,
	type VaultPortfolioSnapshot,
} from "./domain/vaults";

interface VaultPerformanceChartProps {
	snapshot: VaultPortfolioSnapshot;
	kind: "accountValue" | "pnl";
	compact?: boolean;
}

export function VaultPerformanceChart({ snapshot, kind, compact = false }: VaultPerformanceChartProps) {
	const { t } = useLingui();
	const history = kind === "accountValue" ? snapshot.accountValueHistory : snapshot.pnlHistory;
	const latest = getLatestVaultHistoryValue(snapshot, kind);
	const tone = kind === "pnl" ? getVaultValueTone(latest) : "neutral";
	const path = createChartPath(history.map((point) => point.value));
	const label = kind === "accountValue" ? t`Account value` : t`PNL`;

	return (
		<figure
			className={cn("relative w-full overflow-hidden", compact ? "h-9" : "h-52 min-[1001px]:h-64")}
			aria-label={t`${label} history`}
		>
			{compact ? null : (
				<figcaption className="absolute top-3 left-3 z-10">
					<p className="text-2xs text-fg-muted">{label}</p>
					<p
						className={cn(
							"mt-0.5 text-base font-bold tabular-nums",
							tone === "positive" ? "text-success" : tone === "negative" ? "text-error" : "text-fg",
						)}
					>
						{formatVaultUsd(latest)}
					</p>
				</figcaption>
			)}
			{path ? (
				<svg
					role="img"
					aria-label={t`${label} trend`}
					viewBox="0 0 100 36"
					preserveAspectRatio="none"
					className={cn(
						"size-full",
						tone === "positive" ? "text-success" : tone === "negative" ? "text-error" : "text-brand",
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
export function createChartPath(values: readonly string[]): string | null {
	if (values.length < 2) return null;
	let parsed: Big[];
	try {
		parsed = values.map((value) => Big(value));
	} catch {
		return null;
	}
	let minimum = parsed[0];
	let maximum = parsed[0];
	for (const value of parsed.slice(1)) {
		if (value.lt(minimum)) minimum = value;
		if (value.gt(maximum)) maximum = value;
	}
	const range = maximum.minus(minimum);
	const denominator = Big(values.length - 1);
	return parsed
		.map((value, index) => {
			const x = Big(index).times(100).div(denominator).toNumber();
			const normalized = range.eq(0) ? Big("0.5") : value.minus(minimum).div(range);
			const y = Big(34).minus(normalized.times(32)).toNumber();
			return `${index === 0 ? "M" : "L"}${roundCoordinate(x)} ${roundCoordinate(y)}`;
		})
		.join(" ");
}

function roundCoordinate(value: number): string {
	return Big(value).round(3).toString();
}
