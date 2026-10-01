import { Plural, useLingui } from "@lingui/react/macro";
import { ModalDescription, ModalTitle } from "@sairn/ui";
import { useRef, useState } from "react";
import type { PositionCloseAllSnapshot } from "@/domain/trade/position-close-all";
import { useHip3DisclaimerRequirement } from "@/hooks/trade/use-hip3-disclaimer";
import { useHip3DisclaimerPresentation } from "@/hooks/trade/use-hip3-disclaimer-presentation";
import { usePositionCloseAllSnapshotResolver } from "@/hooks/trade/use-position-close-all-action";
import { usePositionCloseAllSubmit } from "@/hooks/trade/use-position-close-all-submit";
import { useLingeringValue } from "@/hooks/use-lingering-value";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatQuoteAmount } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import { type PositionCloseAllSession, usePositionDialogActions } from "@/stores/use-position-dialog-store";
import { Hip3DeployerDisclaimer } from "../components/hip3-deployer-disclaimer";
import { TradingActionButton } from "../components/trading-action-button";
import { PositionCloseAllTargets } from "./position-close-all-targets";
import { PositionCloseDialogContent } from "./position-close-dialog-content";
import { PositionCloseDialogFooter } from "./position-close-dialog-footer";
import { PositionCloseDialogHeader } from "./position-close-dialog-header";
import { PositionCloseDialogShell } from "./position-close-dialog-shell";
import { PositionCloseSummary, type PositionCloseSummaryItem } from "./position-close-summary";

interface Props {
	session: PositionCloseAllSession | null;
	onSessionEnd: (sessionId: string) => void;
}

const DIALOG_EXIT_MS = 250;

export function PositionCloseAllController({ session, onSessionEnd }: Props) {
	const displayedSession = useLingeringValue(session, DIALOG_EXIT_MS);
	if (!displayedSession) return null;
	return (
		<PositionCloseAllDisclaimerGate
			key={displayedSession.sessionId}
			sessionId={displayedSession.sessionId}
			snapshot={displayedSession.snapshot}
			open={session?.sessionId === displayedSession.sessionId}
			onOpenChange={(open) => {
				if (!open) onSessionEnd(displayedSession.sessionId);
			}}
		/>
	);
}

interface ContentProps {
	snapshot: PositionCloseAllSnapshot;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

interface GateProps extends ContentProps {
	sessionId: string;
}

function PositionCloseAllDisclaimerGate({ sessionId, snapshot, open, onOpenChange }: GateProps) {
	const snapshotResolver = usePositionCloseAllSnapshotResolver();
	const { refreshCloseAll } = usePositionDialogActions();
	const hip3Requirement = useHip3DisclaimerRequirement(snapshot.targets.map((target) => target.coin));
	const hip3Disclaimer = useHip3DisclaimerPresentation(hip3Requirement, "cancel", DIALOG_EXIT_MS);

	function handleAccept() {
		if (!snapshotResolver.identityReady || !snapshotResolver.dataReady) return;
		const current = snapshotResolver.resolveSnapshot();
		if (current.snapshot) refreshCloseAll(sessionId, current.snapshot);
	}

	if (hip3Disclaimer) {
		return (
			<Hip3DeployerDisclaimer
				key={hip3Disclaimer.dex}
				open={open && hip3Disclaimer.open}
				documentationUrl={hip3Disclaimer.documentationUrl}
				exit={hip3Disclaimer.exit}
				onExit={() => onOpenChange(false)}
				onAccept={handleAccept}
			/>
		);
	}

	return <PositionCloseAllContent snapshot={snapshot} open={open} onOpenChange={onOpenChange} />;
}

function PositionCloseAllContent({ snapshot, open, onOpenChange }: ContentProps) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const submission = usePositionCloseAllSubmit(snapshot);
	const submittedRef = useRef(false);
	const [isSubmitted, setIsSubmitted] = useState(false);
	const positionCount = snapshot.targets.length;
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
		if (!open || submittedRef.current) return;
		submittedRef.current = true;
		setIsSubmitted(true);
		try {
			await submission.submit();
		} catch {
			return;
		} finally {
			onOpenChange(false);
		}
	}

	function handleOpenChange(nextOpen: boolean) {
		if (submittedRef.current) return;
		onOpenChange(nextOpen);
	}

	return (
		<PositionCloseDialogShell
			open={open && !isSubmitted}
			onOpenChange={handleOpenChange}
			isMobile={isMobile}
			dismissible
			closeLabel={t`Close close-all confirmation`}
		>
			<PositionCloseDialogHeader>
				<ModalTitle className="text-[17px] leading-6 font-bold text-market-close-fg">{t`Close All Positions`}</ModalTitle>
				<ModalDescription className="text-2sm leading-[18px] text-market-close-muted">
					<Plural
						value={positionCount}
						one="This submits a market close for the open position. Each order is confirmed separately and fills cannot be reversed."
						other="This submits market closes for all # open positions. Each order is confirmed separately and fills cannot be reversed."
					/>
				</ModalDescription>
			</PositionCloseDialogHeader>

			<PositionCloseDialogContent>
				<p className="text-xs text-market-close-muted">
					{t`This closes all perpetual positions in this account, including positions hidden by filters.`}
				</p>
				<PositionCloseAllTargets targets={snapshot.targets} />
				<PositionCloseSummary
					testId="position-close-all-summary"
					ariaLabel={t`Close all positions summary`}
					items={summaryItems}
				/>
			</PositionCloseDialogContent>

			<PositionCloseDialogFooter>
				<TradingActionButton
					onClick={handleConfirm}
					requireReadyConfirmation
					disabled={!open || isSubmitted}
					intent="error"
					size="lg"
					containerClassName="w-full items-stretch"
					className="relative min-h-11 w-full overflow-hidden !rounded-[12px] !bg-market-close-danger px-3 py-[13px] text-sm leading-5 font-bold !text-market-close-danger-text tabular-nums !shadow-none !transition-none hover:!bg-market-close-danger hover:!opacity-100 active:!bg-market-close-danger active:!opacity-100 active:not-data-disabled:!scale-100 data-disabled:!cursor-not-allowed data-disabled:!bg-market-close-danger-disabled data-disabled:!text-market-close-muted"
				>
					{t`Close All Positions`}
				</TradingActionButton>
			</PositionCloseDialogFooter>
		</PositionCloseDialogShell>
	);
}
