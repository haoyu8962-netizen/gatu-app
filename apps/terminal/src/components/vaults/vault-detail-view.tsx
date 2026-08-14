import { Button } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowLeftIcon, ArrowSquareOutIcon, LockKeyIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { shortenAddress } from "@/lib/format";
import { getExplorerAddressUrl } from "@/lib/hyperliquid";
import {
	formatVaultCompactUsd,
	formatVaultRatio,
	formatVaultUsd,
	getLatestVaultHistoryValue,
	getVaultValueTone,
	type VaultDetail,
	type VaultOwnerViewState,
	type VaultPeriod,
} from "./domain/vaults";
import { VaultPerformanceChart } from "./vault-performance-chart";

export type VaultRequestedAction = "deposit" | "withdraw";

export interface VaultDetailViewProps {
	detail: VaultDetail;
	owner: VaultOwnerViewState;
	isTestnet: boolean;
	isRefreshing?: boolean;
	onRetryOwner?: () => void;
	onRequestAction?: (action: VaultRequestedAction) => void;
}

export function VaultDetailView({
	detail,
	owner,
	isTestnet,
	isRefreshing = false,
	onRetryOwner,
	onRequestAction,
}: VaultDetailViewProps) {
	const { t, i18n } = useLingui();
	const riskTitleId = useId();
	const [period, setPeriod] = useState<VaultPeriod>("month");
	const [chartKind, setChartKind] = useState<"accountValue" | "pnl">("accountValue");
	const snapshot = detail.portfolio[period];
	const totalValue = getLatestVaultHistoryValue(snapshot, "accountValue");
	const periodPnl = getLatestVaultHistoryValue(snapshot, "pnl");
	const pnlTone = getVaultValueTone(periodPnl);
	const ownerEquity = owner.status === "ready" ? owner.equity : null;
	const ownerPnl = owner.status === "ready" ? owner.allTimePnl : null;
	const ownerPnlTone = getVaultValueTone(ownerPnl);
	const canDeposit = Boolean(onRequestAction) && !detail.isClosed && detail.allowDeposits;
	const canWithdraw = Boolean(onRequestAction) && owner.status === "ready" && owner.canWithdraw;

	return (
		<article
			className="overflow-hidden rounded-12 bg-surface shadow-raised"
			data-state="normal"
			data-vault-detail-state="normal"
		>
			<header className="flex flex-wrap items-start justify-between gap-4 border-b border-stroke-weak px-4 py-4 min-[1001px]:px-5">
				<div className="min-w-0">
					<Link to="/vaults" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
						<ArrowLeftIcon className="size-3.5" />
						<Trans>Vaults</Trans>
					</Link>
					<h1 className="mt-1 break-words text-xl font-bold text-fg min-[1001px]:text-2xl">{detail.name}</h1>
					<p className="mt-1 font-mono text-2xs tabular-nums text-fg-muted">{detail.vaultAddress}</p>
				</div>
				<div className="flex w-full gap-2 min-[1001px]:w-auto">
					<Button
						className="flex-1 min-[1001px]:flex-none"
						disabled={!canDeposit || isRefreshing}
						onClick={() => onRequestAction?.("deposit")}
					>
						<Trans>Deposit</Trans>
					</Button>
					<Button
						className="flex-1 min-[1001px]:flex-none"
						variant="outline"
						intent="neutral"
						disabled={!canWithdraw || isRefreshing}
						onClick={() => onRequestAction?.("withdraw")}
					>
						<Trans>Withdraw</Trans>
					</Button>
				</div>
			</header>

			<div className="grid grid-cols-2 gap-2 px-4 py-3 min-[1001px]:grid-cols-4 min-[1001px]:px-5">
				<SummaryMetric label={<Trans>Vault value</Trans>} value={formatVaultCompactUsd(totalValue)} />
				<SummaryMetric label={<Trans>APR</Trans>} value={formatVaultRatio(detail.apr, 2, true)} />
				<SummaryMetric label={<Trans>Your equity</Trans>} value={formatVaultUsd(ownerEquity)} />
				<SummaryMetric label={<Trans>Your all-time PNL</Trans>} value={formatVaultUsd(ownerPnl)} tone={ownerPnlTone} />
			</div>

			{owner.status === "ready" && getVaultValueTone(owner.equity) !== "neutral" ? (
				<section
					className="mx-4 mb-3 rounded-12 border border-stroke-weak p-3 min-[1001px]:mx-5"
					aria-label={t`Vault lock status`}
				>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-start gap-2">
							<LockKeyIcon
								className={cn("mt-0.5 size-4", owner.isLocked ? "text-warning" : "text-success")}
								weight="fill"
							/>
							<div>
								<p className={cn("text-xs font-bold", owner.isLocked ? "text-warning" : "text-success")}>
									{owner.isLocked ? <Trans>Withdrawal locked</Trans> : <Trans>Withdrawal unlocked</Trans>}
								</p>
								<p className="mt-0.5 text-2xs tabular-nums text-fg-muted">
									{owner.lockedUntil === null ? (
										<Trans>No lock timestamp was returned</Trans>
									) : (
										<Trans>Server unlock time: {formatTimestamp(owner.lockedUntil, i18n.locale)}</Trans>
									)}
								</p>
							</div>
						</div>
						<div className="text-right">
							<p className="text-2xs text-fg-muted">
								<Trans>Maximum withdrawable</Trans>
							</p>
							<p className="mt-0.5 text-sm font-bold tabular-nums text-fg">{formatVaultUsd(owner.maxWithdrawable)}</p>
						</div>
					</div>
					{owner.lockProgress === null ? null : (
						<progress
							className="mt-3 h-1.5 w-full overflow-hidden rounded-full accent-brand"
							max={1}
							value={Number(owner.lockProgress)}
							aria-label={t`Lock period progress`}
						/>
					)}
				</section>
			) : null}

			{owner.status === "error" ? (
				<div
					role="alert"
					className="mx-4 mb-3 flex items-start gap-2 rounded-10 bg-error-soft px-3 py-2.5 text-xs text-error min-[1001px]:mx-5"
				>
					<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" />
					<div className="min-w-0 flex-1">
						<Trans>Your Vault balance could not be verified. Account values and withdrawal remain unavailable.</Trans>
						{onRetryOwner ? (
							<Button className="mt-2" size="xs" variant="outline" intent="neutral" onClick={onRetryOwner}>
								<Trans>Retry account data</Trans>
							</Button>
						) : null}
					</div>
				</div>
			) : null}

			<div className="grid gap-3 px-4 pb-4 min-[1001px]:grid-cols-[minmax(0,1.5fr)_minmax(var(--vault-detail-sidebar-min),1fr)] min-[1001px]:px-5">
				<section className="overflow-hidden rounded-12 border border-stroke-weak" aria-label={t`Vault performance`}>
					<div className="flex flex-wrap items-center justify-between gap-2 border-b border-stroke-weak px-3 py-2">
						<fieldset className="flex gap-1">
							<legend className="sr-only">{t`Vault chart metric`}</legend>
							<ChartButton active={chartKind === "accountValue"} onClick={() => setChartKind("accountValue")}>
								<Trans>Account value</Trans>
							</ChartButton>
							<ChartButton active={chartKind === "pnl"} onClick={() => setChartKind("pnl")}>
								<Trans>PNL</Trans>
							</ChartButton>
						</fieldset>
						<fieldset className="flex gap-1">
							<legend className="sr-only">{t`Vault chart period`}</legend>
							{(["day", "week", "month", "allTime"] as const).map((item) => (
								<ChartButton key={item} active={period === item} onClick={() => setPeriod(item)}>
									<PeriodLabel period={item} />
								</ChartButton>
							))}
						</fieldset>
					</div>
					<VaultPerformanceChart snapshot={snapshot} kind={chartKind} />
					<div className="flex items-center justify-between border-t border-stroke-weak px-3 py-2 text-xs">
						<span className="text-fg-muted">
							<Trans>Selected-period PNL</Trans>
						</span>
						<span
							className={cn(
								"font-semibold tabular-nums",
								pnlTone === "positive" ? "text-success" : pnlTone === "negative" ? "text-error" : "text-fg",
							)}
						>
							{formatVaultUsd(periodPnl)}
						</span>
					</div>
				</section>

				<aside className="rounded-12 border border-stroke-weak p-4">
					<h2 className="text-sm font-bold text-fg">
						<Trans>About this Vault</Trans>
					</h2>
					<a
						href={getExplorerAddressUrl(detail.leader, isTestnet)}
						target="_blank"
						rel="noopener"
						className="mt-3 inline-flex items-center gap-1 font-mono text-xs tabular-nums text-brand hover:underline"
					>
						{shortenAddress(detail.leader)}
						<ArrowSquareOutIcon className="size-3" />
					</a>
					<p className="mt-3 text-xs leading-5 text-fg-muted">
						{detail.description || <Trans>No description was provided by the Vault.</Trans>}
					</p>
					<dl className="mt-4 divide-y divide-stroke-weak border-t border-stroke-weak text-xs">
						<AboutRow label={<Trans>Leader commission</Trans>} value={formatVaultRatio(detail.leaderCommission)} />
						<AboutRow
							label={<Trans>Deposits</Trans>}
							value={detail.allowDeposits && !detail.isClosed ? t`Open` : t`Unavailable`}
						/>
						<AboutRow
							label={<Trans>Withdrawal policy</Trans>}
							value={detail.alwaysCloseOnWithdraw ? t`Proportional position close` : t`As-needed position close`}
						/>
						<AboutRow label={<Trans>Returned depositors</Trans>} value={`${detail.followers.length}`} />
					</dl>
				</aside>
			</div>

			<section
				className="mx-4 mb-4 rounded-12 bg-warning-soft px-4 py-3 text-warning min-[1001px]:mx-5"
				aria-labelledby={riskTitleId}
			>
				<div className="flex items-start gap-2">
					<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" />
					<div>
						<h2 id={riskTitleId} className="text-xs font-bold">
							<Trans>Vault risk</Trans>
						</h2>
						<ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5">
							<li>
								<Trans>You can lose all deposited principal. Vault returns are not guaranteed.</Trans>
							</li>
							<li>
								<Trans>Historical APR does not predict future performance; the displayed APR can change.</Trans>
							</li>
							<li>
								<Trans>The leader receives the commission shown above from profits.</Trans>
							</li>
							<li>
								<Trans>Unlock eligibility uses the server-returned lock timestamp, not a universal fixed lock.</Trans>
							</li>
							<li>
								<Trans>
									Withdrawal can cancel orders, close positions, incur slippage, and return less than requested.
								</Trans>
							</li>
						</ul>
					</div>
				</div>
			</section>

			<VaultFollowers followers={detail.followers} />
		</article>
	);
}

function VaultFollowers({ followers }: { followers: VaultDetail["followers"] }) {
	const titleId = useId();
	return (
		<section aria-labelledby={titleId}>
			<div className="border-b border-stroke-weak px-4 pb-2 min-[1001px]:px-5">
				<h2 id={titleId} className="text-sm font-bold text-fg">
					<Trans>Returned depositors</Trans>
				</h2>
				<p className="mt-0.5 text-2xs text-fg-muted">
					<Trans>This interface may return at most a subset of all depositors.</Trans>
				</p>
			</div>
			{followers.length === 0 ? (
				<p className="px-4 py-8 text-center text-xs text-fg-muted">
					<Trans>No depositors were returned.</Trans>
				</p>
			) : (
				<>
					<div className="hidden overflow-x-auto min-[1001px]:block">
						<table className="w-full min-w-4xl border-collapse">
							<thead>
								<tr className="border-b border-stroke-weak text-2xs text-fg-muted">
									<th className="px-5 py-2 text-left font-semibold">
										<Trans>Depositor</Trans>
									</th>
									<th className="px-3 py-2 text-right font-semibold">
										<Trans>Equity</Trans>
									</th>
									<th className="px-3 py-2 text-right font-semibold">
										<Trans>Current PNL</Trans>
									</th>
									<th className="px-3 py-2 text-right font-semibold">
										<Trans>All-time PNL</Trans>
									</th>
									<th className="px-5 py-2 text-right font-semibold">
										<Trans>Days following</Trans>
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-stroke-weak">
								{followers.map((follower, index) => (
									<FollowerDesktopRow key={`${follower.user}:${index}`} follower={follower} />
								))}
							</tbody>
						</table>
					</div>
					<div className="divide-y divide-stroke-weak min-[1001px]:hidden">
						{followers.map((follower, index) => (
							<FollowerMobileRow key={`${follower.user}:${index}`} follower={follower} />
						))}
					</div>
				</>
			)}
		</section>
	);
}

function FollowerDesktopRow({ follower }: { follower: VaultDetail["followers"][number] }) {
	const pnlTone = getVaultValueTone(follower.pnl);
	const allTone = getVaultValueTone(follower.allTimePnl);
	return (
		<tr>
			<td className="px-5 py-2.5 font-mono text-xs tabular-nums text-fg">
				{follower.user === "Leader" ? <Trans>Leader</Trans> : shortenAddress(follower.user)}
			</td>
			<td className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums text-fg">
				{formatVaultUsd(follower.vaultEquity)}
			</td>
			<td className={cn("px-3 py-2.5 text-right text-xs font-semibold tabular-nums", toneClass(pnlTone))}>
				{formatVaultUsd(follower.pnl)}
			</td>
			<td className={cn("px-3 py-2.5 text-right text-xs tabular-nums", toneClass(allTone))}>
				{formatVaultUsd(follower.allTimePnl)}
			</td>
			<td className="px-5 py-2.5 text-right text-xs tabular-nums text-fg">{follower.daysFollowing}</td>
		</tr>
	);
}

function FollowerMobileRow({ follower }: { follower: VaultDetail["followers"][number] }) {
	return (
		<div className="flex items-center justify-between gap-4 px-4 py-3">
			<div className="min-w-0">
				<p className="truncate font-mono text-xs tabular-nums text-fg">
					{follower.user === "Leader" ? <Trans>Leader</Trans> : shortenAddress(follower.user)}
				</p>
				<p className="mt-0.5 text-2xs text-fg-muted">
					<Trans>Following {follower.daysFollowing} days</Trans>
				</p>
			</div>
			<div className="text-right">
				<p className="text-xs font-semibold tabular-nums text-fg">{formatVaultUsd(follower.vaultEquity)}</p>
				<p className={cn("mt-0.5 text-2xs font-semibold tabular-nums", toneClass(getVaultValueTone(follower.pnl)))}>
					{formatVaultUsd(follower.pnl)}
				</p>
			</div>
		</div>
	);
}

function SummaryMetric({
	label,
	value,
	tone = "neutral",
}: {
	label: React.ReactNode;
	value: string;
	tone?: "positive" | "negative" | "neutral";
}) {
	return (
		<div className="rounded-10 border border-stroke-weak bg-fill-weak px-3 py-2.5 min-[1001px]:rounded-12 min-[1001px]:py-3">
			<p className="text-2xs text-fg-muted min-[1001px]:text-xs">{label}</p>
			<p className={cn("mt-1 truncate text-base font-bold tabular-nums min-[1001px]:text-xl", toneClass(tone))}>
				{value}
			</p>
		</div>
	);
}

function AboutRow({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-4 py-2.5">
			<dt className="text-fg-muted">{label}</dt>
			<dd className="text-right font-semibold tabular-nums text-fg">{value}</dd>
		</div>
	);
}

function ChartButton({
	active,
	children,
	onClick,
}: {
	active: boolean;
	children: React.ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			className={cn(
				"rounded-8 px-2 py-1 text-xs font-semibold",
				active ? "bg-fill-selected text-fg-inverse" : "text-fg-muted hover:bg-fill-hover hover:text-fg",
			)}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

function PeriodLabel({ period }: { period: VaultPeriod }) {
	if (period === "day") return <Trans>24h</Trans>;
	if (period === "week") return <Trans>7D</Trans>;
	if (period === "month") return <Trans>30D</Trans>;
	return <Trans>All</Trans>;
}

function toneClass(tone: "positive" | "negative" | "neutral"): string {
	return tone === "positive" ? "text-success" : tone === "negative" ? "text-error" : "text-fg";
}

function formatTimestamp(timestamp: number, locale: string): string {
	return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}
