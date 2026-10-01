import { useLingui } from "@lingui/react/macro";
import { Button } from "@sairn/ui";
import { useState } from "react";
import { TOUCH_PRESS_CLASS } from "@/components/ui/touch-press";
import { isFundingHistoryMarket } from "@/domain/market/funding-history-market";
import {
	DEFAULT_FUNDING_HISTORY_RANGE,
	FUNDING_HISTORY_RANGE_ORDER,
	type FundingHistoryRange,
	type FundingRateBucket,
} from "@/domain/market/funding-rate-history";
import { type MarketFundingHistoryStatus, useMarketFundingHistory } from "@/hooks/trade/use-market-funding-history";
import { cn } from "@/lib/cn";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { getMarketApiCoin } from "@/lib/hyperliquid/market-identity";
import { FundingHistoryChart } from "./funding-history-chart";

interface Props {
	active: boolean;
	market: UnifiedMarketInfo | undefined;
}

export function FundingHistoryPanel({ active, market }: Props) {
	const { t } = useLingui();
	const [range, setRange] = useState<FundingHistoryRange>(DEFAULT_FUNDING_HISTORY_RANGE);
	const supported = isFundingHistoryMarket(market);
	const history = useMarketFundingHistory({
		coin: supported ? getMarketApiCoin(market) : "",
		enabled: active && supported,
		range,
	});
	const rangeLabels: Record<FundingHistoryRange, string> = {
		"1h": t({ message: "1h", context: "Funding history range" }),
		"8h": t({ message: "8h", context: "Funding history range" }),
		"1d": t({ message: "D", context: "Funding history range" }),
	};

	return (
		<div data-funding-history-panel data-status={history.status} className="flex h-full min-h-0 flex-col bg-surface">
			<div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1.5">
				<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-fg-muted">
					<span className="flex min-w-0 items-center gap-1.5">
						<span aria-hidden="true" className="flex h-0.5 w-3 shrink-0 overflow-hidden rounded-full">
							<span className="flex-1 bg-market-up" />
							<span className="flex-1 bg-market-down" />
						</span>
						<span className="truncate">{t`Funding Rate`}</span>
					</span>
					<span className="flex min-w-0 items-center gap-1.5">
						<span aria-hidden="true" className="h-0.5 w-3 shrink-0 rounded-full bg-fg-muted" />
						<span className="truncate">{t`Cumulative Funding Rate`}</span>
					</span>
				</div>
				<fieldset
					aria-label={t`Funding history interval`}
					className="m-0 flex shrink-0 items-center gap-0.5 border-0 p-0"
				>
					{FUNDING_HISTORY_RANGE_ORDER.map((value) => (
						<button
							key={value}
							type="button"
							aria-pressed={range === value}
							data-funding-history-range={value}
							onClick={() => setRange(value)}
							className={cn(
								"relative min-w-8 rounded-8 px-2 py-1 text-xs font-medium tabular-nums",
								"max-[1000px]:after:absolute max-[1000px]:after:top-1/2 max-[1000px]:after:left-0 max-[1000px]:after:h-11 max-[1000px]:after:w-full max-[1000px]:after:-translate-y-1/2 max-[1000px]:after:content-['']",
								"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
								TOUCH_PRESS_CLASS,
								range === value ? "bg-fill-weak text-fg" : "text-fg-muted hover:text-fg",
							)}
						>
							{rangeLabels[value]}
						</button>
					))}
				</fieldset>
			</div>
			<div aria-busy={history.status === "loading"} data-funding-history-body className="relative min-h-0 flex-1">
				<FundingHistoryBody status={history.status} buckets={history.buckets} range={range} onRetry={history.refresh} />
			</div>
		</div>
	);
}

function FundingHistoryBody({
	status,
	buckets,
	range,
	onRetry,
}: {
	status: MarketFundingHistoryStatus;
	buckets: readonly FundingRateBucket[];
	range: FundingHistoryRange;
	onRetry: () => void;
}) {
	const { t } = useLingui();

	if (status === "ready" && buckets.length > 0) return <FundingHistoryChart buckets={buckets} range={range} />;
	if (status === "ready") {
		return (
			<p className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-fg-muted">
				{t`No funding history`}
			</p>
		);
	}
	if (status === "error") {
		return (
			<div className="absolute inset-0 grid place-items-center">
				<Button type="button" variant="outline" intent="neutral" size="xs" onClick={onRetry}>
					{t`Retry`}
				</Button>
			</div>
		);
	}
	if (status === "loading") return <span className="sr-only">{t`Loading...`}</span>;
	return null;
}
