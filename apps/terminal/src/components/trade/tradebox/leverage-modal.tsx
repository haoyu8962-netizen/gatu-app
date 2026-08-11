import { Button, Modal, ModalContent, ModalFooter, ModalHeader, ModalPopup, ModalTitle } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { MARGIN_MODE_SUCCESS_DURATION_MS } from "@/config/time";
import { useAutoCloseSuccess } from "@/hooks/ui/use-auto-close-success";
import { TradingActionButton } from "../components/trading-action-button";
import { LeverageEditor } from "./leverage-editor";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentLeverage: number;
	pendingLeverage: number | null;
	maxLeverage: number;
	onPendingLeverageChange: (value: number) => void;
	isUpdating: boolean;
	updateError: Error | null;
	onApply: (leverage: number) => Promise<void>;
}

export function LeverageModal({ open, onOpenChange, ...contentProps }: Props) {
	return (
		<Modal open={open} onOpenChange={onOpenChange}>
			<ModalPopup size="sm">
				<LeverageModalContent key={open ? "open" : "closed"} {...contentProps} onOpenChange={onOpenChange} />
			</ModalPopup>
		</Modal>
	);
}

type LeverageModalContentProps = Omit<Props, "open">;

function LeverageModalContent({
	onOpenChange,
	currentLeverage,
	pendingLeverage,
	maxLeverage,
	onPendingLeverageChange,
	isUpdating,
	updateError,
	onApply,
}: LeverageModalContentProps) {
	const { showSuccess, trigger: triggerAutoClose } = useAutoCloseSuccess(
		() => onOpenChange(false),
		MARGIN_MODE_SUCCESS_DURATION_MS,
	);
	const [dragLeverage, setDragLeverage] = useState<number | null>(null);
	const applyInFlightRef = useRef(false);

	const displayLeverage = dragLeverage ?? pendingLeverage ?? currentLeverage;
	const isDirty = pendingLeverage !== null && pendingLeverage !== currentLeverage;

	function handleLeverageChange(value: number) {
		setDragLeverage(null);
		onPendingLeverageChange(value);
	}

	async function handleConfirm(): Promise<void> {
		if (!isDirty || isUpdating || applyInFlightRef.current) return;
		applyInFlightRef.current = true;
		try {
			await onApply(displayLeverage);
			triggerAutoClose();
		} catch {
			applyInFlightRef.current = false;
		}
	}

	return (
		<>
			<ModalHeader>
				<ModalTitle>
					<span className="flex w-full min-w-0 items-baseline justify-between gap-2 pr-6">
						<span className="min-w-0 truncate">
							<Trans>Adjust leverage</Trans>
						</span>
						<span className="shrink-0 text-sm font-bold tabular-nums text-trading-panel-fg">{displayLeverage}x</span>
					</span>
				</ModalTitle>
			</ModalHeader>
			<ModalContent className="space-y-4">
				<LeverageEditor
					value={displayLeverage}
					max={maxLeverage}
					disabled={isUpdating}
					onChange={handleLeverageChange}
					onDraftChange={setDragLeverage}
					variant="modal"
				/>
				{updateError && (
					<div className="flex items-center gap-2 rounded-xs border border-stroke-error-strong/20 bg-error-soft p-2.5 text-xs text-error">
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
					disabled={!isDirty || isUpdating}
					containerClassName="flex-1"
					className="gap-1.5 min-h-10 w-full flex-1 rounded-[10px] bg-trading-panel-control font-bold text-trading-panel-on-control hover:opacity-90"
				>
					{isUpdating && <SpinnerGapIcon className="size-3.5 animate-spin" />}
					{showSuccess ? <Trans>Updated</Trans> : <Trans>Confirm</Trans>}
				</TradingActionButton>
			</ModalFooter>
		</>
	);
}
