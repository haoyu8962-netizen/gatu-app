import { AdaptiveModal, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { type FormEvent, type KeyboardEvent, useId, useRef } from "react";
import { cn } from "@/lib/cn";

interface Props {
	open: boolean;
	marketLabel: string;
	directionLabel: string;
	directionTone: "positive" | "negative";
	typeLabel: string;
	sizeValue: string;
	triggerPriceValue?: string;
	sizeInvalid: boolean;
	triggerPriceInvalid: boolean;
	isSubmitting: boolean;
	isAwaitingConfirmation: boolean;
	isInteractionLocked: boolean;
	isConfirmDisabled: boolean;
	errorMessage?: string | null;
	onSizeChange: (value: string) => void;
	onTriggerPriceChange: (value: string) => void;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function MobileOrderModificationModal({
	open,
	marketLabel,
	directionLabel,
	directionTone,
	typeLabel,
	sizeValue,
	triggerPriceValue,
	sizeInvalid,
	triggerPriceInvalid,
	isSubmitting,
	isAwaitingConfirmation,
	isInteractionLocked,
	isConfirmDisabled,
	errorMessage,
	onSizeChange,
	onTriggerPriceChange,
	onOpenChange,
	onConfirm,
}: Props) {
	const { t } = useLingui();
	const errorId = useId();
	const sizeInputRef = useRef<HTMLInputElement>(null);

	function handleOpenChange(nextOpen: boolean) {
		if (isSubmitting || isAwaitingConfirmation) return;
		onOpenChange(nextOpen);
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (isConfirmDisabled) return;
		onConfirm();
	}

	function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.nativeEvent.isComposing) return;
		if (event.key === "Enter") {
			event.preventDefault();
			if (!isConfirmDisabled) onConfirm();
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			handleOpenChange(false);
		}
	}

	const describedBy = errorMessage ? errorId : undefined;
	const busy = isSubmitting || isAwaitingConfirmation;

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={handleOpenChange}
			presentation="drawer"
			size="sm"
			dismissible={!busy}
			showClose={!busy}
			showHandle
			closeLabel={t`Close order modification`}
			handleClassName="top-2 h-1 w-9 !rounded-[2px] bg-market-close-stroke-input"
			overlayClassName="!transition-none data-starting-style:!opacity-100 data-ending-style:!opacity-100"
			className="font-market-close max-h-[calc(100dvh-1rem)] !rounded-t-[18px] !border-0 !bg-modal !shadow-none !transition-none data-starting-style:!translate-y-0 data-starting-style:!scale-100 data-starting-style:!opacity-100 data-ending-style:!translate-y-0 data-ending-style:!scale-100 data-ending-style:!opacity-100 [&>button]:!top-5 [&>button]:!right-4 [&>button]:size-11 [&>button]:rounded-[8px] [&>button]:text-market-close-muted [&>button:active]:bg-market-close-hover"
		>
			<form onSubmit={handleSubmit} noValidate>
				<ModalHeader divider={false} className="px-4 pt-7 pb-0 text-left">
					<ModalTitle className="text-base leading-[22px] font-bold text-market-close-fg">{t`Modify Order`}</ModalTitle>
				</ModalHeader>

				<ModalContent className="flex flex-col gap-3 px-4 pt-4 pb-0">
					<dl className="flex flex-col gap-[9px] text-[13px] leading-[18px]">
						<DetailRow label={t`Market`} value={marketLabel} emphasized />
						<DetailRow
							label={t`Direction`}
							value={directionLabel}
							valueClassName={directionTone === "positive" ? "text-market-close-success" : "text-market-close-danger"}
						/>
						<DetailRow label={t`Type`} value={typeLabel} />
					</dl>

					{triggerPriceValue !== undefined ? (
						<label
							className={cn(
								"flex min-h-11 items-center rounded-[10px] border bg-modal px-3 transition-colors duration-[120ms] focus-within:border-market-close-control",
								triggerPriceInvalid ? "border-market-close-danger" : "border-market-close-stroke-input",
							)}
						>
							<span className="mr-2 shrink-0 text-xs text-market-close-subtle">{t`Trigger Price`}</span>
							<input
								type="text"
								inputMode="decimal"
								enterKeyHint="next"
								autoComplete="off"
								value={triggerPriceValue}
								disabled={isInteractionLocked}
								aria-label={t`Trigger Price`}
								aria-invalid={triggerPriceInvalid || undefined}
								aria-describedby={describedBy}
								className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-right text-base font-semibold tabular-nums text-market-close-fg outline-none disabled:cursor-not-allowed disabled:text-market-close-subtle"
								onChange={(event) => onTriggerPriceChange(event.target.value)}
								onKeyDown={handleInputKeyDown}
							/>
							<span className="ml-2 shrink-0 text-xs text-market-close-muted">USDC</span>
						</label>
					) : null}

					<label
						className={cn(
							"flex min-h-11 items-center rounded-[10px] border bg-modal px-3 transition-colors duration-[120ms] focus-within:border-market-close-control",
							sizeInvalid ? "border-market-close-danger" : "border-market-close-stroke-input",
						)}
					>
						<span className="mr-2 shrink-0 text-xs text-market-close-subtle">{t`Size`}</span>
						<input
							ref={sizeInputRef}
							type="text"
							inputMode="decimal"
							enterKeyHint="done"
							autoComplete="off"
							value={sizeValue}
							disabled={isInteractionLocked}
							aria-label={t`Size`}
							aria-invalid={sizeInvalid || undefined}
							aria-describedby={describedBy}
							className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-right text-base font-semibold tabular-nums text-market-close-fg outline-none disabled:cursor-not-allowed disabled:text-market-close-subtle"
							onChange={(event) => onSizeChange(event.target.value)}
							onKeyDown={handleInputKeyDown}
						/>
						<span className="ml-2 max-w-[35%] shrink-0 truncate text-xs text-market-close-muted">{marketLabel}</span>
					</label>

					{errorMessage ? (
						<p id={errorId} role="alert" className="text-xs leading-[17px] text-market-close-danger">
							{errorMessage}
						</p>
					) : null}
				</ModalContent>

				<ModalFooter className="px-4 pt-3 pb-4">
					<button
						type="submit"
						className="min-h-11 w-full rounded-[12px] bg-market-close-control px-3 text-sm font-bold text-market-close-on-control transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:bg-market-close-stroke-control disabled:text-market-close-muted"
						aria-busy={busy || undefined}
						disabled={isConfirmDisabled}
					>
						{isSubmitting ? t`Modifying...` : isAwaitingConfirmation ? t`Waiting for confirmation...` : t`Modify Order`}
					</button>
				</ModalFooter>
			</form>
		</AdaptiveModal>
	);
}

interface DetailRowProps {
	label: string;
	value: string;
	emphasized?: boolean;
	valueClassName?: string;
}

function DetailRow({ label, value, emphasized = false, valueClassName }: DetailRowProps) {
	return (
		<div className="flex items-center justify-between gap-4">
			<dt className="shrink-0 text-market-close-muted">{label}</dt>
			<dd
				className={cn(
					"min-w-0 truncate text-right font-semibold text-market-close-fg",
					emphasized && "font-bold",
					valueClassName,
				)}
			>
				{value}
			</dd>
		</div>
	);
}
