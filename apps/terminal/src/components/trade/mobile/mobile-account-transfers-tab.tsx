import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ArrowSquareOutIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { Skeleton } from "boneyard-js/react";
import { useAccountLedger } from "@/hooks/trade/use-account-ledger";
import { useAccountLedgerCsv } from "@/hooks/trade/use-account-ledger-csv";
import { useAccountLedgerLabels } from "@/hooks/trade/use-account-ledger-labels";
import { cn } from "@/lib/cn";
import { formatDateTimeShort } from "@/lib/format";
import { formatAccountLedgerAmount, formatAccountLedgerFee } from "@/lib/trade/account-ledger-format";
import { getAccountLedgerExplorerUrl } from "@/lib/trade/account-ledger-links";
import { isIncompleteHistorySnapshotError } from "@/lib/trade/history-pagination";
import { toNumber } from "@/lib/trade/numbers";
import { getValueColorClass } from "@/lib/ui/value-color";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { MetricCell } from "./metric-cell";
import type { MobileDataScrollMode } from "./mobile-positions-view";

interface Props {
	className?: string;
	scrollMode?: MobileDataScrollMode;
}

export function MobileAccountTransfersTab({ className, scrollMode = "contained" }: Props) {
	const { t } = useLingui();
	const { error, isConnected, retry, rows, status } = useAccountLedger();
	const { getActionLabel, getLocationLabel } = useAccountLedgerLabels();
	const { exportCsv, isExporting } = useAccountLedgerCsv();
	const isTestnet = useIsTestnet();
	const isPageScroll = scrollMode === "page";
	const historyLimitReached = isIncompleteHistorySnapshotError(error);
	const emptyStateExportFooter = (
		<div className="flex h-[38px] shrink-0 items-center justify-end px-3">
			<Button
				variant="ghost"
				intent="neutral"
				size="xxs"
				disabled={isExporting}
				onClick={() => void exportCsv()}
				aria-label={t`Export CSV`}
			>
				<DownloadSimpleIcon className={cn("size-3.5", isExporting && "animate-pulse")} aria-hidden="true" />
			</Button>
		</div>
	);

	if (!isConnected) {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-muted">
				{t`Connect your wallet to view deposits and withdrawals.`}
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className={cn("flex flex-1 min-h-0 flex-col", className)}>
				<div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-error">
					<span>{t`Failed to load deposits and withdrawals.`}</span>
					{historyLimitReached ? (
						<span className="text-xs text-fg-muted">
							{t`Recent history exceeds the safe display limit. Export CSV to retrieve a larger range.`}
						</span>
					) : (
						<Button variant="outline" intent="neutral" size="xs" onClick={retry}>
							{t`Retry`}
						</Button>
					)}
				</div>
				{emptyStateExportFooter}
			</div>
		);
	}

	if (status === "ready" && rows.length === 0) {
		return (
			<div className={cn("flex flex-1 min-h-0 flex-col", className)}>
				<div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-muted">
					{t`No deposits or withdrawals found.`}
				</div>
				{emptyStateExportFooter}
			</div>
		);
	}

	return (
		<Skeleton name="account-transfers-tab" loading={status === "loading" || status === "idle"}>
			<div className={cn(isPageScroll ? "min-h-0 flex flex-col" : "flex-1 min-h-0 flex flex-col", className)}>
				<div className="flex items-center gap-2 px-3 py-2 text-xs text-fg-muted">
					<span className="uppercase tracking-wider">{t`Deposits & Withdrawals`}</span>
					<span className="ml-auto tabular-nums text-brand">{rows.length}</span>
					<Button
						variant="ghost"
						intent="neutral"
						size="xxs"
						disabled={isExporting}
						onClick={() => void exportCsv()}
						aria-label={t`Export CSV`}
					>
						<DownloadSimpleIcon className={cn("size-3.5", isExporting && "animate-pulse")} aria-hidden="true" />
					</Button>
				</div>
				<div className={cn("space-y-2 px-3 pb-3", !isPageScroll && "min-h-0 flex-1 overflow-y-auto")}>
					{rows.map((row) => {
						const amount = toNumber(row.amount);
						const explorerUrl = getAccountLedgerExplorerUrl(row, isTestnet);

						return (
							<div key={row.id} className="overflow-hidden rounded-xs border border-stroke-weak bg-surface">
								<div className="flex items-center justify-between border-b border-stroke-weak px-3 py-1.5">
									<div className="min-w-0">
										<p className="truncate text-xs font-medium text-fg">{getActionLabel(row.action, row.rawType)}</p>
										<p className="text-3xs text-success">{t`Completed`}</p>
									</div>
									<span
										className={cn(
											"shrink-0 text-xs font-medium tabular-nums",
											amount !== null && getValueColorClass(amount),
										)}
									>
										{formatAccountLedgerAmount(row)}
									</span>
								</div>
								<div className="grid grid-cols-3 divide-x divide-stroke-weak">
									<MetricCell label={t`Source`} value={getLocationLabel(row.source)} />
									<MetricCell label={t`Destination`} value={getLocationLabel(row.destination)} />
									<MetricCell
										label={t`Fee`}
										value={formatAccountLedgerFee(row)}
										valueClass={row.fee ? "text-error" : undefined}
									/>
								</div>
								<div className="flex items-center justify-between px-3 py-1.5">
									<span className="text-xs tabular-nums text-fg-muted">{formatDateTimeShort(row.time)}</span>
									{explorerUrl ? (
										<a
											href={explorerUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex min-h-6 items-center gap-1 text-xs text-fg-muted hover:text-fg active:text-fg"
										>
											{t`Explorer`}
											<ArrowSquareOutIcon className="size-3" aria-hidden="true" />
										</a>
									) : null}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</Skeleton>
	);
}
