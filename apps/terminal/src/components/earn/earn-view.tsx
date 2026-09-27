import {
	Button,
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
	Tooltip,
} from "@gatu/ui";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import Big from "big.js";
import { type ReactNode, useId, useState } from "react";
import { TOUCH_PRESS_FADE_CLASS } from "@/components/ui/touch-press";
import {
	EARN_HIDDEN_UNLESS_HELD_TOKEN,
	type EarnActionBlock,
	type EarnAssetRow,
	type EarnOperation,
	getEarnActionBlock,
	getHealthFactorDisplayRatio,
} from "@/domain/earn";
import type { EarnData } from "@/hooks/earn/use-earn-data";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber, formatPercent, formatUSD } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import type { AccountLedgerRow } from "@/lib/trade/account-ledger";

type EarnTab = "supplyBorrow" | "interest" | "history";

interface Props {
	data: EarnData;
	isMobile: boolean;
	actionsAllowed: boolean;
	notice: string | null;
	onOpenAction: (operation: EarnOperation, token: number | null) => void;
}

type Translate = (descriptor: MessageDescriptor) => string;

const PLACEHOLDER = "-";

export function EarnView({ data, isMobile, actionsAllowed, notice, onOpenAction }: Props) {
	const { t } = useLingui();
	useNumberFormatRevision();
	const translate = (descriptor: MessageDescriptor) => t(descriptor);
	const titleId = useId();
	const [tab, setTab] = useState<EarnTab>("supplyBorrow");
	const snapshot = data.snapshot;
	const summary = data.accountStatus === "ready" ? (snapshot?.summary ?? null) : null;
	const supplyRows = snapshot?.supplyRows ?? [];
	const borrowRows = snapshot?.borrowRows ?? [];
	const availabilityInput = {
		portfolioMargin: data.portfolioMargin,
		accountReady: actionsAllowed && data.accountStatus === "ready" && data.publicStatus === "ready",
		summary,
		supplyRows,
	};
	const blocks: Record<EarnOperation, EarnActionBlock> = {
		supply: getEarnActionBlock("supply", availabilityInput),
		withdraw: getEarnActionBlock("withdraw", availabilityInput),
		borrow: getEarnActionBlock("borrow", availabilityInput),
		repay: getEarnActionBlock("repay", availabilityInput),
	};
	const healthRatio = summary ? getHealthFactorDisplayRatio(summary) : null;
	const firstSupplied = supplyRows.find((row) => Big(row.supplied).gt(0))?.token ?? null;
	const firstBorrowed = borrowRows.find((row) => Big(row.borrowed).gt(0))?.token ?? null;
	const busy = data.publicStatus !== "ready" || data.accountStatus === "loading";

	const headerActions: { operation: EarnOperation; label: string; token: number | null; primary: boolean }[] = [
		{ operation: "supply", label: t`Supply`, token: null, primary: true },
		{ operation: "withdraw", label: t`Withdraw`, token: firstSupplied, primary: false },
		{ operation: "borrow", label: t`Borrow`, token: null, primary: false },
		{ operation: "repay", label: t`Repay`, token: firstBorrowed, primary: false },
	];

	return (
		<div className="space-y-3 font-market-close" aria-busy={busy || undefined}>
			<section className="rounded-24 bg-surface p-4 min-[1001px]:p-5" aria-labelledby={titleId}>
				<div className="flex flex-col gap-4 min-[1001px]:flex-row min-[1001px]:items-start min-[1001px]:justify-between">
					<div className="min-w-0">
						<h1 id={titleId} className="text-xl font-bold text-fg">
							{t`Earn`}
						</h1>
						<p className="mt-1 max-w-2xl text-xs leading-5 text-fg-muted">
							{data.portfolioMargin
								? t`Supplying and borrowing happen automatically on Portfolio Margin mode. Quote assets like USDC or USDT that are not being utilized are supplied and earn interest. Trades that require additional quote assets will borrow against collateral like HYPE or BTC. Borrows pay interest, and collateral remains locked until the borrows are repaid.`
								: t`Supply quote assets like USDC or USDT to earn interest or supply assets like HYPE or BTC as collateral to borrow against. Quote asset suppliers earn yield paid by borrowers. Borrowers pay interest, and collateral remains locked until the borrows are repaid.`}
						</p>
					</div>
					<div className="grid grid-cols-2 gap-2 min-[1001px]:flex min-[1001px]:shrink-0">
						{headerActions.map((action) => (
							<ActionButton
								key={action.operation}
								label={action.label}
								primary={action.primary}
								reason={getBlockReason(blocks[action.operation], translate, action.operation)}
								disabled={blocks[action.operation] !== null}
								onClick={() => onOpenAction(action.operation, action.token)}
							/>
						))}
					</div>
				</div>
				{notice ? (
					<p className="mt-3 rounded-16 border border-stroke-info-weak bg-info-soft p-2.5 text-xs text-info">
						{notice}
					</p>
				) : null}
			</section>

			<div className="grid grid-cols-2 gap-3 min-[1001px]:grid-cols-3">
				<StatCard
					label={
						<Tooltip
							content={t`Account Value weighted by LTV / Borrowed Amount. If this number is below 100%, the account cannot borrow more.`}
						>
							<button
								type="button"
								className={cn(
									"cursor-help text-start underline decoration-dashed decoration-stroke-strong underline-offset-4",
									TOUCH_PRESS_FADE_CLASS,
								)}
							>
								{t`Your Health Factor`}
							</button>
						</Tooltip>
					}
					value={healthRatio === null ? "--" : formatPercent(healthRatio, { signDisplay: "auto" })}
				/>
				<StatCard label={t`Your Total Supplied`} value={formatStatUsd(summary?.totalSuppliedUsd ?? "0", isMobile)} />
				<StatCard label={t`Your Total Borrowed`} value={formatStatUsd(summary?.totalBorrowedUsd ?? "0", isMobile)} />
			</div>

			<section className="overflow-hidden rounded-24 bg-surface" aria-label={t`Earn details`}>
				<Tabs value={tab} onValueChange={(value) => setTab(value as EarnTab)}>
					<div className="px-3 pt-2">
						<TabsList aria-label={t`Earn detail views`} className="overflow-x-auto">
							<TabsTrigger value="supplyBorrow">{t`Supply and Borrow`}</TabsTrigger>
							<TabsTrigger value="interest">{t`Interest`}</TabsTrigger>
							<TabsTrigger value="history">{t`Earn Action History`}</TabsTrigger>
						</TabsList>
					</div>
					<TabsContent value="supplyBorrow" className="space-y-5 p-3 min-[1001px]:p-4">
						<AssetSection
							title={t`Supply`}
							kind="supply"
							rows={supplyRows}
							data={data}
							isMobile={isMobile}
							blocks={blocks}
							onOpenAction={onOpenAction}
						/>
						<AssetSection
							title={t`Borrow`}
							kind="borrow"
							rows={borrowRows}
							data={data}
							isMobile={isMobile}
							blocks={blocks}
							onOpenAction={onOpenAction}
						/>
					</TabsContent>
					<TabsContent value="interest" className="p-3 min-[1001px]:p-4">
						<InterestTable data={data} />
					</TabsContent>
					<TabsContent value="history" className="p-3 min-[1001px]:p-4">
						<HistoryTable rows={data.history} ready={data.historyStatus === "ready"} />
					</TabsContent>
				</Tabs>
			</section>
		</div>
	);
}

interface ActionButtonProps {
	label: string;
	primary: boolean;
	disabled: boolean;
	reason: string | null;
	onClick: () => void;
}

function ActionButton({ label, primary, disabled, reason, onClick }: ActionButtonProps) {
	const descriptionId = useId();
	const button = (
		<Button
			variant={primary ? "filled" : "outline"}
			intent={primary ? "brand" : "neutral"}
			disabled={disabled}
			focusableWhenDisabled={Boolean(reason)}
			onClick={onClick}
			aria-describedby={reason ? descriptionId : undefined}
			className="w-full max-[1000px]:min-h-11 min-[1001px]:w-auto min-[1001px]:min-w-24"
		>
			{label}
			{reason ? (
				<span id={descriptionId} className="sr-only">
					{reason}
				</span>
			) : null}
		</Button>
	);
	if (!reason) return button;
	return <Tooltip content={reason}>{button}</Tooltip>;
}

interface StatCardProps {
	label: ReactNode;
	value: string;
}

function StatCard({ label, value }: StatCardProps) {
	return (
		<div className="rounded-24 bg-surface p-4">
			<div className="text-xs text-fg-muted">{label}</div>
			<div className="mt-3 text-lg font-semibold text-fg tabular-nums">
				<bdi dir="ltr">{value}</bdi>
			</div>
		</div>
	);
}

interface AssetSectionProps {
	title: string;
	kind: "supply" | "borrow";
	rows: readonly EarnAssetRow[];
	data: EarnData;
	isMobile: boolean;
	blocks: Record<EarnOperation, EarnActionBlock>;
	onOpenAction: (operation: EarnOperation, token: number | null) => void;
}

interface RowAction {
	operation: EarnOperation;
	label: string;
	disabled: boolean;
	reason: string | null;
}

function AssetSection({ title, kind, rows, data, isMobile, blocks, onOpenAction }: AssetSectionProps) {
	const { t } = useLingui();
	useNumberFormatRevision();
	const translate = (descriptor: MessageDescriptor) => t(descriptor);
	const accountReady = data.accountStatus === "ready";
	const showInterest = !data.portfolioMargin;

	function getRepayReason(row: EarnAssetRow): string | null {
		if (blocks.repay === "portfolioMargin") return getBlockReason("portfolioMargin", translate, "repay");
		if (!accountReady || blocks.repay === "unavailable") return null;
		return Big(row.borrowed).gt(0) ? null : t`You have no borrows to repay.`;
	}

	function getActions(row: EarnAssetRow): RowAction[] {
		const spotAvailable = data.snapshotInputs.spotBalances.get(row.token)?.available ?? "0";
		if (kind === "supply") {
			return [
				{
					operation: "supply",
					label: t`Supply`,
					disabled: blocks.supply !== null || row.name === EARN_HIDDEN_UNLESS_HELD_TOKEN || !Big(spotAvailable).gt(0),
					reason: getBlockReason(blocks.supply === "portfolioMargin" ? "portfolioMargin" : null, translate),
				},
				{
					operation: "withdraw",
					label: t`Withdraw`,
					disabled:
						blocks.withdraw === "portfolioMargin" || blocks.withdraw === "unavailable" || !Big(row.supplied).gt(0),
					reason: getBlockReason(blocks.withdraw === "portfolioMargin" ? "portfolioMargin" : null, translate),
				},
			];
		}
		return [
			{
				operation: "borrow",
				label: t`Borrow`,
				disabled: blocks.borrow !== null,
				reason: getBlockReason(blocks.borrow, translate, "borrow"),
			},
			{
				operation: "repay",
				label: t`Repay`,
				disabled: blocks.repay === "unavailable" || blocks.repay === "portfolioMargin" || !Big(row.borrowed).gt(0),
				reason: getRepayReason(row),
			},
		];
	}

	const sortedRows = [...rows].sort((left, right) => left.displayName.localeCompare(right.displayName));

	if (isMobile) {
		return (
			<div className="space-y-2">
				<h2 className="text-sm font-semibold text-fg">{title}</h2>
				{sortedRows.map((row) => (
					<div key={row.token} className="rounded-16 border border-stroke-weak p-3">
						<span className="text-sm font-semibold text-fg">{row.displayName}</span>
						<dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
							{getCells(row, kind, accountReady, showInterest, translate).map((cell) => (
								<div key={cell.key} className="flex flex-col">
									<dt className="text-fg-muted">{cell.label}</dt>
									<dd className="text-fg tabular-nums">{cell.value}</dd>
								</div>
							))}
						</dl>
						<div className="mt-3 grid grid-cols-2 gap-2">
							{getActions(row).map((action) => (
								<ActionButton
									key={action.operation}
									label={action.label}
									primary={false}
									disabled={action.disabled}
									reason={action.reason}
									onClick={() => onOpenAction(action.operation, row.token)}
								/>
							))}
						</div>
					</div>
				))}
			</div>
		);
	}

	const headerCells = getCells(sortedRows[0] ?? null, kind, accountReady, showInterest, translate);
	return (
		<div className="space-y-2">
			<h2 className="text-sm font-semibold text-fg">{title}</h2>
			<div className="overflow-x-auto">
				<Table className="min-w-[56rem]">
					<TableHeader>
						<TableRow>
							<TableHead size="dense">{t`Asset`}</TableHead>
							{headerCells.map((cell) => (
								<TableHead key={cell.key} size="dense">
									{cell.label}
								</TableHead>
							))}
							<TableHead size="dense">{t`Action`}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sortedRows.map((row) => (
							<TableRow key={row.token}>
								<TableCell size="dense" className="font-semibold text-fg">
									{row.displayName}
								</TableCell>
								{getCells(row, kind, accountReady, showInterest, translate).map((cell) => (
									<TableCell key={cell.key} size="dense" className="text-fg tabular-nums">
										{cell.value}
									</TableCell>
								))}
								<TableCell size="dense">
									<div className="flex items-center gap-3">
										{getActions(row).map((action) => (
											<RowActionLink
												key={action.operation}
												action={action}
												onClick={() => onOpenAction(action.operation, row.token)}
											/>
										))}
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}

interface RowActionLinkProps {
	action: RowAction;
	onClick: () => void;
}

function RowActionLink({ action, onClick }: RowActionLinkProps) {
	const descriptionId = useId();
	const describe = action.disabled && action.reason !== null;
	const link = (
		<button
			type="button"
			aria-disabled={action.disabled || undefined}
			aria-describedby={describe ? descriptionId : undefined}
			onClick={() => {
				if (!action.disabled) onClick();
			}}
			className="text-xs font-medium text-brand hover:underline aria-disabled:cursor-default aria-disabled:text-fg-disabled aria-disabled:no-underline"
		>
			{action.label}
			{describe ? (
				<span id={descriptionId} className="sr-only">
					{action.reason}
				</span>
			) : null}
		</button>
	);
	if (!describe) return link;
	return <Tooltip content={action.reason}>{link}</Tooltip>;
}

interface Cell {
	key: string;
	label: string;
	value: ReactNode;
}

function getCells(
	row: EarnAssetRow | null,
	kind: "supply" | "borrow",
	accountReady: boolean,
	showInterest: boolean,
	translate: Translate,
): Cell[] {
	const amount = (value: string | undefined) =>
		row ? formatAssetAmount(accountReady && value !== undefined ? value : "0", row) : PLACEHOLDER;
	const cells: Cell[] = [];
	cells.push({
		key: "ltv",
		label: translate(msg`LTV`),
		value: kind === "supply" && row?.isCollateral ? formatRate(row.ltv) : translate(msg`N/A`),
	});
	cells.push({
		key: "apy",
		label: translate(msg`APY`),
		value: row ? (
			<span className="text-success">
				{formatRate(kind === "supply" ? row.supplyYearlyRate : row.borrowYearlyRate)}
			</span>
		) : (
			PLACEHOLDER
		),
	});
	cells.push({
		key: "oraclePrice",
		label: translate(msg`Oracle Price`),
		value: row ? <bdi dir="ltr">{formatUSD(row.oraclePx, { compact: false })}</bdi> : PLACEHOLDER,
	});
	if (kind === "supply") {
		cells.push({
			key: "liquidationPrice",
			label: translate(msg`Liquidation Price`),
			value:
				row?.liquidationPx && accountReady ? (
					<bdi dir="ltr">{formatUSD(row.liquidationPx, { compact: false })}</bdi>
				) : (
					translate(msg`N/A`)
				),
		});
		cells.push({ key: "supplied", label: translate(msg`Your Supplied`), value: amount(row?.supplied) });
		if (showInterest) {
			cells.push({
				key: "interest",
				label: translate(msg`Your Interest Earned`),
				value: row?.isCollateral ? translate(msg`N/A`) : amount(row?.suppliedInterest),
			});
		}
		cells.push({
			key: "total",
			label: translate(msg`Total Supplied`),
			value: row ? formatAssetAmount(row.totalSupplied, row) : PLACEHOLDER,
		});
		return cells;
	}
	cells.push({ key: "borrowed", label: translate(msg`Your Borrowed`), value: amount(row?.borrowed) });
	if (showInterest) {
		cells.push({ key: "interest", label: translate(msg`Your Interest Owed`), value: amount(row?.borrowedInterest) });
	}
	cells.push({
		key: "total",
		label: translate(msg`Total Borrowed`),
		value: row ? formatAssetAmount(row.totalBorrowed, row) : PLACEHOLDER,
	});
	return cells;
}

function formatAssetAmount(value: string, row: EarnAssetRow) {
	return (
		<bdi dir="ltr">
			{formatNumber(value, row.amountDecimals)} {row.displayName}
		</bdi>
	);
}

function formatStatUsd(value: string, isMobile: boolean) {
	return isMobile
		? formatUSD(value, { compact: true, minimumFractionDigits: 0, maximumFractionDigits: 1 })
		: formatUSD(value, { compact: false });
}

function formatRate(value: string) {
	return <bdi dir="ltr">{formatPercent(value, { signDisplay: "auto" })}</bdi>;
}

function getBlockReason(
	block: EarnActionBlock,
	translate: Translate,
	operation: EarnOperation = "supply",
): string | null {
	if (block === "portfolioMargin") {
		if (operation === "borrow") return translate(msg`Borrowing is automated in Portfolio Margin mode.`);
		if (operation === "repay") return translate(msg`Repaying from Earn is not available in Portfolio Margin mode.`);
		return translate(
			msg`When portfolio margin is enabled, users automatically earn interest on assets not used for trading. Manual supplying and withdrawing is disabled.`,
		);
	}
	if (block === "noSupplies") return translate(msg`You have no supplied assets to withdraw.`);
	if (block === "noCollateral") return translate(msg`Supply a supported collateral asset to borrow.`);
	if (block === "noBorrows") return translate(msg`You have no borrows to repay.`);
	return null;
}

interface InterestTableProps {
	data: EarnData;
}

function InterestTable({ data }: InterestTableProps) {
	const { t } = useLingui();
	useNumberFormatRevision();
	const ready = data.interestStatus === "ready";
	return (
		<div className="overflow-x-auto" aria-busy={data.interestStatus === "loading" || undefined}>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead size="dense">{t`Time`}</TableHead>
						<TableHead size="dense">{t`Asset`}</TableHead>
						<TableHead size="dense">{t`Supply Interest`}</TableHead>
						<TableHead size="dense">{t`Borrow Interest`}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{ready
						? data.interest.map((entry) => (
								<TableRow key={`${entry.time}:${entry.token}`}>
									<TableCell size="dense" className="text-fg-muted tabular-nums">
										<bdi dir="ltr">{formatDateTime(entry.time)}</bdi>
									</TableCell>
									<TableCell size="dense" className="font-semibold text-fg">
										{entry.token}
									</TableCell>
									<TableCell size="dense" className="text-fg tabular-nums">
										<bdi dir="ltr">{formatNumber(entry.supply)}</bdi>
									</TableCell>
									<TableCell size="dense" className="text-fg tabular-nums">
										<bdi dir="ltr">{formatNumber(entry.borrow)}</bdi>
									</TableCell>
								</TableRow>
							))
						: null}
				</TableBody>
			</Table>
			{ready && data.interest.length === 0 ? (
				<p className="py-6 text-center text-xs text-fg-muted">{t`No interest yet`}</p>
			) : null}
		</div>
	);
}

interface HistoryTableProps {
	rows: readonly AccountLedgerRow[];
	ready: boolean;
}

function HistoryTable({ rows, ready }: HistoryTableProps) {
	const { t } = useLingui();
	useNumberFormatRevision();
	const translate = (descriptor: MessageDescriptor) => t(descriptor);
	return (
		<div className="overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead size="dense">{t`Time`}</TableHead>
						<TableHead size="dense">{t`Action`}</TableHead>
						<TableHead size="dense">{t`Amount`}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{ready
						? rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell size="dense" className="text-fg-muted tabular-nums">
										<bdi dir="ltr">{formatDateTime(row.time)}</bdi>
									</TableCell>
									<TableCell size="dense" className="text-fg">
										{getHistoryActionLabel(row.action, translate)}
									</TableCell>
									<TableCell size="dense" className="text-fg tabular-nums">
										<bdi dir="ltr">
											{row.amount === null ? PLACEHOLDER : formatNumber(row.amount)} {row.token}
										</bdi>
									</TableCell>
								</TableRow>
							))
						: null}
				</TableBody>
			</Table>
			{ready && rows.length === 0 ? (
				<p className="py-6 text-center text-xs text-fg-muted">{t`No earn actions yet`}</p>
			) : null}
		</div>
	);
}

function getHistoryActionLabel(action: AccountLedgerRow["action"], translate: Translate) {
	if (action === "supply") return translate(msg`Supply`);
	if (action === "withdrawal") return translate(msg`Withdraw`);
	if (action === "borrow") return translate(msg`Borrow`);
	if (action === "repay") return translate(msg`Repay`);
	return action;
}
