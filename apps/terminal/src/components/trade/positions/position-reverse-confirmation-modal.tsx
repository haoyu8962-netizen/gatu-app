import { AdaptiveModal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useId } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { TradingActionButton } from "../components/trading-action-button";

export type PositionReverseDirection = "long" | "short";

export interface PositionReverseConfirmationModalProps {
	open: boolean;
	marketLabel: string;
	currentDirection: PositionReverseDirection;
	reverseSizeLabel: string;
	isSubmitting: boolean;
	isConfirmDisabled?: boolean;
	errorMessage?: string | null;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function PositionReverseConfirmationModal({
	open,
	marketLabel,
	currentDirection,
	reverseSizeLabel,
	isSubmitting,
	isConfirmDisabled = isSubmitting,
	errorMessage,
	onOpenChange,
	onConfirm,
}: PositionReverseConfirmationModalProps) {
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const unavailableDescriptionId = useId();
	const targetDirection: PositionReverseDirection = currentDirection === "long" ? "short" : "long";
	const currentDirectionLabel = currentDirection === "long" ? t`Long` : t`Short`;
	const targetDirectionLabel = targetDirection === "long" ? t`Long` : t`Short`;

	function handleOpenChange(nextOpen: boolean) {
		if (isSubmitting && !nextOpen) return;
		onOpenChange(nextOpen);
	}

	function handleConfirm() {
		if (isConfirmDisabled) return;
		onConfirm();
	}

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={handleOpenChange}
			presentation={isMobile ? "drawer" : "modal"}
			size="sm"
			dismissible={!isSubmitting}
			showClose={!isSubmitting}
			showHandle={isMobile}
			closeLabel={t`Close reverse confirmation`}
			handleClassName="top-2 h-1 w-9 !rounded-[2px] bg-market-close-stroke-input"
			overlayClassName="!bg-scrim/60 !backdrop-blur-none"
			className="font-market-close max-h-[calc(100dvh-1rem)] !rounded-t-[18px] max-[1000px]:!border-0 !bg-modal !shadow-none [&>button]:!top-5 [&>button]:!right-4 [&>button]:!rounded-[8px] [&>button]:text-market-close-muted [&>button:hover]:bg-market-close-hover [&>button:hover]:text-market-close-fg [&>button:active]:bg-market-close-hover min-[1001px]:max-w-[23.75rem] min-[1001px]:!rounded-[16px] min-[1001px]:!shadow-overlay min-[1001px]:[&>button]:!top-6 min-[1001px]:[&>button]:!right-6"
		>
			<ModalHeader divider={false} className="gap-1 px-4 pt-7 pb-0 text-start min-[1001px]:px-6 min-[1001px]:pt-6">
				<ModalTitle className="text-base leading-[22px] font-bold text-market-close-fg min-[1001px]:text-[17px] min-[1001px]:leading-6">
					{t`Reverse Position`}
				</ModalTitle>
				<ModalDescription className="text-2sm leading-5 text-market-close-muted">
					{t`This will close the current position and open an equal position in the opposite direction at market price.`}
				</ModalDescription>
			</ModalHeader>

			<ModalContent className="flex flex-col gap-3 px-4 pt-4 pb-0 min-[1001px]:gap-4 min-[1001px]:px-6">
				<dl className="flex flex-col gap-2.5 text-2sm leading-[18px]">
					<ReverseDetailRow label={t`Market`} value={marketLabel} emphasized />
					<ReverseDetailRow
						label={t`Direction`}
						value={
							<span className="font-semibold">
								<span className="sr-only">{t`${currentDirectionLabel} to ${targetDirectionLabel}`}</span>
								<span aria-hidden="true" className="inline-flex items-center gap-1.5">
									<span>{currentDirectionLabel}</span>
									<span className="text-market-close-subtle">→</span>
									<span
										className={targetDirection === "long" ? "text-market-close-success" : "text-market-close-danger"}
									>
										{targetDirectionLabel}
									</span>
								</span>
							</span>
						}
					/>
					<ReverseDetailRow label={t`Reverse quantity (2× position)`} value={reverseSizeLabel} numeric />
					<ReverseDetailRow label={t`Price`} value={t`Market`} />
					<ReverseDetailRow
						label={t`Estimated Liquidation Price`}
						value={
							<span className="inline-flex items-center gap-2">
								<span aria-hidden="true" className="tabular-nums">
									—
								</span>
								<span className="text-[11px] font-medium text-market-close-subtle">{t`Unavailable`}</span>
							</span>
						}
						describedBy={unavailableDescriptionId}
						separated
					/>
				</dl>

				<p
					id={unavailableDescriptionId}
					role="note"
					className="rounded-[8px] bg-market-close-card px-3 py-2.5 text-xs leading-[17px] text-market-close-muted"
				>
					{t`A reliable pre-trade liquidation price is not available for a reverse order. Review the resulting position after execution.`}
				</p>

				{errorMessage ? (
					<p role="alert" className="text-xs leading-[17px] text-market-close-danger">
						{errorMessage}
					</p>
				) : null}
			</ModalContent>

			<ModalFooter className="flex-col items-stretch gap-2 px-4 pt-4 pb-4 min-[1001px]:px-6 min-[1001px]:pb-6">
				<TradingActionButton
					onClick={handleConfirm}
					requireReadyConfirmation
					intent="error"
					size="lg"
					containerClassName="w-full items-stretch"
					className="min-h-11 w-full !rounded-[10px] !bg-market-close-danger px-3 text-[13px] font-bold !text-market-close-danger-text !shadow-none !transition-none min-[1001px]:min-h-10 min-[1001px]:hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus active:not-data-disabled:scale-100 data-disabled:cursor-not-allowed data-disabled:!bg-market-close-danger-disabled data-disabled:!text-market-close-muted"
					aria-busy={isSubmitting}
					disabled={isConfirmDisabled}
				>
					{isSubmitting ? t`Reversing...` : targetDirection === "long" ? t`Buy / Long` : t`Sell / Short`}
				</TradingActionButton>
				<p className="text-center text-2xs leading-4 text-market-close-subtle">
					{t`This action cannot be undone after execution.`}
				</p>
			</ModalFooter>
		</AdaptiveModal>
	);
}

interface ReverseDetailRowProps {
	label: string;
	value: ReactNode;
	describedBy?: string;
	emphasized?: boolean;
	numeric?: boolean;
	separated?: boolean;
}

function ReverseDetailRow({
	label,
	value,
	describedBy,
	emphasized = false,
	numeric = false,
	separated = false,
}: ReverseDetailRowProps) {
	return (
		<div
			className={cn(
				"flex items-center justify-between gap-4",
				separated && "border-t border-dashed border-market-close-stroke-card pt-2.5",
			)}
		>
			<dt className="text-market-close-muted">{label}</dt>
			<dd
				aria-describedby={describedBy}
				className={cn(
					"min-w-0 truncate text-right text-market-close-fg",
					emphasized && "font-bold",
					numeric && "font-semibold tabular-nums",
				)}
			>
				{value}
			</dd>
		</div>
	);
}
