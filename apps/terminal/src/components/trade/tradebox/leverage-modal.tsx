import { Button, Modal, ModalContent, ModalFooter, ModalHeader, ModalPopup, ModalTitle } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MARGIN_MODE_SUCCESS_DURATION_MS } from "@/config/time";
import { useAutoCloseSuccess } from "@/hooks/ui/use-auto-close-success";
import { TradingActionButton } from "../components/trading-action-button";
import { LeverageEditor } from "./leverage-editor";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentLeverage: number;
	pendingLeverage: number | null;
	committedLeverage?: number | null;
	maxLeverage: number;
	onPendingLeverageChange: (value: number) => void;
	isUpdating: boolean;
	updateError: Error | null;
	onApply: (leverage: number) => Promise<void>;
	marketIdentity?: string;
}

function LeverageModalComponent({ open, onOpenChange, marketIdentity, ...contentProps }: Props) {
	const [submissionLocked, setSubmissionLocked] = useState(false);
	const actionPending = contentProps.isUpdating || submissionLocked;

	function handleOpenChange(nextOpen: boolean, eventDetails?: { cancel: () => void }) {
		if (!nextOpen && actionPending) {
			eventDetails?.cancel();
			return;
		}
		onOpenChange(nextOpen);
	}

	return (
		<Modal open={open} onOpenChange={handleOpenChange} disablePointerDismissal={actionPending}>
			<ModalPopup
				size="sm"
				showClose={!actionPending}
				overlayClassName="bg-trading-panel-scrim"
				className="font-market-close"
			>
				<LeverageModalContent
					key={marketIdentity ?? "market"}
					{...contentProps}
					open={open}
					onOpenChange={handleOpenChange}
					isUpdating={actionPending}
					onSubmissionLockChange={setSubmissionLocked}
				/>
			</ModalPopup>
		</Modal>
	);
}

export const LeverageModal = memo(LeverageModalComponent);

type LeverageModalContentProps = Omit<Props, "marketIdentity"> & {
	onSubmissionLockChange: (locked: boolean) => void;
};

function LeverageModalContent({
	open,
	onOpenChange,
	currentLeverage,
	pendingLeverage,
	committedLeverage: appliedLeverage = null,
	maxLeverage,
	onPendingLeverageChange,
	isUpdating,
	updateError,
	onApply,
	onSubmissionLockChange,
}: LeverageModalContentProps) {
	const {
		showSuccess,
		trigger: triggerAutoClose,
		reset: resetAutoClose,
	} = useAutoCloseSuccess(() => onOpenChange(false), MARGIN_MODE_SUCCESS_DURATION_MS);
	const [dragLeverage, setDragLeverage] = useState<number | null>(null);
	const [submittedLeverage, setSubmittedLeverage] = useState<number | null>(null);
	const [leverageInputValid, setLeverageInputValid] = useState(true);
	const applyInFlightRef = useRef(false);
	const mountedRef = useRef(false);

	useLayoutEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		if (open) return;
		resetAutoClose();
		setDragLeverage(null);
		setSubmittedLeverage(null);
		setLeverageInputValid(true);
	}, [open, resetAutoClose]);

	const effectiveLeverage = appliedLeverage ?? currentLeverage;
	const canonicalLeverage = pendingLeverage ?? effectiveLeverage;
	const successfulLeverage = appliedLeverage ?? submittedLeverage ?? canonicalLeverage;
	const displayLeverage = showSuccess ? successfulLeverage : (dragLeverage ?? canonicalLeverage);
	const isDirty = pendingLeverage !== null && pendingLeverage !== effectiveLeverage;

	function handleLeverageChange(value: number) {
		if (showSuccess) return;
		setDragLeverage(null);
		onPendingLeverageChange(value);
	}

	async function handleConfirm(): Promise<void> {
		if (
			showSuccess ||
			!isDirty ||
			dragLeverage !== null ||
			!leverageInputValid ||
			isUpdating ||
			applyInFlightRef.current
		)
			return;
		applyInFlightRef.current = true;
		onSubmissionLockChange(true);
		const leverageToSubmit = canonicalLeverage;
		setSubmittedLeverage(leverageToSubmit);
		try {
			await onApply(leverageToSubmit);
			applyInFlightRef.current = false;
			onSubmissionLockChange(false);
			if (mountedRef.current) triggerAutoClose();
		} catch {
			applyInFlightRef.current = false;
			onSubmissionLockChange(false);
			if (mountedRef.current) setSubmittedLeverage(null);
		}
	}

	return (
		<>
			<ModalHeader>
				<ModalTitle>
					<Trans>Adjust leverage</Trans>
				</ModalTitle>
			</ModalHeader>
			<ModalContent className="space-y-4">
				<LeverageEditor
					key={maxLeverage}
					value={displayLeverage}
					riskValue={showSuccess ? successfulLeverage : (dragLeverage ?? canonicalLeverage)}
					max={maxLeverage}
					disabled={isUpdating || !open || showSuccess}
					onChange={handleLeverageChange}
					onDraftChange={setDragLeverage}
					onInputValidityChange={setLeverageInputValid}
					variant="modal"
				/>
				{updateError && (
					<div
						role="alert"
						className="flex items-center gap-2 rounded-xs border border-stroke-error-strong/20 bg-error-soft p-2.5 text-xs text-error"
					>
						<WarningIcon className="size-3.5 shrink-0" />
						<span className="min-w-0 flex-1">{updateError.message || t`Update failed`}</span>
					</div>
				)}
			</ModalContent>
			<ModalFooter>
				{!showSuccess && (
					<Button
						variant="outline"
						intent="neutral"
						size="sm"
						onClick={() => onOpenChange(false)}
						disabled={isUpdating}
						className="min-h-10 flex-1 rounded-[10px] border-trading-panel-stroke-input font-semibold text-trading-panel-fg shadow-none"
					>
						<Trans>Cancel</Trans>
					</Button>
				)}
				<TradingActionButton
					onClick={handleConfirm}
					disabled={!isDirty || dragLeverage !== null || !leverageInputValid || isUpdating || showSuccess}
					containerClassName="flex-1"
					className="gap-1.5 min-h-10 w-full flex-1 rounded-[10px] bg-trading-panel-control font-bold text-trading-panel-on-control hover:opacity-90"
				>
					{isUpdating && <SpinnerGapIcon className="size-3.5 animate-spin" />}
					{showSuccess ? <Trans>Updated to {displayLeverage}x</Trans> : <Trans>Confirm</Trans>}
				</TradingActionButton>
			</ModalFooter>
		</>
	);
}
