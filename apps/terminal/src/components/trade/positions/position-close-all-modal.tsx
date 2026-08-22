import { ModalDescription, ModalTitle } from "@gatu/ui";
import { Plural, useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { getPositionCloseAllSnapshotKey, type PositionCloseAllSnapshot } from "@/domain/trade/position-close-all";
import { usePositionCloseAllSubmit } from "@/hooks/trade/use-position-close-all-submit";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { formatQuoteAmount } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import { TradingActionButton } from "../components/trading-action-button";
import {
	PositionCloseDialogContent,
	PositionCloseDialogFooter,
	PositionCloseDialogHeader,
	PositionCloseDialogShell,
	PositionCloseSummary,
	type PositionCloseSummaryItem,
} from "./position-close-dialog-ui";

interface Props {
	snapshot: PositionCloseAllSnapshot | null;
	onOpenChange: (open: boolean) => void;
}

export function PositionCloseAllController({ snapshot, onOpenChange }: Props) {
	if (!snapshot) return null;
	return (
		<PositionCloseAllContent
			key={getPositionCloseAllSnapshotKey(snapshot)}
			snapshot={snapshot}
			onOpenChange={onOpenChange}
		/>
	);
}

interface ContentProps {
	snapshot: PositionCloseAllSnapshot;
	onOpenChange: (open: boolean) => void;
}

function PositionCloseAllContent({ snapshot, onOpenChange }: ContentProps) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const submission = usePositionCloseAllSubmit(snapshot);
	const positionCount = snapshot.targets.length;
	const isActionDisabled = submission.isPending || submission.isReconciling || submission.isPartial;
	const isDismissible = !submission.isPending;
	const errorId = `position-close-all-error-${getPositionCloseAllSnapshotKey(snapshot)}`;
	const helperId = `position-close-all-helper-${getPositionCloseAllSnapshotKey(snapshot)}`;
	const describedBy = submission.error ? `${helperId} ${errorId}` : helperId;
	const summaryItems: PositionCloseSummaryItem[] = [
		{
			key: "count",
			label: t`Positions`,
			value: <Plural value={positionCount} one="# position" other="# positions" />,
			valueClassName: "font-semibold text-market-close-fg",
		},
		{
			key: "notional",
			label: t`Total notional`,
			value: (
				<span className="flex flex-col items-end gap-0.5">
					{snapshot.summaryTotals.map((total) => (
						<span key={total.quoteSymbol}>
							{formatQuoteAmount(total.totalNotional, total.quoteSymbol, { decimals: 2, compact: false })}
						</span>
					))}
				</span>
			),
			valueClassName: "overflow-visible font-semibold whitespace-normal text-clip text-market-close-fg",
		},
		{
			key: "pnl",
			label: t`Estimated PnL`,
			value: (
				<span className="flex flex-col items-end gap-0.5">
					{snapshot.summaryTotals.map((total) => (
						<span key={total.quoteSymbol} className={getMarketCloseValueColorClass(total.estimatedPnl)}>
							{formatQuoteAmount(total.estimatedPnl, total.quoteSymbol, {
								decimals: 2,
								compact: false,
								signDisplay: "exceptZero",
							})}
						</span>
					))}
				</span>
			),
			valueClassName: "overflow-visible font-bold whitespace-normal text-clip",
			emphasized: true,
		},
	];

	async function handleConfirm() {
		try {
			const outcome = await submission.submit();
			if (outcome.state === "blocked") {
				toast.warning(t`Another order for one of these markets is still being confirmed.`);
				return;
			}
			if (outcome.state === "reconciling") {
				toast.info(t`Close orders submitted. Confirming exchange status; do not retry.`);
				onOpenChange(false);
				return;
			}
			if (outcome.state === "partial") {
				toast.warning(
					t`${outcome.acceptedCount} of ${outcome.totalCount} close orders were accepted. Review positions before retrying.`,
				);
				return;
			}

			toast.success(t`All close orders filled`, {
				description: t`${positionCount} positions were closed at market.`,
			});
			onOpenChange(false);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t`Failed to submit close orders`);
		}
	}

	function handleOpenChange(open: boolean) {
		if (!open && submission.isPending) return;
		if (!open) submission.resetError();
		onOpenChange(open);
	}

	const progressLabel =
		submission.phase === "validating"
			? t`Validating positions...`
			: submission.phase === "submitting"
				? t`Submitting close orders...`
				: submission.phase === "reconciling"
					? t`Confirming exchange status...`
					: submission.phase === "partial"
						? t`Partial result — reopen to retry`
						: null;

	return (
		<PositionCloseDialogShell
			open
			onOpenChange={handleOpenChange}
			isMobile={isMobile}
			dismissible={isDismissible}
			closeLabel={t`Close close-all confirmation`}
		>
			<PositionCloseDialogHeader>
				<ModalTitle className="text-[17px] leading-6 font-bold text-market-close-fg">{t`Close All Positions`}</ModalTitle>
				<ModalDescription className="text-[13px] leading-[18px] text-market-close-muted">
					<Plural
						value={positionCount}
						one="This submits a market close for the open position. Each order is confirmed separately and fills cannot be reversed."
						other="This submits market closes for all # open positions. Each order is confirmed separately and fills cannot be reversed."
					/>
				</ModalDescription>
			</PositionCloseDialogHeader>

			<PositionCloseDialogContent>
				<PositionCloseSummary
					testId="position-close-all-summary"
					ariaLabel={t`Close all positions summary`}
					items={summaryItems}
				/>

				{submission.error ? (
					<p
						id={errorId}
						role={submission.isReconciling ? "status" : "alert"}
						aria-live={submission.isReconciling ? "polite" : "assertive"}
						className={cn(
							"flex items-start gap-2 rounded-[8px] p-2.5 text-xs leading-[17px]",
							submission.isReconciling ? "bg-warning-soft text-warning" : "bg-error-soft text-market-close-danger",
						)}
					>
						<WarningIcon className="mt-0.5 size-3.5 shrink-0" weight="fill" aria-hidden="true" />
						<span>{submission.error}</span>
					</p>
				) : null}
			</PositionCloseDialogContent>

			<PositionCloseDialogFooter>
				<TradingActionButton
					onClick={handleConfirm}
					requireReadyConfirmation
					disabled={isActionDisabled}
					intent="error"
					size="lg"
					aria-describedby={describedBy}
					aria-busy={submission.isPending || submission.isReconciling}
					containerClassName="w-full items-stretch"
					className="relative min-h-11 w-full overflow-hidden !rounded-[12px] !bg-market-close-danger px-3 py-[13px] text-[14px] leading-5 font-bold !text-market-close-danger-text tabular-nums !shadow-none !transition-[background-color] duration-150 hover:!bg-market-close-danger hover:!opacity-100 active:!bg-market-close-danger active:!opacity-100 active:not-data-disabled:!scale-100 data-disabled:!cursor-not-allowed data-disabled:!bg-market-close-danger-disabled data-disabled:!text-market-close-muted"
				>
					{progressLabel ? (
						<>
							{!submission.isPartial ? (
								<SpinnerGapIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
							) : null}
							{progressLabel}
						</>
					) : (
						<Plural value={positionCount} one="Close # position" other="Close # positions" />
					)}
				</TradingActionButton>
				<button
					type="button"
					disabled={!isDismissible}
					onClick={() => handleOpenChange(false)}
					className="min-h-10 rounded-[10px] text-[13px] font-semibold text-market-close-muted transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:text-market-close-subtle"
				>
					{t`Back`}
				</button>
				<p id={helperId} className="text-center text-xs leading-[17px] text-market-close-subtle">
					{t`Click to submit · Each market may return a different result`}
				</p>
			</PositionCloseDialogFooter>
		</PositionCloseDialogShell>
	);
}
