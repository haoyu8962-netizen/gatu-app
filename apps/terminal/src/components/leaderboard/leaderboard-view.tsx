import {
	Button,
	ButtonIcon,
	SearchInput,
	Select,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import {
	ArrowClockwiseIcon,
	ArrowDownIcon,
	ArrowSquareOutIcon,
	ArrowUpIcon,
	CaretLeftIcon,
	CaretRightIcon,
	InfoIcon,
	MagnifyingGlassIcon,
	TrophyIcon,
	UserCircleIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { formatPercent, formatUSD, shortenAddress } from "@/lib/format";
import { LEADERBOARD_API_MAX_QUERY_LENGTH } from "@/lib/leaderboard/leaderboard-api";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import type { LeaderboardPeriod, LeaderboardSortKey, LeaderboardValueTone } from "./leaderboard-domain";
import type { LeaderboardController, LeaderboardDataNotice } from "./use-leaderboard-controller";

export type LeaderboardViewProps = LeaderboardController;

export function LeaderboardView(props: LeaderboardViewProps) {
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const periodLabel =
		props.period === "day" ? t`24H` : props.period === "week" ? t`7D` : props.period === "month" ? t`30D` : t`All-time`;
	const pnlLabel = t`${periodLabel} PNL`;
	const roiLabel = t`${periodLabel} ROI`;
	const volumeLabel = t`${periodLabel} Volume`;

	return (
		<section
			data-state={props.pageState}
			data-leaderboard-state={props.pageState}
			data-refresh-state={props.dataNotice ?? (props.isRefreshing ? "refreshing" : "idle")}
			aria-busy={props.pageState === "loading" || props.isRefreshing}
			className={cn(
				"mx-auto flex min-h-[var(--earn-page-min-height)] w-full max-w-[var(--earn-content-max)] flex-col bg-surface text-fg shadow-raised",
				!isMobile && "overflow-hidden rounded-[var(--earn-page-radius)]",
			)}
		>
			<header
				className={cn(
					"flex gap-4",
					isMobile ? "flex-col px-4 pt-4 pb-3" : "items-start justify-between px-5 pt-4 pb-3",
				)}
			>
				<div>
					<p className="text-2xs text-fg-muted">
						<Trans>Markets / Leaderboard</Trans>
					</p>
					<h1 className={cn("mt-1 font-bold tracking-heading-1", isMobile ? "text-xl" : "text-lg")}>
						<Trans>Leaderboard</Trans>
					</h1>
					<p className="mt-1 text-xs text-fg-muted">
						<Trans>Compare public account performance across the time window you choose.</Trans>
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<PeriodSelector period={props.period} onChange={props.onPeriodChange} />
					<Button
						type="button"
						size="xs"
						variant="outline"
						intent="neutral"
						disabled={props.isRefreshing || props.pageState === "loading" || !props.canRetry}
						onClick={props.onRetry}
						iconLeft={
							<ArrowClockwiseIcon
								className={cn("size-3.5", props.isRefreshing && "animate-spin motion-reduce:animate-none")}
							/>
						}
					>
						{props.isRefreshing ? <Trans>Refreshing…</Trans> : <Trans>Refresh</Trans>}
					</Button>
				</div>
			</header>

			<div className={cn("pb-3", isMobile ? "px-4" : "px-5")}>
				<SearchInput
					size={isMobile ? "lg" : "md"}
					value={props.query}
					maxLength={LEADERBOARD_API_MAX_QUERY_LENGTH}
					onChange={(event) => props.onQueryChange(event.target.value)}
					onClear={props.onClearQuery}
					placeholder={t`Search by wallet address or display name`}
					aria-label={t`Search leaderboard`}
					className={isMobile ? "w-full" : "max-w-[var(--earn-search-max)]"}
				/>
			</div>

			{props.dataNotice ? <LeaderboardDataNoticeBanner notice={props.dataNotice} /> : null}

			{props.pageState === "loading" ? (
				<LeaderboardSkeleton isMobile={isMobile} />
			) : props.pageState === "error" || props.pageState === "paused" ? (
				<LeaderboardError isPaused={props.pageState === "paused"} canRetry={props.canRetry} onRetry={props.onRetry} />
			) : props.pageState === "empty" || props.pageState === "noResults" ? (
				<LeaderboardEmpty hasQuery={props.pageState === "noResults"} />
			) : isMobile ? (
				<MobileLeaderboard
					{...props}
					periodLabel={periodLabel}
					pnlLabel={pnlLabel}
					roiLabel={roiLabel}
					volumeLabel={volumeLabel}
				/>
			) : (
				<DesktopLeaderboard
					{...props}
					periodLabel={periodLabel}
					pnlLabel={pnlLabel}
					roiLabel={roiLabel}
					volumeLabel={volumeLabel}
				/>
			)}

			<div className="mt-auto flex items-start gap-2 border-t border-stroke-weak px-5 py-3 text-xs leading-5 text-fg-muted">
				<InfoIcon className="mt-0.5 size-4 shrink-0" />
				<p>
					<Trans>
						An account is excluded only when both its account value is below $100,000 and its all-time volume is below
						$10,000,000. ROI is the value reported by the current official-app data source. Vault accounts are excluded
						using the network-matched vault dataset. A reviewed protocol and treasury address policy is not available,
						so this ranking does not claim exact parity with Hyperliquid's official leaderboard.
					</Trans>
				</p>
			</div>
		</section>
	);
}

function LeaderboardDataNoticeBanner({ notice }: { notice: Exclude<LeaderboardDataNotice, null> }) {
	return (
		<output
			data-testid="leaderboard-data-notice"
			className="mx-5 mb-3 flex items-start gap-2 rounded-8 border border-stroke-warning-weak bg-warning-soft px-3 py-2 text-xs leading-5 text-fg-muted"
		>
			<WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
			<div>
				<p className="font-semibold text-fg">
					{notice === "paused" ? <Trans>Offline</Trans> : <Trans>Leaderboard is temporarily unavailable</Trans>}
				</p>
				<p>
					<Trans>
						The network-matched public dataset could not be verified. Your account and trading are unaffected.
					</Trans>
				</p>
			</div>
		</output>
	);
}

interface PeriodSelectorProps {
	period: LeaderboardPeriod;
	onChange: (period: LeaderboardPeriod) => void;
}

function PeriodSelector({ period, onChange }: PeriodSelectorProps) {
	const { t } = useLingui();
	return (
		<fieldset
			className="flex max-w-full gap-1 overflow-x-auto rounded-8 border border-stroke-weak bg-sunken p-1"
			aria-label={t`Leaderboard period`}
		>
			<PeriodButton active={period === "day"} onClick={() => onChange("day")}>
				<Trans>24H</Trans>
			</PeriodButton>
			<PeriodButton active={period === "week"} onClick={() => onChange("week")}>
				<Trans>7D</Trans>
			</PeriodButton>
			<PeriodButton active={period === "month"} onClick={() => onChange("month")}>
				<Trans>30D</Trans>
			</PeriodButton>
			<PeriodButton active={period === "allTime"} onClick={() => onChange("allTime")}>
				<Trans>All-time</Trans>
			</PeriodButton>
		</fieldset>
	);
}

interface PeriodButtonProps {
	active: boolean;
	onClick: () => void;
	children: ReactNode;
}

function PeriodButton({ active, onClick, children }: PeriodButtonProps) {
	return (
		<Button
			type="button"
			size="xs"
			variant={active ? "filled" : "ghost"}
			intent="neutral"
			onClick={onClick}
			aria-pressed={active}
			className="shrink-0 shadow-none"
		>
			{children}
		</Button>
	);
}

interface CommonLeaderboardProps extends LeaderboardViewProps {
	periodLabel: string;
	pnlLabel: string;
	roiLabel: string;
	volumeLabel: string;
}

function DesktopLeaderboard(props: CommonLeaderboardProps) {
	useNumberFormatRevision();
	return (
		<div className="flex flex-1 flex-col">
			<Table containerClassName="overflow-visible">
				<TableHeader>
					<TableRow>
						<TableHead size="dense" className="w-[var(--earn-rank-column)] pl-5">
							<Trans>Rank</Trans>
						</TableHead>
						<TableHead size="dense" className="w-[var(--earn-trader-column)]">
							<Trans>Trader</Trans>
						</TableHead>
						<SortableHead label={<Trans>Account Value</Trans>} targetSortKey="accountValue" {...props} />
						<SortableHead label={props.pnlLabel} targetSortKey="pnl" {...props} />
						<SortableHead label={props.roiLabel} targetSortKey="roi" {...props} />
						<SortableHead label={props.volumeLabel} targetSortKey="volume" {...props} />
					</TableRow>
				</TableHeader>
				<TableBody>
					{props.rows.map((row) => (
						<TableRow key={row.address} className="transition-colors hover:bg-fill-hover">
							<TableCell size="dense" className="pl-5 font-semibold tabular-nums text-fg">
								<Rank rank={row.rank} />
							</TableCell>
							<TableCell size="dense">
								<TraderLink href={row.href} address={row.address} displayName={row.displayName} />
							</TableCell>
							<NumericCell>{formatUSD(row.accountValue, { compact: false })}</NumericCell>
							<NumericCell tone={row.pnlTone}>{formatUSD(row.pnl, { compact: false })}</NumericCell>
							<NumericCell tone={row.roiTone}>{formatPercent(row.roi)}</NumericCell>
							<NumericCell>{formatUSD(row.volume, { compact: false })}</NumericCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<LeaderboardPagination {...props} />
		</div>
	);
}

interface SortableHeadProps extends CommonLeaderboardProps {
	label: ReactNode;
	targetSortKey: LeaderboardSortKey;
}

function SortableHead({ label, targetSortKey, ...props }: SortableHeadProps) {
	const active = props.sortKey === targetSortKey;
	const ariaSort = active ? (props.sortDirection === "descending" ? "descending" : "ascending") : "none";
	return (
		<TableHead size="dense" className="text-right" aria-sort={ariaSort}>
			<button
				type="button"
				onClick={() => props.onSort(targetSortKey)}
				className="ml-auto inline-flex items-center gap-1 rounded-8 px-1 py-1 text-right text-fg-muted hover:bg-fill-hover hover:text-fg"
			>
				{label}
				{active ? (
					props.sortDirection === "descending" ? (
						<ArrowDownIcon className="size-3" weight="bold" />
					) : (
						<ArrowUpIcon className="size-3" weight="bold" />
					)
				) : null}
			</button>
		</TableHead>
	);
}

interface NumericCellProps {
	children: ReactNode;
	tone?: LeaderboardValueTone;
}

function NumericCell({ children, tone = "neutral" }: NumericCellProps) {
	return (
		<TableCell
			size="dense"
			className={cn(
				"text-right text-2sm font-semibold tabular-nums whitespace-nowrap",
				tone === "positive" ? "text-success" : tone === "negative" ? "text-error" : "text-fg",
			)}
		>
			{children}
		</TableCell>
	);
}

function MobileLeaderboard(props: CommonLeaderboardProps) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const sortOptions = [
		{ value: "accountValue", label: t`Account Value` },
		{ value: "pnl", label: t`PNL` },
		{ value: "roi", label: t`ROI` },
		{ value: "volume", label: t`Volume` },
	];
	return (
		<div className="flex flex-1 flex-col px-4">
			<div className="mb-3 flex items-center justify-between gap-3">
				<p className="text-2sm font-semibold text-fg">
					<Trans>Ranked by</Trans>
				</p>
				<div className="flex items-center gap-1.5">
					<Select
						size="md"
						value={props.sortKey}
						onValueChange={(value) => value && props.onSort(value as LeaderboardSortKey)}
						options={sortOptions}
						triggerAriaLabel={t`Sort leaderboard`}
						className="min-w-[var(--earn-mobile-sort-width)]"
					/>
					<ButtonIcon
						type="button"
						variant="outline"
						intent="neutral"
						size="md"
						onClick={() => props.onSort(props.sortKey)}
						aria-label={
							props.sortDirection === "descending" ? t`Change to ascending order` : t`Change to descending order`
						}
					>
						{props.sortDirection === "descending" ? (
							<ArrowDownIcon className="size-4" />
						) : (
							<ArrowUpIcon className="size-4" />
						)}
					</ButtonIcon>
				</div>
			</div>
			<div className="space-y-2.5">
				{props.rows.map((row) => (
					<article key={row.address} className="rounded-12 border border-stroke-weak bg-fill-weaker p-3">
						<div className="mb-3 flex items-center justify-between gap-3 border-b border-stroke-weak pb-3">
							<TraderLink href={row.href} address={row.address} displayName={row.displayName} />
							<Rank rank={row.rank} />
						</div>
						<MobileMetric
							label={<Trans>Account Value</Trans>}
							value={formatUSD(row.accountValue, { compact: false })}
						/>
						<MobileMetric label={props.pnlLabel} value={formatUSD(row.pnl, { compact: false })} tone={row.pnlTone} />
						<MobileMetric label={props.roiLabel} value={formatPercent(row.roi)} tone={row.roiTone} />
						<MobileMetric label={props.volumeLabel} value={formatUSD(row.volume, { compact: false })} />
					</article>
				))}
			</div>
			<LeaderboardPagination {...props} />
		</div>
	);
}

interface MobileMetricProps {
	label: ReactNode;
	value: string;
	tone?: LeaderboardValueTone;
}

function MobileMetric({ label, value, tone = "neutral" }: MobileMetricProps) {
	return (
		<div className="flex items-center justify-between gap-4 py-1.5 text-xs">
			<span className="text-fg-muted">{label}</span>
			<span
				className={cn(
					"font-semibold tabular-nums",
					tone === "positive" ? "text-success" : tone === "negative" ? "text-error" : "text-fg",
				)}
			>
				{value}
			</span>
		</div>
	);
}

interface TraderLinkProps {
	href: string;
	address: string;
	displayName: string | null;
}

function TraderLink({ href, address, displayName }: TraderLinkProps) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener"
			className="inline-flex min-w-0 items-center gap-2 rounded-8 font-semibold text-fg hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
		>
			<span className="grid size-6 shrink-0 place-items-center rounded-full bg-fill-weak text-icon">
				{displayName ? <UserCircleIcon className="size-4" /> : <TrophyIcon className="size-4" />}
			</span>
			<span className="min-w-0 truncate">{displayName ?? shortenAddress(address, 6, 4)}</span>
			<ArrowSquareOutIcon className="size-3.5 shrink-0" />
		</a>
	);
}

function Rank({ rank }: { rank: number }) {
	return (
		<span className={cn("tabular-nums", rank <= 3 ? "font-bold text-warning" : "font-semibold text-fg")}>#{rank}</span>
	);
}

function LeaderboardPagination(props: CommonLeaderboardProps) {
	const { t } = useLingui();
	return (
		<div className="flex flex-wrap items-center justify-end gap-3 px-1 py-3">
			<Select
				size="sm"
				value={String(props.rowsPerPage)}
				onValueChange={(value) => value && props.onRowsPerPageChange(Number(value))}
				options={[5, 10, 25, 50].map((value) => ({ value: String(value), label: String(value) }))}
				triggerAriaLabel={t`Rows per page`}
				className="w-[var(--earn-rows-select-width)]"
			/>
			<span className="text-xs tabular-nums text-fg-muted">
				{props.start}–{props.end} / {props.totalRows}
			</span>
			<div className="flex gap-1.5">
				<ButtonIcon
					type="button"
					variant="outline"
					intent="neutral"
					size="sm"
					onClick={props.onPreviousPage}
					disabled={props.isRefreshing || props.page <= 1}
					aria-label={t`Previous page`}
				>
					<CaretLeftIcon className="size-4" />
				</ButtonIcon>
				<ButtonIcon
					type="button"
					variant="outline"
					intent="neutral"
					size="sm"
					onClick={props.onNextPage}
					disabled={props.isRefreshing || props.page >= props.totalPages}
					aria-label={t`Next page`}
				>
					<CaretRightIcon className="size-4" />
				</ButtonIcon>
			</div>
		</div>
	);
}

function LeaderboardSkeleton({ isMobile }: { isMobile: boolean }) {
	return (
		<div className={cn("flex-1 animate-pulse", isMobile ? "space-y-2.5 px-4" : "px-5")} aria-busy="true">
			<span className="sr-only">
				<Trans>Loading leaderboard</Trans>
			</span>
			{Array.from({ length: 6 }, (_, index) => (
				<div
					key={`leaderboard-skeleton-${index + 1}`}
					className={cn("bg-fill-weak", isMobile ? "h-44 rounded-12" : "mb-1 h-11 rounded-8")}
				/>
			))}
		</div>
	);
}

function LeaderboardError({
	isPaused,
	canRetry,
	onRetry,
}: {
	isPaused: boolean;
	canRetry: boolean;
	onRetry: () => void;
}) {
	return (
		<div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-12 text-center">
			<span className="grid size-11 place-items-center rounded-full bg-error-soft text-error">
				<WarningCircleIcon className="size-6" weight="fill" />
			</span>
			<div>
				<p className="text-sm font-bold text-fg">
					{isPaused ? <Trans>Offline</Trans> : <Trans>Leaderboard is temporarily unavailable</Trans>}
				</p>
				<p className="mt-1 max-w-[var(--earn-state-copy-max)] text-xs leading-5 text-fg-muted">
					<Trans>
						The network-matched public dataset could not be verified. Your account and trading are unaffected.
					</Trans>
				</p>
			</div>
			<Button type="button" size="md" disabled={!canRetry} onClick={onRetry}>
				<Trans>Try again</Trans>
			</Button>
		</div>
	);
}

function LeaderboardEmpty({ hasQuery }: { hasQuery: boolean }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-12 text-center">
			<span className="grid size-11 place-items-center rounded-full bg-fill-weak text-icon">
				<MagnifyingGlassIcon className="size-5" />
			</span>
			<div>
				<p className="text-sm font-bold text-fg">
					{hasQuery ? <Trans>No matching trader</Trans> : <Trans>No eligible leaderboard accounts</Trans>}
				</p>
				<p className="mt-1 text-xs leading-5 text-fg-muted">
					{hasQuery ? (
						<Trans>Check the wallet address or display name, or the account may not meet the current criteria.</Trans>
					) : (
						<Trans>The verified dataset did not contain an eligible account for this network.</Trans>
					)}
				</p>
			</div>
		</div>
	);
}
