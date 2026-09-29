import { Button, Pagination, SearchInput, Select, Table } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowClockwiseIcon, CrownIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatTime, shortenAddress } from "@/lib/format";
import {
	formatVaultCompactUsd,
	formatVaultRatio,
	formatVaultUsd,
	getVaultAgeDays,
	getVaultDeposit,
	getVaultMark,
	getVaultPeriodSeries,
	groupVaultRows,
	isLeadingVault,
	selectVaultRows,
	sumVaultTvl,
	type VaultAccountFactsState,
	type VaultFilter,
	type VaultListGroup,
	type VaultListItem,
	type VaultListUnavailableReason,
	type VaultPeriod,
} from "./domain/vaults";
import { VaultPerformanceChart } from "./vault-performance-chart";

const PAGE_SIZE = 20;
const VAULT_LIST_SKELETON_KEYS = ["vault-1", "vault-2", "vault-3", "vault-4", "vault-5", "vault-6"] as const;

export interface VaultsListProps {
	state: "normal" | "loading" | "error" | "empty";
	rows: readonly VaultListItem[];
	account: VaultAccountFactsState;
	isRefreshing?: boolean;
	fetchedAt?: number | null;
	onRetry: () => void;
}

export function VaultsList({ state, rows, account, isRefreshing = false, fetchedAt = null, onRetry }: VaultsListProps) {
	const { t, i18n } = useLingui();
	const [filter, setFilter] = useState<VaultFilter>("all");
	const [period, setPeriod] = useState<VaultPeriod>("month");
	const [query, setQuery] = useState("");
	const [page, setPage] = useState(1);
	const selection = useMemo(() => selectVaultRows({ rows, filter, query, account }), [account, filter, query, rows]);
	const totalTvl = useMemo(() => (state === "normal" || state === "empty" ? sumVaultTvl(rows) : null), [rows, state]);
	const selectedRows = selection.status === "ready" ? selection.rows : [];
	const totalPages = Math.max(1, Math.ceil(selectedRows.length / PAGE_SIZE));
	const currentPage = Math.min(page, totalPages);
	const mobilePageSummary = t`${currentPage} of ${totalPages}`;
	const pageRows = selectedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
	const groups = getVisibleGroups(pageRows, filter, selection.status === "ready" && selection.classificationAvailable);
	const ageReferenceTime = fetchedAt ?? Date.now();
	const fetchedLabel =
		fetchedAt === null ? null : formatTime(fetchedAt, { locale: i18n.locale, hour: "2-digit", minute: "2-digit" });

	function changeFilter(nextFilter: VaultFilter) {
		setFilter(nextFilter);
		setPage(1);
	}

	return (
		<section
			className="overflow-hidden rounded-12 bg-surface shadow-raised"
			data-state={state}
			data-vaults-state={state}
		>
			<header className="border-b border-stroke-weak px-4 py-4 min-[1001px]:px-5">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="text-xl font-bold tracking-tight text-fg min-[1001px]:text-2xl">
							<Trans>Vaults</Trans>
						</h1>
						<p className="mt-1 max-w-2xl text-xs leading-5 text-fg-muted">
							<Trans>
								Explore HyperCore Vaults. Deposits share in each vault's gains and losses and can lose all principal.
							</Trans>
						</p>
					</div>
					<div className="flex items-center gap-2">
						{fetchedLabel ? (
							<span className="text-2xs tabular-nums text-fg-muted">
								<Trans>Fetched {fetchedLabel}</Trans>
							</span>
						) : null}
						<Button
							variant="outline"
							intent="neutral"
							size="xs"
							disabled={isRefreshing}
							onClick={onRetry}
							iconLeft={<ArrowClockwiseIcon className={cn("size-3.5", isRefreshing && "animate-spin")} />}
						>
							<Trans>Refresh</Trans>
						</Button>
					</div>
				</div>

				<div className="mt-4 grid gap-3 min-[1001px]:grid-cols-[minmax(0,1fr)_auto]">
					<div className="py-2.5">
						<p className="text-2xs text-fg-muted">
							<Trans>Total value locked</Trans>
						</p>
						<p className="mt-0.5 text-lg font-bold tabular-nums text-fg">
							{totalTvl === null ? "—" : formatVaultCompactUsd(totalTvl)}
						</p>
					</div>
					<Select
						className="min-[1001px]:w-40"
						triggerAriaLabel={t`Performance period`}
						value={period}
						onValueChange={(value) => value && setPeriod(value as VaultPeriod)}
						options={[
							{ value: "day", label: t`24h` },
							{ value: "week", label: t`7D` },
							{ value: "month", label: t`30D` },
							{ value: "allTime", label: t`All-time` },
						]}
					/>
				</div>

				<fieldset className="mt-3 flex gap-2 overflow-x-auto pb-1">
					<legend className="sr-only">{t`Vault filters`}</legend>
					{(["all", "deposited", "leading"] as const).map((item) => (
						<Button
							key={item}
							variant="outline"
							intent={filter === item ? "brand" : "neutral"}
							size="xs"
							aria-pressed={filter === item}
							className="shrink-0"
							onClick={() => changeFilter(item)}
						>
							<FilterLabel filter={item} />
						</Button>
					))}
				</fieldset>

				<SearchInput
					className="mt-3 max-w-xl"
					value={query}
					onChange={(event) => {
						setQuery(event.target.value);
						setPage(1);
					}}
					onClear={() => {
						setQuery("");
						setPage(1);
					}}
					clearLabel={t`Clear search`}
					placeholder={t`Search by vault, address, or leader`}
					aria-label={t`Search vaults`}
				/>
			</header>

			{state === "loading" ? <VaultListSkeleton /> : null}
			{state === "error" ? (
				<VaultListMessage tone="error" title={t`Vault data is unavailable`} onRetry={onRetry}>
					<Trans>
						The public Vault feed could not be verified. No cached or cross-network rows are shown in its place.
					</Trans>
				</VaultListMessage>
			) : null}
			{state === "empty" ? (
				<VaultListMessage title={t`No Vaults were returned`} onRetry={onRetry}>
					<Trans>The selected Hyperliquid environment returned a definitive empty Vault list.</Trans>
				</VaultListMessage>
			) : null}

			{state === "normal" && selection.status === "unavailable" ? (
				<VaultFilterUnavailable reason={selection.reason} onRetry={onRetry} />
			) : null}

			{state === "normal" && selection.status === "ready" ? (
				selectedRows.length === 0 ? (
					<VaultListMessage title={selection.isSearchNoResults ? t`No matching Vaults` : t`No Vaults in this filter`}>
						{selection.isSearchNoResults ? (
							<Trans>Try another vault name, address, or leader address.</Trans>
						) : (
							<Trans>This is a definitive empty result for the selected filter.</Trans>
						)}
					</VaultListMessage>
				) : (
					<div className="py-3">
						{groups.map((group) => (
							<VaultGroup key={group.id} group={group} period={period} account={account} now={ageReferenceTime} />
						))}
						{totalPages > 1 ? (
							<Pagination
								className="mx-4 mt-4 min-[1001px]:mx-5"
								currentPage={currentPage}
								totalPages={totalPages}
								totalItems={selectedRows.length}
								itemsPerPage={PAGE_SIZE}
								onPageChange={setPage}
								variant="mobile"
								navigationLabel={t`Vault pagination`}
								previousPageLabel={t`Previous Vault page`}
								nextPageLabel={t`Next Vault page`}
								previousText={t`Previous`}
								nextText={t`Next`}
								getPageLabel={(page) => t`Page ${page}`}
								mobilePageSummary={mobilePageSummary}
							/>
						) : null}
					</div>
				)
			) : null}
		</section>
	);
}

function VaultGroup({
	group,
	period,
	account,
	now,
}: {
	group: VaultListGroup;
	period: VaultPeriod;
	account: VaultAccountFactsState;
	now: number;
}) {
	const { t } = useLingui();
	return (
		<section className="mt-3 first:mt-0" aria-labelledby={`vault-group-${group.id}`}>
			<h2 id={`vault-group-${group.id}`} className="px-4 pb-2 text-xs font-bold text-fg min-[1001px]:px-5">
				<GroupLabel group={group.id} />
			</h2>
			<Table
				scrollableRegionLabel={t`Vaults`}
				containerClassName="hidden min-[1001px]:block"
				className="min-w-4xl text-start"
			>
				<thead>
					<tr className="border-y border-stroke-weak text-2xs text-fg-muted">
						<th className="px-5 py-2 text-start font-semibold">
							<Trans>Vault</Trans>
						</th>
						<th className="px-3 py-2 text-start font-semibold">
							<Trans>Leader</Trans>
						</th>
						<th className="px-3 py-2 text-right font-semibold">
							<Trans>APR</Trans>
						</th>
						<th className="px-3 py-2 text-right font-semibold">
							<Trans>TVL</Trans>
						</th>
						<th className="px-3 py-2 text-right font-semibold">
							<Trans>Your equity</Trans>
						</th>
						<th className="px-3 py-2 text-right font-semibold">
							<Trans>Performance</Trans>
						</th>
						<th className="px-5 py-2 text-right font-semibold">
							<Trans>Age</Trans>
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-stroke-weak">
					{group.rows.map((row) => (
						<VaultDesktopRow key={row.vaultAddress} row={row} period={period} account={account} now={now} />
					))}
				</tbody>
			</Table>
			<div className="grid grid-cols-1 gap-2 px-4 min-[1001px]:hidden">
				{group.rows.map((row) => (
					<VaultMobileCard key={row.vaultAddress} row={row} period={period} account={account} now={now} />
				))}
			</div>
		</section>
	);
}

function VaultDesktopRow({
	row,
	period,
	account,
	now,
}: {
	row: VaultListItem;
	period: VaultPeriod;
	account: VaultAccountFactsState;
	now: number;
}) {
	const deposit = getVaultDeposit(account, row.vaultAddress);
	const leading = isLeadingVault(account, row.vaultAddress);
	const age = getVaultAgeDays(row.createdAt, now);
	const performance = {
		accountValueHistory: [],
		pnlHistory: getVaultPeriodSeries(row, period).map((value, index) => ({ timestamp: index, value })),
		volume: "0",
	};
	return (
		<tr>
			<td className="p-0">
				<Link
					to="/vaults/$vaultAddress"
					params={{ vaultAddress: row.vaultAddress }}
					className="flex min-w-0 items-center gap-2 px-5 py-2.5 hover:bg-fill-hover focus-visible:outline-2 focus-visible:outline-stroke-focus"
				>
					<VaultMark name={row.name} />
					<div className="min-w-0">
						<p className="max-w-72 truncate text-xs font-semibold text-fg">
							{row.name || <bdi dir="ltr">{shortenAddress(row.vaultAddress)}</bdi>}
						</p>
						<div className="mt-0.5 flex gap-1">
							<VaultBadges row={row} leading={leading} />
						</div>
					</div>
				</Link>
			</td>
			<td className="px-3 py-2.5 font-mono text-xs tabular-nums text-fg-muted">
				<bdi dir="ltr">{shortenAddress(row.leader)}</bdi>
			</td>
			<td className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums text-fg">
				<bdi dir="ltr">{formatVaultRatio(row.apr, 2, true)}</bdi>
			</td>
			<td className="px-3 py-2.5 text-right text-xs tabular-nums text-fg">
				<bdi dir="ltr">{formatVaultCompactUsd(row.tvl)}</bdi>
			</td>
			<td className="px-3 py-2.5 text-right text-xs tabular-nums text-fg">
				<bdi dir="ltr">{formatVaultUsd(deposit)}</bdi>
			</td>
			<td className="w-28 px-3 py-2.5">
				<VaultPerformanceChart snapshot={performance} kind="pnl" period={period} compact />
			</td>
			<td className="px-5 py-2.5 text-right text-xs tabular-nums text-fg-muted">
				{age === null ? "—" : <Trans>{age} days</Trans>}
			</td>
		</tr>
	);
}

function VaultMobileCard({
	row,
	period,
	account,
	now,
}: {
	row: VaultListItem;
	period: VaultPeriod;
	account: VaultAccountFactsState;
	now: number;
}) {
	const deposit = getVaultDeposit(account, row.vaultAddress);
	const leading = isLeadingVault(account, row.vaultAddress);
	const age = getVaultAgeDays(row.createdAt, now);
	const values = getVaultPeriodSeries(row, period);
	const snapshot = {
		accountValueHistory: [],
		pnlHistory: values.map((value, index) => ({ timestamp: index, value })),
		volume: "0",
	};
	return (
		<Link
			to="/vaults/$vaultAddress"
			params={{ vaultAddress: row.vaultAddress }}
			className="rounded-12 border border-stroke-weak p-3 focus-visible:outline-2 focus-visible:outline-stroke-focus"
		>
			<div className="flex min-w-0 items-center gap-2">
				<VaultMark name={row.name} />
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-bold text-fg">
						{row.name || <bdi dir="ltr">{shortenAddress(row.vaultAddress)}</bdi>}
					</p>
					<div className="mt-0.5 flex flex-wrap gap-1">
						<VaultBadges row={row} leading={leading} />
					</div>
				</div>
				<p className="shrink-0 text-sm font-bold tabular-nums text-fg">
					<bdi dir="ltr">{formatVaultRatio(row.apr, 2, true)}</bdi>
				</p>
			</div>
			<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
				<MobileMetric label={<Trans>TVL</Trans>} value={<bdi dir="ltr">{formatVaultCompactUsd(row.tvl)}</bdi>} />
				<MobileMetric label={<Trans>Your equity</Trans>} value={<bdi dir="ltr">{formatVaultUsd(deposit)}</bdi>} />
				<MobileMetric label={<Trans>Leader</Trans>} value={<bdi dir="ltr">{shortenAddress(row.leader)}</bdi>} mono />
				<MobileMetric
					label={<Trans>Age</Trans>}
					value={age === null ? "—" : <bdi dir="ltr">{age}</bdi>}
					suffix={age === null ? undefined : <Trans>days</Trans>}
				/>
			</dl>
			<div className="mt-2 text-signal">
				<VaultPerformanceChart snapshot={snapshot} kind="pnl" period={period} compact />
			</div>
		</Link>
	);
}

function MobileMetric({
	label,
	value,
	suffix,
	mono = false,
}: {
	label: React.ReactNode;
	value: React.ReactNode;
	suffix?: React.ReactNode;
	mono?: boolean;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<dt className="text-fg-muted">{label}</dt>
			<dd className={cn("min-w-0 truncate font-semibold tabular-nums text-fg", mono && "font-mono")}>
				{value}
				{suffix ? <> {suffix}</> : null}
			</dd>
		</div>
	);
}

function VaultBadges({ row, leading }: { row: VaultListItem; leading: boolean | null }) {
	return (
		<>
			{row.classification === "official" ? (
				<Badge>
					<Trans>Official</Trans>
				</Badge>
			) : null}
			{row.classification === "user" ? (
				<Badge>
					<Trans>User</Trans>
				</Badge>
			) : null}
			{row.relationship === "child" ? (
				<Badge>
					<Trans>Child</Trans>
				</Badge>
			) : null}
			{row.isClosed ? (
				<Badge>
					<Trans>Closed</Trans>
				</Badge>
			) : null}
			{leading ? (
				<Badge>
					<CrownIcon className="size-2.5" />
					<Trans>Leading</Trans>
				</Badge>
			) : null}
		</>
	);
}

function Badge({ children }: { children: React.ReactNode }) {
	return (
		<span className="inline-flex items-center gap-0.5 rounded-4 bg-fill-weak px-1.5 py-0.5 text-3xs text-fg-muted">
			{children}
		</span>
	);
}

function VaultMark({ name }: { name: string }) {
	return (
		<span
			aria-hidden
			className="grid size-7 shrink-0 place-items-center rounded-full bg-fill text-3xs font-bold text-fg-inverse"
		>
			{getVaultMark(name)}
		</span>
	);
}

function VaultListSkeleton() {
	const { t } = useLingui();
	return (
		<section aria-busy="true" aria-label={t`Loading Vaults`} className="space-y-2 px-4 py-5 min-[1001px]:px-5">
			{VAULT_LIST_SKELETON_KEYS.map((key) => (
				<div key={key} className="h-12 animate-pulse rounded-8 bg-fill-weak motion-reduce:animate-none" />
			))}
		</section>
	);
}

function VaultFilterUnavailable({ reason, onRetry }: { reason: VaultListUnavailableReason; onRetry: () => void }) {
	const { t } = useLingui();
	if (reason === "classification") {
		return (
			<VaultListMessage tone="warning" title={t`Classification unavailable`}>
				<Trans>
					Official and User filters stay unavailable until a reviewed exact-address policy is configured. No
					classification is inferred from relationship or ownership fields.
				</Trans>
			</VaultListMessage>
		);
	}
	if (reason === "accountDisconnected") {
		return (
			<VaultListMessage title={t`Account data unavailable`}>
				<Trans>Connect or restore the verified owner account to use account-specific Vault filters.</Trans>
			</VaultListMessage>
		);
	}
	if (reason === "accountLoading") {
		return <VaultListSkeleton />;
	}
	return (
		<VaultListMessage tone="error" title={t`Account Vault data could not be verified`} onRetry={onRetry}>
			<Trans>Deposited and Leading filters fail closed until both account snapshots are available.</Trans>
		</VaultListMessage>
	);
}

function VaultListMessage({
	title,
	tone = "neutral",
	children,
	onRetry,
}: {
	title: string;
	tone?: "neutral" | "warning" | "error";
	children: React.ReactNode;
	onRetry?: () => void;
}) {
	return (
		<div
			role={tone === "error" ? "alert" : "status"}
			className={cn(
				"mx-auto flex max-w-xl flex-col items-center px-6 py-14 text-center",
				tone === "error" ? "text-error" : tone === "warning" ? "text-warning" : "text-fg",
			)}
		>
			<WarningCircleIcon className="size-8" weight="fill" />
			<h2 className="mt-3 text-base font-bold">{title}</h2>
			<p className="mt-1 text-xs leading-5 text-fg-muted">{children}</p>
			{onRetry ? (
				<Button className="mt-4" size="sm" onClick={onRetry}>
					<Trans>Retry</Trans>
				</Button>
			) : null}
		</div>
	);
}

function FilterLabel({ filter }: { filter: VaultFilter }) {
	if (filter === "official") return <Trans>Official</Trans>;
	if (filter === "user") return <Trans>User</Trans>;
	if (filter === "deposited") return <Trans>Deposited</Trans>;
	if (filter === "leading") return <Trans>Leading</Trans>;
	return <Trans>All Vaults</Trans>;
}

function GroupLabel({ group }: { group: VaultListGroup["id"] }) {
	if (group === "official") return <Trans>Official Vaults</Trans>;
	if (group === "user") return <Trans>User Vaults</Trans>;
	return <Trans>Vaults</Trans>;
}

function getVisibleGroups(
	rows: readonly VaultListItem[],
	filter: VaultFilter,
	classificationAvailable: boolean,
): readonly VaultListGroup[] {
	if (filter === "all") return groupVaultRows(rows, classificationAvailable);
	if (filter === "official" || filter === "user") return rows.length ? [{ id: filter, rows }] : [];
	return rows.length ? [{ id: "unclassified", rows }] : [];
}
