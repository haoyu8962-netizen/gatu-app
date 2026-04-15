import { t } from "@lingui/core/macro";
import { PercentIcon } from "@phosphor-icons/react";
import { Skeleton } from "boneyard-js/react";
import { useConnection } from "wagmi";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/constants";
import { cn } from "@/lib/cn";
import { formatDateTimeShort, formatPercent, formatToken, formatUSD } from "@/lib/format";
import { useMarkets, useSubscription } from "@/lib/hyperliquid";
import { getValueColorClass, toNumber, toNumberOrZero } from "@/lib/trade/numbers";
import { AssetDisplay } from "../components/asset-display";

interface Props {
	className?: string;
}

export function MobileFundingTab({ className }: Props) {
	const { address, isConnected } = useConnection();
	const {
		data: fundingEvent,
		status,
		error,
	} = useSubscription("userFundings", { user: address ?? "0x0" }, { enabled: isConnected && !!address });
	const markets = useMarkets();

	const updates = fundingEvent?.fundings?.slice(0, 200).sort((a, b) => b.time - a.time) ?? [];
	const totalFunding = updates.reduce((acc, f) => acc + toNumberOrZero(f.usdc), 0);
	const headerTotal =
		isConnected && status === "active"
			? formatUSD(totalFunding, { signDisplay: "exceptZero" })
			: FALLBACK_VALUE_PLACEHOLDER;
	const headerClass = getValueColorClass(totalFunding);

	if (!isConnected) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-fg-muted">
				{t`Connect your wallet to view funding payments.`}
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-error">
				<span>{t`Failed to load funding history.`}</span>
				{error instanceof Error && <span className="mt-1 text-xs text-fg-muted">{error.message}</span>}
			</div>
		);
	}

	if (status === "active" && updates.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-fg-muted">
				{t`No funding payments found.`}
			</div>
		);
	}

	return (
		<Skeleton name="funding-tab" loading={status === "subscribing" || status === "idle"}>
			<div className={cn("flex-1 min-h-0 flex flex-col", className)}>
				<div className="px-3 py-2 flex items-center gap-2 text-xs uppercase tracking-wider text-fg-muted">
					<PercentIcon className="size-3" />
					{t`Funding History`}
					<span className={cn("font-semibold ml-auto tabular-nums", headerClass)}>{headerTotal}</span>
				</div>
				<div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2">
					{updates.map((update, index) => {
						const market = markets.getMarket(update.coin);
						const szi = toNumber(update.szi);
						const rate = toNumber(update.fundingRate);
						const usdc = toNumber(update.usdc);
						const positionSize = szi !== null ? Math.abs(szi) : null;
						const isPositivePayment = usdc !== null && usdc >= 0;

						return (
							<div
								key={`${update.coin}-${update.time}-${index}`}
								className="rounded-xs border border-stroke-weak/40 bg-surface overflow-hidden"
							>
								<div className="relative flex items-center justify-between px-3 py-1.5 border-b border-stroke-weak/40">
									<div
										className={cn(
											"absolute left-0 top-0 bottom-0 w-px",
											isPositivePayment ? "bg-market-up" : "bg-market-down",
										)}
									/>
									<AssetDisplay coin={update.coin} nameClassName="text-sm font-semibold" />
									<div className={cn("text-xs font-medium tabular-nums", getValueColorClass(usdc))}>
										{formatToken(usdc, { symbol: "USDC" })}
									</div>
								</div>

								<div className="grid grid-cols-3 divide-x divide-stroke-weak/40">
									<MetricCell
										label={t`Position`}
										value={formatToken(positionSize, { decimals: market?.szDecimals, symbol: market?.shortName })}
									/>
									<MetricCell
										label={t`Rate`}
										value={formatPercent(rate, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
										valueClass={rate !== null ? getValueColorClass(rate) : undefined}
									/>
									<MetricCell label={t`Time`} value={formatDateTimeShort(update.time)} />
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</Skeleton>
	);
}

interface MetricCellProps {
	label: string;
	value: string;
	valueClass?: string;
}

function MetricCell({ label, value, valueClass }: MetricCellProps) {
	return (
		<div className="px-2.5 py-1.5">
			<div className="text-xs text-fg-muted">{label}</div>
			<div className={cn("text-xs tabular-nums font-medium", valueClass)}>{value}</div>
		</div>
	);
}
