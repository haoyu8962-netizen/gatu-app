import { Trans, useLingui } from "@lingui/react/macro";
import {
	ArrowClockwiseIcon,
	ArrowRightIcon,
	LinkIcon,
	LockKeyIcon,
	SpinnerGapIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import {
	Alert,
	Badge,
	Button,
	Select,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@sairn/ui";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FUNDS_OUTCOME_TOAST_DURATION_MS } from "@/config/time";
import { useMasterWalletRequiredMessage } from "@/hooks/trade/use-master-wallet-action-reason";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDateTime, shortenAddress, useNumberFormat } from "@/lib/format";
import { getExplorerTxUrl } from "@/lib/hyperliquid";
import {
	canDelegateToValidator,
	canUndelegate,
	formatStakingAmount,
	formatStakingRatio,
	isSystemFinalizedWithdrawal,
	type StakingActionRequest,
	type StakingActionSubmission,
	type StakingHistoryAction,
	type StakingLink,
	type StakingValidatorStatus,
} from "./domain/staking";
import { getStakingActionFailureNotice, getStakingActionSuccessMessage } from "./domain/staking-action-feedback";
import { StakingActionModal } from "./staking-action-modal";
import type { StakingActionSession } from "./use-staking-actions";
import type { StakingController } from "./use-staking-controller";

type StakingTab = "validators" | "rewards" | "actions";
type ValidatorFilter = "all" | StakingValidatorStatus;

export interface StakingViewProps extends StakingController {
	onActionSubmit?: (submission: StakingActionSubmission) => void;
	actionsEnabled?: boolean;
	actionSession?: StakingActionSession | null;
	actionLocked?: boolean;
	hasPendingAction?: boolean;
	onActionBack?: () => void;
	onActionConfirm?: () => void;
	onActionRetry?: () => void;
	onActionVerify?: () => void;
	onActionClose?: () => void;
}

export function StakingView(props: StakingViewProps) {
	const { t } = useLingui();
	const numberFormat = useNumberFormat();
	const isMobile = useIsMobile();
	const titleId = useId();
	const masterWalletReasonId = useId();
	const actionReasonId = props.agentOnlySession ? masterWalletReasonId : undefined;
	const [activeTab, setActiveTab] = useState<StakingTab>("validators");
	const [validatorFilter, setValidatorFilter] = useState<ValidatorFilter>("all");
	const [activeAction, setActiveAction] = useState<StakingActionRequest | null>(null);
	const reportedOutcomeRef = useRef<string | null>(null);
	useEffect(() => {
		const session = props.actionSession;
		const settledResult = session?.state.stage === "done" ? session.state.result : null;
		if (!session || !settledResult || settledResult === "unknown") {
			reportedOutcomeRef.current = null;
			return;
		}
		const outcomeKey = `${session.identityKey}:${session.reference?.id ?? "no-reference"}:${settledResult}`;
		if (reportedOutcomeRef.current === outcomeKey) return;
		reportedOutcomeRef.current = outcomeKey;
		if (settledResult === "success") {
			const hash = session.match?.hash;
			const amount = formatStakingAmount(session.submission.amount, numberFormat, 8);
			toast.success(t(getStakingActionSuccessMessage(session.submission.request.kind, amount)), {
				description: hash ? (
					<a
						href={getExplorerTxUrl(hash, props.env === "Testnet")}
						target="_blank"
						rel="noopener"
						className="text-signal hover:text-signal-hover hover:underline"
					>
						<bdi dir="ltr">{shortenAddress(hash, 6, 6)}</bdi>
					</a>
				) : undefined,
				duration: FUNDS_OUTCOME_TOAST_DURATION_MS,
			});
			props.onActionClose?.();
			return;
		}
		const failure = getStakingActionFailureNotice(settledResult, session.errorMessage);
		toast.error(t(failure.title), {
			description: t(failure.description),
			duration: FUNDS_OUTCOME_TOAST_DURATION_MS,
		});
		props.onActionRetry?.();
	});
	const account = props.account;
	const canOpenActions = Boolean(
		account &&
			props.hasExactMasterSigner &&
			!props.agentOnlySession &&
			props.onActionSubmit &&
			(props.actionsEnabled ?? true) &&
			!props.hasPendingAction,
	);
	const visibleValidators = useMemo(
		() =>
			validatorFilter === "all"
				? props.validatorViews
				: props.validatorViews.filter((validator) => validator.status === validatorFilter),
		[props.validatorViews, validatorFilter],
	);
	const validatorNames = useMemo(
		() => new Map(props.validators.map((validator) => [validator.validator.toLowerCase(), validator.name] as const)),
		[props.validators],
	);
	const periodOptions = [
		{ value: "day", label: t`24H` },
		{ value: "week", label: t`7D` },
		{ value: "month", label: t`30D` },
	];
	const validatorFilterOptions = [
		{ value: "all", label: t`All validators` },
		{ value: "active", label: t`Active` },
		{ value: "jailed", label: t`Jailed` },
		{ value: "inactive", label: t`Inactive` },
	];

	function openAction(action: StakingActionRequest) {
		if (!canOpenActions) return;
		setActiveAction(action);
	}

	return (
		<div data-state={props.pageState} data-page-state={props.pageState} className="space-y-3">
			{props.hasPendingAction ? (
				<Alert
					tone="warning"
					size="xs"
					title={t`A funds operation is awaiting verification`}
					description={t`Do not submit another staking funds operation. The shared recovery panel will keep checking Hyperliquid history.`}
				/>
			) : null}
			<section className="rounded-24 bg-surface p-4 shadow-raised min-[1001px]:p-5" aria-labelledby={titleId}>
				<div className="flex flex-col gap-4 min-[1001px]:flex-row min-[1001px]:items-start min-[1001px]:justify-between">
					<div>
						<h1 id={titleId} className="text-xl font-bold text-fg">
							<Trans>Staking</Trans>
						</h1>
						<p className="mt-1 max-w-2xl text-xs leading-5 text-fg-muted">
							{props.env === "Testnet" ? (
								<Trans>
									Delegate HYPE to validators to support consensus and earn rewards. Undelegating returns HYPE to
									staking availability; only a separate transfer to Spot starts the Testnet queue, which takes
									approximately five minutes.
								</Trans>
							) : (
								<Trans>
									Delegate HYPE to validators to support consensus and earn rewards. Undelegating returns HYPE to
									staking availability; only a separate transfer to Spot starts the seven-day queue.
								</Trans>
							)}
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							intent="neutral"
							disabled={!canOpenActions || account?.spotHypeAvailable === "0"}
							focusableWhenDisabled={props.agentOnlySession}
							aria-describedby={actionReasonId}
							onClick={() => account && openAction({ kind: "cDeposit", maxAmount: account.spotHypeAvailable })}
						>
							<Trans>Spot to staking</Trans>
						</Button>
						<Button
							variant="outline"
							intent="neutral"
							disabled={
								!canOpenActions ||
								account?.summary.undelegated === "0" ||
								(account?.summary.nPendingWithdrawals ?? 0) >= 5
							}
							focusableWhenDisabled={props.agentOnlySession}
							aria-describedby={actionReasonId}
							title={
								(account?.summary.nPendingWithdrawals ?? 0) >= 5
									? t`The address already has five pending withdrawals.`
									: undefined
							}
							onClick={() => account && openAction({ kind: "cWithdraw", maxAmount: account.summary.undelegated })}
						>
							<Trans>Staking to Spot</Trans>
						</Button>
					</div>
				</div>
				{props.isRefreshing ? (
					<output className="mt-3 flex items-center gap-1.5 text-2xs text-fg-muted" aria-live="polite">
						<SpinnerGapIcon aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />
						<Trans>Refreshing staking data…</Trans>
					</output>
				) : null}
			</section>

			<div className="grid gap-3 min-[1001px]:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
				<section className="rounded-24 bg-surface p-4 shadow-raised" aria-label={t`Staking overview`}>
					<div className="grid grid-cols-2 gap-2">
						<MetricCard
							label={<Trans>Network stake</Trans>}
							value={
								props.networkStakeApproximate === null
									? "0 HYPE"
									: `≈ ${formatStakingAmount(props.networkStakeApproximate, numberFormat, 0)} HYPE`
							}
							description={<Trans>Approximate: the SDK parses the raw total as a JavaScript number.</Trans>}
						/>
						<MetricCard
							label={<Trans>Your delegated stake</Trans>}
							value={account ? `${formatStakingAmount(account.summary.delegated, numberFormat)} HYPE` : "0 HYPE"}
							description={
								props.weightedApr === null ? (
									<Trans>Estimated APR unavailable</Trans>
								) : (
									<Trans>Estimated APR {formatStakingRatio(props.weightedApr, numberFormat)}</Trans>
								)
							}
						/>
					</div>
					<div className="mt-3 divide-y divide-stroke-weak">
						<BalanceRow
							label={<Trans>Available in Spot</Trans>}
							value={account ? `${formatStakingAmount(account.spotHypeAvailable, numberFormat)} HYPE` : "0 HYPE"}
						/>
						<BalanceRow
							label={<Trans>Available for delegation</Trans>}
							value={account ? `${formatStakingAmount(account.summary.undelegated, numberFormat)} HYPE` : "0 HYPE"}
						/>
						<BalanceRow
							label={<Trans>Delegated</Trans>}
							value={account ? `${formatStakingAmount(account.summary.delegated, numberFormat)} HYPE` : "0 HYPE"}
						/>
						<BalanceRow
							label={<Trans>Pending transfer to Spot</Trans>}
							value={
								account ? `${formatStakingAmount(account.summary.totalPendingWithdrawal, numberFormat)} HYPE` : "0 HYPE"
							}
						/>
					</div>
				</section>

				<section className="rounded-24 bg-surface p-4 shadow-raised" aria-label={t`Account staking status`}>
					<AccountStatePanel {...props} masterWalletReasonId={masterWalletReasonId} />
					{account ? (
						<>
							<div className="mt-3 rounded-16 border border-stroke-warning-weak bg-warning-soft p-3">
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-2">
										<LockKeyIcon aria-hidden="true" className="size-4 text-icon-warning" />
										<h2 className="text-xs font-semibold text-fg">
											<Trans>Pending Spot transfer</Trans>
										</h2>
									</div>
									<span className="text-xs font-semibold text-warning tabular-nums">
										<bdi dir="ltr">
											{formatStakingAmount(account.summary.totalPendingWithdrawal, numberFormat)} HYPE ·{" "}
											{account.summary.nPendingWithdrawals}/5
										</bdi>
									</span>
								</div>
								<p className="mt-2 text-2xs leading-4 text-fg-muted">
									{props.env === "Testnet" ? (
										<Trans>
											Transfers to Spot use an approximately five-minute queue on Testnet. Hyperliquid exposes only the
											aggregate amount and count, so no individual unlock time or progress is inferred here.
										</Trans>
									) : (
										<Trans>
											Transfers to Spot use a seven-day queue. Hyperliquid exposes only the aggregate amount and count,
											so no individual unlock time or progress is inferred here.
										</Trans>
									)}
								</p>
							</div>
							<StakingLinkCard link={account.stakingLink} />
						</>
					) : null}
				</section>
			</div>

			<section className="overflow-hidden rounded-24 bg-surface shadow-raised" aria-label={t`Staking details`}>
				<Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as StakingTab)}>
					<div className="flex flex-col gap-2 px-3 pt-2 min-[1001px]:flex-row min-[1001px]:items-center min-[1001px]:justify-between">
						<TabsList aria-label={t`Staking detail views`} className="overflow-x-auto">
							<TabsTrigger value="validators">
								<Trans>Validator performance</Trans>
							</TabsTrigger>
							<TabsTrigger value="rewards">
								<Trans>Staking rewards</Trans>
							</TabsTrigger>
							<TabsTrigger value="actions">
								<Trans>Staking actions</Trans>
							</TabsTrigger>
						</TabsList>
						<div className="flex items-center gap-2">
							{activeTab === "validators" ? (
								<Select
									value={validatorFilter}
									onValueChange={(value) => value && setValidatorFilter(value as ValidatorFilter)}
									options={validatorFilterOptions}
									triggerAriaLabel={t`Filter validators`}
									className="w-full min-[1001px]:w-36"
								/>
							) : null}
							{activeTab === "validators" ? (
								<Select
									value={props.period}
									onValueChange={(value) => value && props.setPeriod(value as typeof props.period)}
									options={periodOptions}
									triggerAriaLabel={t`Validator performance period`}
									className="w-24 shrink-0"
								/>
							) : null}
						</div>
					</div>

					<TabsContent value="validators" className="pt-0">
						<ValidatorContent
							publicState={props.publicState}
							validators={visibleValidators}
							canOpenActions={canOpenActions}
							actionReasonId={actionReasonId}
							availableToDelegate={account?.summary.undelegated ?? "0"}
							onRetry={props.retryPublic}
							onOpenAction={openAction}
						/>
					</TabsContent>
					<TabsContent value="rewards" className="pt-0">
						<RewardsContent accountState={props.accountState} rewards={account?.rewards} onRetry={props.retryAccount} />
					</TabsContent>
					<TabsContent value="actions" className="pt-0">
						<HistoryContent
							accountState={props.accountState}
							history={account?.history}
							validatorNames={validatorNames}
							isTestnet={props.env === "Testnet"}
							onRetry={props.retryAccount}
						/>
					</TabsContent>
				</Tabs>
			</section>

			<Alert
				tone="information"
				size="xs"
				title={t`Rewards compound automatically`}
				description={t`Staking rewards accrue every minute, are distributed daily, and are automatically redelegated. There is no separate staking reward collection action.`}
			/>

			{activeAction && props.ownerAddress && props.onActionSubmit ? (
				<StakingActionModal
					key={`${activeAction.kind}:${activeAction.validator ?? "balance"}`}
					action={activeAction}
					ownerAddress={props.ownerAddress}
					open
					isMobile={isMobile}
					isTestnet={props.env === "Testnet"}
					onOpenChange={(open) => {
						if (!open) setActiveAction(null);
					}}
					onSubmit={props.onActionSubmit}
				/>
			) : null}

			{props.actionSession && props.ownerAddress ? (
				<StakingActionModal
					key={`session:${props.actionSession.submission.request.kind}:${props.actionSession.submission.request.validator ?? "balance"}`}
					action={props.actionSession.submission.request}
					ownerAddress={props.ownerAddress}
					open
					isMobile={isMobile}
					submission={props.actionSession.submission}
					fundsState={props.actionSession.state}
					errorMessage={props.actionSession.errorMessage}
					reference={props.actionSession.reference}
					locked={props.actionLocked}
					isTestnet={props.env === "Testnet"}
					onOpenChange={(open) => {
						if (!open) props.onActionClose?.();
					}}
					onBack={props.onActionBack}
					onConfirm={props.onActionConfirm}
					onVerify={props.onActionVerify}
					onSubmit={() => {}}
				/>
			) : null}
		</div>
	);
}

function AccountStatePanel(props: StakingViewProps & { masterWalletReasonId: string }) {
	const { t } = useLingui();
	const masterWalletRequiredMessage = useMasterWalletRequiredMessage();
	if (props.accountState === "disconnected" && !props.agentOnlySession) {
		return (
			<div className="py-3 text-center">
				<h2 className="text-sm font-semibold text-fg">
					<Trans>Connect your master wallet</Trans>
				</h2>
				<p className="mx-auto mt-1 max-w-md text-xs leading-5 text-fg-muted">
					<Trans>Public validator data remains visible. Account balances and actions require a verified owner.</Trans>
				</p>
				<Button className="mt-3" onClick={props.connectMasterWallet} disabled={props.isReconnecting}>
					<Trans>Connect wallet</Trans>
				</Button>
			</div>
		);
	}
	if (props.accountState === "loading") {
		return (
			<output className="block space-y-2" aria-label={t`Loading staking account`}>
				<div className="h-8 animate-pulse rounded-8 bg-fill-weak motion-reduce:animate-none" />
				<div className="h-8 animate-pulse rounded-8 bg-fill-weak motion-reduce:animate-none" />
			</output>
		);
	}
	if (props.accountState === "error") {
		return (
			<div role="alert" className="py-3 text-center">
				<WarningCircleIcon aria-hidden="true" className="mx-auto size-8 text-icon-error" />
				<h2 className="mt-2 text-sm font-semibold text-fg">
					<Trans>Account staking data unavailable</Trans>
				</h2>
				<p className="mt-1 text-xs text-fg-muted">
					<Trans>Balances remain unknown and every staking action is disabled until fresh data is verified.</Trans>
				</p>
				<Button className="mt-3" variant="outline" intent="neutral" onClick={props.retryAccount}>
					<ArrowClockwiseIcon aria-hidden="true" />
					<Trans>Retry</Trans>
				</Button>
			</div>
		);
	}
	if (props.agentOnlySession) {
		return <Alert id={props.masterWalletReasonId} tone="neutral" size="xs" description={masterWalletRequiredMessage} />;
	}
	if (!props.hasExactMasterSigner) {
		return (
			<Alert
				tone="warning"
				size="xs"
				title={t`Master wallet required`}
				description={t`The verified owner data is read-only in this session. An Agent/API wallet is never used as the staking owner or signer.`}
				actions={
					<Button size="xs" onClick={props.connectMasterWallet} disabled={props.isReconnecting}>
						<Trans>Reconnect master wallet</Trans>
					</Button>
				}
			/>
		);
	}
	return (
		<div className="flex items-center justify-between gap-3 rounded-16 border border-stroke-success-weak bg-success-soft p-3">
			<div>
				<h2 className="text-xs font-semibold text-fg">
					<Trans>Master wallet verified</Trans>
				</h2>
				<p className="mt-1 text-2xs text-fg-muted">
					<bdi dir="ltr">{shortenAddress(props.ownerAddress ?? "", 6, 6)}</bdi>
				</p>
			</div>
			<Badge tone="success" size="xs" dot>
				<Trans>Signing ready</Trans>
			</Badge>
		</div>
	);
}

function ValidatorContent({
	publicState,
	validators,
	canOpenActions,
	actionReasonId,
	availableToDelegate,
	onRetry,
	onOpenAction,
}: {
	publicState: StakingController["publicState"];
	validators: StakingController["validatorViews"];
	canOpenActions: boolean;
	actionReasonId: string | undefined;
	availableToDelegate: string;
	onRetry: () => void;
	onOpenAction: (request: StakingActionRequest) => void;
}) {
	const { i18n, t } = useLingui();
	const locale = i18n.locale;
	const numberFormat = useNumberFormat();
	if (publicState === "loading") return <TableSkeleton />;
	if (publicState === "error") {
		return (
			<EmptyState
				error
				title={<Trans>Validator data unavailable</Trans>}
				description={<Trans>The response could not be verified. No validator action is available.</Trans>}
				onRetry={onRetry}
			/>
		);
	}
	if (validators.length === 0) {
		return (
			<EmptyState
				title={<Trans>No validators found</Trans>}
				description={<Trans>No validator matches the selected status filter.</Trans>}
			/>
		);
	}
	return (
		<Table
			scrollableRegionLabel={t`Validator performance table`}
			containerClassName="overscroll-x-contain"
			className="min-w-[var(--staking-validator-table-min)]"
		>
			<TableHeader>
				<TableRow>
					<TableHead size="dense">
						<Trans>Validator</Trans>
					</TableHead>
					<TableHead size="dense">
						<Trans>Status</Trans>
					</TableHead>
					<TableHead size="dense" className="text-right">
						<Trans>Network stake</Trans>
					</TableHead>
					<TableHead size="dense" className="text-right">
						<Trans>Your stake</Trans>
					</TableHead>
					<TableHead size="dense" className="text-right">
						<Trans>Uptime</Trans>
					</TableHead>
					<TableHead size="dense" className="text-right">
						<Trans>APR</Trans>
					</TableHead>
					<TableHead size="dense" className="text-right">
						<Trans>Commission</Trans>
					</TableHead>
					<TableHead size="dense" className="text-right">
						<Trans>Actions</Trans>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{validators.map((validator) => {
					const mayDelegate = canDelegateToValidator(validator) && availableToDelegate !== "0";
					const mayUndelegate = canUndelegate(
						validator.lockedUntilTimestamp === null
							? undefined
							: { amount: validator.delegatedAmount, lockedUntilTimestamp: validator.lockedUntilTimestamp },
					);
					return (
						<TableRow key={validator.validator}>
							<TableCell size="dense" className="max-w-64">
								<p className="truncate font-semibold text-fg">
									{validator.name || <bdi dir="ltr">{shortenAddress(validator.validator)}</bdi>}
								</p>
								<p className="mt-0.5 truncate text-2xs text-fg-muted">{validator.description}</p>
							</TableCell>
							<TableCell size="dense">
								<ValidatorStatusBadge status={validator.status} />
							</TableCell>
							<TableCell size="dense" className="text-right text-fg tabular-nums">
								<bdi dir="ltr">≈ {formatStakingAmount(validator.stakeApproximateHype, numberFormat, 0)} HYPE</bdi>
							</TableCell>
							<TableCell size="dense" className="text-right text-fg tabular-nums">
								<bdi dir="ltr">{formatStakingAmount(validator.delegatedAmount, numberFormat)} HYPE</bdi>
								{validator.lockedUntilTimestamp && validator.lockedUntilTimestamp > Date.now() ? (
									<span className="mt-0.5 block text-2xs text-warning">
										<Trans>Locked until {formatDateTime(validator.lockedUntilTimestamp, { locale })}</Trans>
									</span>
								) : null}
							</TableCell>
							<TableCell size="dense" className="text-right tabular-nums">
								<bdi dir="ltr">{formatStakingRatio(validator.selectedStats.uptimeFraction, numberFormat)}</bdi>
							</TableCell>
							<TableCell size="dense" className="text-right tabular-nums">
								<bdi dir="ltr">{formatStakingRatio(validator.selectedStats.predictedApr, numberFormat)}</bdi>
							</TableCell>
							<TableCell size="dense" className="text-right tabular-nums">
								<bdi dir="ltr">{formatStakingRatio(validator.commission, numberFormat)}</bdi>
							</TableCell>
							<TableCell size="dense">
								<div className="flex justify-end gap-1">
									<Button
										size="xs"
										variant="outline"
										intent="brand"
										disabled={!canOpenActions || !mayDelegate}
										focusableWhenDisabled={actionReasonId !== undefined}
										aria-describedby={actionReasonId}
										onClick={() =>
											onOpenAction({
												kind: "delegate",
												maxAmount: availableToDelegate,
												validator: validator.validator,
												validatorName: validator.name,
											})
										}
									>
										<Trans>Delegate</Trans>
									</Button>
									<Button
										size="xs"
										variant="ghost"
										intent="neutral"
										disabled={!canOpenActions || !mayUndelegate}
										focusableWhenDisabled={actionReasonId !== undefined}
										aria-describedby={actionReasonId}
										onClick={() =>
											onOpenAction({
												kind: "undelegate",
												maxAmount: validator.delegatedAmount,
												validator: validator.validator,
												validatorName: validator.name,
												lockedUntilTimestamp: validator.lockedUntilTimestamp,
											})
										}
									>
										<Trans>Undelegate</Trans>
									</Button>
								</div>
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}

function RewardsContent({
	accountState,
	rewards,
	onRetry,
}: {
	accountState: StakingController["accountState"];
	rewards: NonNullable<StakingController["account"]>["rewards"] | undefined;
	onRetry: () => void;
}) {
	const { i18n, t } = useLingui();
	const locale = i18n.locale;
	const numberFormat = useNumberFormat();
	if (accountState === "disconnected") {
		return (
			<EmptyState
				title={<Trans>Connect to view rewards</Trans>}
				description={<Trans>Reward history is scoped to the verified owner.</Trans>}
			/>
		);
	}
	if (accountState === "loading") return <TableSkeleton />;
	if (accountState === "error" || !rewards) {
		return (
			<EmptyState
				error
				title={<Trans>Reward history unavailable</Trans>}
				description={<Trans>The reward response could not be verified.</Trans>}
				onRetry={onRetry}
			/>
		);
	}
	if (rewards.length === 0) {
		return (
			<EmptyState
				title={<Trans>No staking rewards</Trans>}
				description={<Trans>No reward records were returned for this account.</Trans>}
			/>
		);
	}
	return (
		<Table scrollableRegionLabel={t`Staking rewards table`} className="min-w-[var(--staking-rewards-table-min)]">
			<TableHeader>
				<TableRow>
					<TableHead size="dense">
						<Trans>Time</Trans>
					</TableHead>
					<TableHead size="dense">
						<Trans>Reward source</Trans>
					</TableHead>
					<TableHead size="dense" className="text-right">
						<Trans>Reward</Trans>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rewards.map((reward) => (
					<TableRow key={`${reward.time}:${reward.source}:${reward.totalAmount}`}>
						<TableCell size="dense" className="text-fg">
							{formatDateTime(reward.time, { locale })}
						</TableCell>
						<TableCell size="dense">
							{reward.source === "delegation" ? <Trans>Delegation</Trans> : <Trans>Validator commission</Trans>}
						</TableCell>
						<TableCell size="dense" className="text-right font-semibold text-success tabular-nums">
							<bdi dir="ltr">+{formatStakingAmount(reward.totalAmount, numberFormat, 8)} HYPE</bdi>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

function HistoryContent({
	accountState,
	history,
	validatorNames,
	isTestnet,
	onRetry,
}: {
	accountState: StakingController["accountState"];
	history: NonNullable<StakingController["account"]>["history"] | undefined;
	validatorNames: ReadonlyMap<string, string>;
	isTestnet: boolean;
	onRetry: () => void;
}) {
	const { i18n, t } = useLingui();
	const locale = i18n.locale;
	const numberFormat = useNumberFormat();
	if (accountState === "disconnected") {
		return (
			<EmptyState
				title={<Trans>Connect to view staking actions</Trans>}
				description={<Trans>Action history is scoped to the verified owner.</Trans>}
			/>
		);
	}
	if (accountState === "loading") return <TableSkeleton />;
	if (accountState === "error" || !history) {
		return (
			<EmptyState
				error
				title={<Trans>Staking action history unavailable</Trans>}
				description={<Trans>The history response could not be verified.</Trans>}
				onRetry={onRetry}
			/>
		);
	}
	if (history.length === 0) {
		return (
			<EmptyState
				title={<Trans>No staking actions</Trans>}
				description={<Trans>No staking action records were returned for this account.</Trans>}
			/>
		);
	}
	return (
		<Table scrollableRegionLabel={t`Staking action history table`} className="min-w-[var(--staking-history-table-min)]">
			<TableHeader>
				<TableRow>
					<TableHead size="dense">
						<Trans>Time</Trans>
					</TableHead>
					<TableHead size="dense">
						<Trans>Action</Trans>
					</TableHead>
					<TableHead size="dense" className="text-right">
						<Trans>Amount</Trans>
					</TableHead>
					<TableHead size="dense" className="text-right">
						<Trans>Transaction</Trans>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{history.map((entry) => (
					<TableRow key={`${entry.time}:${entry.hash}:${entry.action.type}`}>
						<TableCell size="dense" className="text-fg">
							{formatDateTime(entry.time, { locale })}
						</TableCell>
						<TableCell size="dense">{getHistoryActionLabel(entry.action, validatorNames)}</TableCell>
						<TableCell size="dense" className="text-right text-fg tabular-nums">
							<bdi dir="ltr">{formatStakingAmount(entry.action.amount, numberFormat, 8)} HYPE</bdi>
						</TableCell>
						<TableCell size="dense" className="text-right">
							{isSystemFinalizedWithdrawal(entry) ? (
								<span className="text-fg-muted">
									<Trans>System finalization · hash unavailable</Trans>
								</span>
							) : (
								<a
									href={getExplorerTxUrl(entry.hash, isTestnet)}
									target="_blank"
									rel="noopener"
									className="inline-flex items-center gap-1 text-signal hover:text-signal-hover hover:underline"
								>
									<bdi dir="ltr">{shortenAddress(entry.hash, 6, 6)}</bdi>
									<ArrowRightIcon aria-hidden="true" className="size-3" />
								</a>
							)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

function getHistoryActionLabel(action: StakingHistoryAction, validatorNames: ReadonlyMap<string, string>) {
	if (action.type === "cDeposit") return <Trans>Spot to staking available</Trans>;
	if (action.type === "withdrawalInitiated") return <Trans>Staking to Spot · initiated</Trans>;
	if (action.type === "withdrawalFinalized") return <Trans>Staking to Spot · finalized</Trans>;
	const validatorName = validatorNames.get(action.validator.toLowerCase());
	const validator = validatorName || <bdi dir="ltr">{shortenAddress(action.validator)}</bdi>;
	return action.type === "delegate" ? (
		<Trans>Delegated to {validator}</Trans>
	) : (
		<Trans>Undelegated from {validator}</Trans>
	);
}

function StakingLinkCard({ link }: { link: StakingLink }) {
	return (
		<div className="mt-3 rounded-16 border border-stroke-weak p-3">
			<div className="flex items-center gap-2">
				<LinkIcon aria-hidden="true" className="size-4 text-icon" />
				<h2 className="text-xs font-semibold text-fg">
					<Trans>Permanent staking link</Trans>
				</h2>
				<Badge tone="neutral" size="xxs">
					<Trans>Read only</Trans>
				</Badge>
			</div>
			<p className="mt-2 text-xs text-fg">{getStakingLinkLabel(link)}</p>
			<p className="mt-1 text-2xs leading-4 text-fg-muted">
				<Trans>
					A staking link cannot be removed. The staking account gains full control of the trading account's funds, so
					this page does not offer a link action.
				</Trans>
			</p>
		</div>
	);
}

function getStakingLinkLabel(link: StakingLink) {
	if (!link) return <Trans>No separate staking account is linked.</Trans>;
	if (link.type === "requested")
		return (
			<Trans>
				Permanent link requested for <bdi dir="ltr">{shortenAddress(link.stakingUser, 6, 6)}</bdi>.
			</Trans>
		);
	if (link.type === "tradingUser")
		return (
			<Trans>
				Linked staking account: <bdi dir="ltr">{shortenAddress(link.stakingUser, 6, 6)}</bdi>.
			</Trans>
		);
	return (
		<Trans>
			This staking account controls trading account <bdi dir="ltr">{shortenAddress(link.tradingUser, 6, 6)}</bdi>.
		</Trans>
	);
}

function ValidatorStatusBadge({ status }: { status: StakingValidatorStatus }) {
	const { t } = useLingui();
	if (status === "active")
		return (
			<Badge tone="success" size="xs" dot>
				<Trans>Active</Trans>
			</Badge>
		);
	if (status === "jailed")
		return (
			<Badge tone="error" size="xs" dot title={t`Jailed validators produce no blocks or rewards`}>
				<Trans>Jailed</Trans>
			</Badge>
		);
	return (
		<Badge tone="warning" size="xs" dot>
			<Trans>Inactive</Trans>
		</Badge>
	);
}

function MetricCard({ label, value, description }: { label: ReactNode; value: string; description: ReactNode }) {
	return (
		<div className="py-3">
			<p className="text-2xs text-fg-muted">{label}</p>
			<p className="mt-1 text-base font-bold text-fg tabular-nums">
				<bdi dir="ltr">{value}</bdi>
			</p>
			<p className="mt-1 text-2xs leading-4 text-fg-muted">{description}</p>
		</div>
	);
}

function BalanceRow({ label, value }: { label: ReactNode; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3 py-2 text-xs">
			<span className="text-fg-muted">{label}</span>
			<span className="font-semibold text-fg tabular-nums">
				<bdi dir="ltr">{value}</bdi>
			</span>
		</div>
	);
}

function EmptyState({
	error,
	title,
	description,
	onRetry,
}: {
	error?: boolean;
	title: ReactNode;
	description: ReactNode;
	onRetry?: () => void;
}) {
	return (
		<div role={error ? "alert" : undefined} className="px-4 py-12 text-center">
			{error ? <WarningCircleIcon aria-hidden="true" className="mx-auto size-8 text-icon-error" /> : null}
			<h3 className="mt-2 text-sm font-semibold text-fg">{title}</h3>
			<p className="mt-1 text-xs text-fg-muted">{description}</p>
			{onRetry ? (
				<Button className="mt-3" variant="outline" intent="neutral" onClick={onRetry}>
					<ArrowClockwiseIcon aria-hidden="true" />
					<Trans>Retry</Trans>
				</Button>
			) : null}
		</div>
	);
}

function TableSkeleton() {
	const { t } = useLingui();
	return (
		<output aria-label={t`Loading staking table`} className="block space-y-2 px-3 py-4">
			<div className="h-8 animate-pulse rounded-8 bg-fill-weak motion-reduce:animate-none" />
			<div className="h-8 animate-pulse rounded-8 bg-fill-weak motion-reduce:animate-none" />
			<div className="h-8 animate-pulse rounded-8 bg-fill-weak motion-reduce:animate-none" />
		</output>
	);
}
