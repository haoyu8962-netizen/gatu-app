import { Button, Modal, ModalContent, ModalFooter, ModalHeader, ModalPopup, ModalTitle } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { CaretDownIcon, CheckIcon, ShieldIcon, SpinnerGapIcon, StackIcon, WarningIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { MARGIN_MODE_SUCCESS_DURATION_MS } from "@/config/time";
import { cn } from "@/lib/cn";
import type { MarginMode } from "@/lib/trade/margin-mode";
import { TradingActionButton } from "../components/trading-action-button";
import { LeverageSlider } from "./leverage-slider";

const MODE_ICONS = { cross: StackIcon, isolated: ShieldIcon } as const;

interface MarginModeToggleProps {
	mode: MarginMode;
	disabled?: boolean;
	onClick?: () => void;
}

export function MarginModeToggle({ mode, disabled, onClick }: MarginModeToggleProps) {
	const label = mode === "cross" ? t`Cross` : t`Isolated`;
	const Icon = MODE_ICONS[mode];

	return (
		<Button
			variant="outline"
			intent="neutral"
			size="sm"
			onClick={onClick}
			disabled={disabled}
			iconLeft={<Icon className="size-3" />}
			iconRight={<CaretDownIcon className="size-3" />}
			className="min-w-0"
		>
			<span className="truncate">{label}</span>
		</Button>
	);
}

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentMode: MarginMode;
	currentLeverage: number;
	pendingLeverage: number | null;
	maxLeverage: number;
	onPendingLeverageChange: (value: number) => void;
	resetPendingLeverage: () => void;
	hasPosition: boolean;
	isOnlyIsolated: boolean;
	isUpdating: boolean;
	updateError: Error | null;
	showLeverage: boolean;
	onApply: (mode: MarginMode, leverage: number) => Promise<void>;
}

const MODE_OPTIONS: Array<{
	id: MarginMode;
	label: () => string;
	description: () => string;
	icon: typeof StackIcon;
}> = [
	{
		id: "cross",
		label: () => t`Cross`,
		description: () =>
			t`All cross positions share the same cross margin as collateral. In the event of liquidation, your cross margin balance and any remaining open positions may be forfeited.`,
		icon: StackIcon,
	},
	{
		id: "isolated",
		label: () => t`Isolated`,
		description: () =>
			t`Each position uses only its allocated margin. If the margin ratio reaches 100%, the position is liquidated. Margin can be added or removed individually.`,
		icon: ShieldIcon,
	},
];

interface ModeOptionProps {
	option: (typeof MODE_OPTIONS)[number];
	isSelected: boolean;
	isCurrent: boolean;
	isDisabled: boolean;
	isUpdating: boolean;
	onSelect: () => void;
}

function ModeOption({ option, isSelected, isCurrent, isDisabled, isUpdating, onSelect }: ModeOptionProps) {
	const Icon = option.icon;

	return (
		<button
			type="button"
			onClick={onSelect}
			disabled={isUpdating || isDisabled}
			className={cn(
				"flex w-full items-center gap-2 rounded-xs px-3 py-2.5 text-left transition-colors",
				isSelected ? "bg-bg-raised text-text-strong" : "text-text-weak hover:text-text-strong",
				isDisabled && "opacity-40 cursor-not-allowed",
			)}
		>
			<Icon className={cn("size-3.5 shrink-0", isSelected ? "text-text-brand" : "text-text-weak")} />
			<span className="text-xs font-semibold">{option.label()}</span>
			{isCurrent && (
				<span className="ml-auto text-2xs font-medium uppercase text-text-weak">
					<Trans>Current</Trans>
				</span>
			)}
			{isSelected && !isCurrent && <CheckIcon className="ml-auto size-3 text-text-brand" />}
		</button>
	);
}

export function MarginModeDialog({
	open,
	onOpenChange,
	currentMode,
	currentLeverage,
	pendingLeverage,
	maxLeverage,
	onPendingLeverageChange,
	resetPendingLeverage,
	hasPosition,
	isOnlyIsolated,
	isUpdating,
	updateError,
	showLeverage,
	onApply,
}: Props) {
	const [selectedMode, setSelectedMode] = useState<MarginMode>(currentMode);
	const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);
	const [showSuccess, setShowSuccess] = useState(false);

	const displayLeverage = pendingLeverage ?? currentLeverage;

	useEffect(() => {
		if (open) {
			setSelectedMode(currentMode);
			setShowSuccess(false);
			resetPendingLeverage();
		} else if (autoCloseTimerRef.current) {
			clearTimeout(autoCloseTimerRef.current);
			autoCloseTimerRef.current = null;
		}

		return () => {
			if (autoCloseTimerRef.current) {
				clearTimeout(autoCloseTimerRef.current);
			}
		};
	}, [open, currentMode, resetPendingLeverage]);

	const modeDirty = selectedMode !== currentMode;
	const leverageDirty = pendingLeverage !== null && pendingLeverage !== currentLeverage;
	const isDirty = modeDirty || leverageDirty;
	const cannotSwitch = hasPosition && selectedMode === "isolated" && currentMode === "cross";

	async function handleConfirm(): Promise<void> {
		if (!isDirty || cannotSwitch) return;
		const lev = pendingLeverage ?? currentLeverage;
		try {
			await onApply(selectedMode, lev);
			setShowSuccess(true);
			autoCloseTimerRef.current = setTimeout(() => {
				onOpenChange(false);
				setShowSuccess(false);
			}, MARGIN_MODE_SUCCESS_DURATION_MS);
		} catch {}
	}

	function handleCancel() {
		setSelectedMode(currentMode);
		resetPendingLeverage();
		onOpenChange(false);
	}

	const selectedModeDescription = MODE_OPTIONS.find((o) => o.id === selectedMode)?.description();

	return (
		<Modal open={open} onOpenChange={onOpenChange}>
			<ModalPopup size="sm">
				<ModalHeader>
					<ModalTitle>
						<Trans>Margin & leverage</Trans>
					</ModalTitle>
				</ModalHeader>

				<ModalContent className="space-y-5">
					<div className="space-y-2.5">
						<p className="text-2xs font-semibold uppercase text-text-weak">
							<Trans>Margin mode</Trans>
						</p>
						<div className="grid grid-cols-2 gap-0.5 rounded-xs bg-bg-sunken p-1">
							{MODE_OPTIONS.map((option) => (
								<ModeOption
									key={option.id}
									option={option}
									isSelected={selectedMode === option.id}
									isCurrent={currentMode === option.id}
									isDisabled={isOnlyIsolated && option.id === "cross"}
									isUpdating={isUpdating}
									onSelect={() => setSelectedMode(option.id)}
								/>
							))}
						</div>
						{selectedModeDescription && (
							<p className="text-2xs leading-relaxed text-pretty text-text-weak">{selectedModeDescription}</p>
						)}
					</div>

					{showLeverage && maxLeverage > 1 && (
						<div className="space-y-3 border-t border-stroke-weak/60 pt-4">
							<div className="flex items-center justify-between">
								<p className="text-2xs font-semibold uppercase text-text-weak">
									<Trans>Leverage</Trans>
								</p>
								<div className="flex items-center gap-1.5 tabular-nums">
									{leverageDirty && (
										<>
											<span className="text-xs text-text-weak">{currentLeverage}×</span>
											<span className="text-xs text-text-weak">→</span>
										</>
									)}
									<span className="text-sm font-semibold text-text-strong">{displayLeverage}×</span>
								</div>
							</div>
							<LeverageSlider
								value={displayLeverage}
								onChange={onPendingLeverageChange}
								max={maxLeverage}
								disabled={isUpdating}
							/>
						</div>
					)}

					{cannotSwitch && (
						<div className="flex items-start gap-2 rounded-xs border border-stroke-warning-strong/20 bg-fill-warning-weak/10 p-2.5">
							<WarningIcon className="mt-0.5 size-3.5 shrink-0 text-text-warning" />
							<p className="text-xs leading-relaxed text-text-warning">
								<Trans>Cannot switch to Isolated mode with an open position. Close your position first.</Trans>
							</p>
						</div>
					)}

					{updateError && (
						<div className="flex items-center gap-2 rounded-xs border border-stroke-error-strong/20 bg-fill-error-weak p-2.5 text-xs text-text-error">
							<WarningIcon className="size-3.5 shrink-0" />
							<span className="min-w-0 flex-1">{updateError.message || t`Update failed`}</span>
						</div>
					)}

					{showSuccess && (
						<div className="flex items-center justify-center gap-2 rounded-xs border border-stroke-success-strong/20 bg-fill-success-weak p-2.5 text-xs text-text-success">
							<CheckIcon className="size-3.5" />
							<Trans>Updated</Trans>
						</div>
					)}
				</ModalContent>

				<ModalFooter>
					<Button variant="ghost" intent="neutral" size="sm" onClick={handleCancel} disabled={isUpdating}>
						<Trans>Cancel</Trans>
					</Button>
					<TradingActionButton
						onClick={handleConfirm}
						disabled={!isDirty || isUpdating || cannotSwitch || showSuccess}
						className="gap-1.5"
					>
						{isUpdating && <SpinnerGapIcon className="size-3.5 animate-spin" />}
						<Trans>Confirm</Trans>
					</TradingActionButton>
				</ModalFooter>
			</ModalPopup>
		</Modal>
	);
}
