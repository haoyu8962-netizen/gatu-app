import {
	AdaptiveModal,
	Button,
	Modal,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalPopup,
	ModalTitle,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { CaretDownIcon, CheckIcon, ShieldIcon, SpinnerGapIcon, StackIcon, WarningIcon } from "@phosphor-icons/react";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MARGIN_MODE_SUCCESS_DURATION_MS } from "@/config/time";
import { useAutoCloseSuccess } from "@/hooks/ui/use-auto-close-success";
import { cn } from "@/lib/cn";
import type { MarginMode } from "@/lib/trade/margin-mode";
import { TradingActionButton } from "../components/trading-action-button";
import { AccountModeForm, type AccountModeFormProps } from "./account-mode-modal";
import { LeverageEditor } from "./leverage-editor";

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
	committedLeverage?: number | null;
	maxLeverage: number;
	onPendingLeverageChange: (value: number) => void;
	hasPosition: boolean;
	positionStateReady: boolean;
	allowsCrossMargin: boolean;
	allowsIsolatedMarginRemoval: boolean;
	isUpdating: boolean;
	updateError: Error | null;
	showLeverage: boolean;
	onApply: (mode: MarginMode, leverage: number) => Promise<void>;
	presentation?: "modal" | "drawer";
	marketIdentity?: string;
	marketLabel?: string;
	settingsTab?: MobileTradeSettingsTab;
	onSettingsTabChange?: (tab: MobileTradeSettingsTab) => void;
	accountModeForm?: Omit<AccountModeFormProps, "onClose">;
	mobileView?: MobileTradeSettingsView;
}

export type MobileTradeSettingsTab = "margin" | "account";
export type MobileTradeSettingsView = "margin" | "leverage";

type FormProps = Omit<
	Props,
	| "open"
	| "onOpenChange"
	| "presentation"
	| "marketIdentity"
	| "marketLabel"
	| "settingsTab"
	| "onSettingsTabChange"
	| "accountModeForm"
	| "mobileView"
> & {
	onClose: () => void;
	sessionOpen: boolean;
	mobileLayout?: boolean;
	mobileView?: MobileTradeSettingsView;
	leverageDraft?: number | null;
	onLeverageDraftChange?: (value: number | null) => void;
	onSubmissionLockChange?: (locked: boolean) => void;
};

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
	description: string;
	isSelected: boolean;
	isCurrent: boolean;
	isDisabled: boolean;
	isUpdating: boolean;
	onSelect: () => void;
}

function ModeOption({ option, description, isSelected, isCurrent, isDisabled, isUpdating, onSelect }: ModeOptionProps) {
	return (
		<button
			type="button"
			onClick={onSelect}
			disabled={isUpdating || isDisabled}
			aria-pressed={isSelected}
			className={cn(
				"w-full rounded-12 border px-3.5 py-3 text-left transition-[color,background-color,border-color]",
				"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
				isSelected
					? "border-[1.5px] border-trading-panel-control bg-trading-panel-card"
					: "border-trading-panel-stroke-card bg-modal enabled:hover:border-trading-panel-control enabled:hover:bg-trading-panel-hover",
				isDisabled && "cursor-not-allowed opacity-40",
			)}
		>
			<span className="flex min-w-0 items-center gap-2">
				<span
					className={cn(
						"grid size-[17px] shrink-0 place-items-center rounded-[5px] border",
						isSelected
							? "border-trading-panel-control bg-trading-panel-control text-trading-panel-on-control"
							: "border-trading-panel-stroke-input bg-modal",
					)}
					aria-hidden="true"
				>
					{isSelected ? <CheckIcon className="size-3" weight="bold" /> : null}
				</span>
				<span className="min-w-0 flex-1 text-2sm font-semibold text-trading-panel-fg">{option.label()}</span>
				{isCurrent ? (
					<span className="shrink-0 text-2xs font-medium uppercase text-trading-panel-subtle">
						<Trans>Current</Trans>
					</span>
				) : null}
			</span>
			<span className="mt-1.5 block text-xs leading-relaxed text-trading-panel-muted">{description}</span>
		</button>
	);
}
function MarginModeModalComponent({
	open,
	onOpenChange,
	presentation = "modal",
	marketIdentity,
	marketLabel,
	settingsTab = "margin",
	onSettingsTabChange,
	accountModeForm,
	mobileView = "margin",
	...formProps
}: Props) {
	const [submissionLocked, setSubmissionLocked] = useState(false);
	const marketFormKey = marketIdentity ?? "market";
	const capabilityKey = `${formProps.maxLeverage}:${formProps.showLeverage ? "leveraged" : "fixed"}`;
	const formKey = `${open}:${marketFormKey}:${capabilityKey}`;
	const actionPending = formProps.isUpdating || !!accountModeForm?.isUpdating;
	const dismissBlocked = actionPending || submissionLocked;

	function handleOpenChange(nextOpen: boolean, eventDetails?: { cancel: () => void }) {
		if (!nextOpen && dismissBlocked) {
			eventDetails?.cancel();
			return;
		}
		onOpenChange(nextOpen);
	}

	if (presentation === "drawer") {
		const title =
			settingsTab === "account" ? (
				<Trans>Account type</Trans>
			) : (
				<>
					{marketLabel ? `${marketLabel} ` : null}
					<Trans>Margin mode</Trans>
				</>
			);

		function handleTabChange(value: string) {
			if (dismissBlocked) return;
			if (value === "margin" || value === "account") onSettingsTabChange?.(value);
		}

		return (
			<AdaptiveModal
				open={open}
				onOpenChange={handleOpenChange}
				presentation="drawer"
				size="sm"
				dismissible={!dismissBlocked}
				showClose={!dismissBlocked && mobileView !== "leverage"}
				showHandle={!dismissBlocked}
				handleClassName="top-2 h-1 w-9 bg-trading-panel-stroke-input"
				overlayClassName="bg-trading-panel-scrim"
				className="max-h-[calc(100dvh-1rem)] !rounded-t-[18px] border-trading-panel-stroke-card font-market-close"
			>
				{mobileView === "leverage" ? (
					<MobileLeverageDrawerContent
						key={`${marketFormKey}:leverage:${capabilityKey}`}
						{...formProps}
						isUpdating={dismissBlocked || !open}
						onClose={() => handleOpenChange(false)}
						sessionOpen={open}
						onSubmissionLockChange={setSubmissionLocked}
					/>
				) : (
					<>
						<ModalHeader divider={false} className="px-4 pt-7 pr-14 pb-2">
							<ModalTitle className="text-trading-panel-fg">{title}</ModalTitle>
						</ModalHeader>
						{accountModeForm ? (
							<Tabs value={settingsTab} onValueChange={handleTabChange} size="md" fullWidth disabled={dismissBlocked}>
								<div className="px-4">
									<TabsList
										className="w-full border-trading-panel-stroke-card"
										indicatorClassName="bg-trading-panel-control"
									>
										<TabsTrigger
											value="margin"
											className="min-h-10 text-2sm text-trading-panel-subtle data-active:font-semibold data-active:text-trading-panel-fg"
										>
											<Trans>Position margin</Trans>
										</TabsTrigger>
										<TabsTrigger
											value="account"
											className="min-h-10 text-2sm text-trading-panel-subtle data-active:font-semibold data-active:text-trading-panel-fg"
										>
											<Trans>Account type</Trans>
										</TabsTrigger>
									</TabsList>
								</div>

								<TabsContent value="margin" className="pt-0">
									{settingsTab === "margin" ? (
										<MarginModeForm
											key={formKey}
											{...formProps}
											isUpdating={dismissBlocked}
											onClose={() => handleOpenChange(false)}
											sessionOpen={open}
											onSubmissionLockChange={setSubmissionLocked}
											mobileLayout
											mobileView="margin"
										/>
									) : null}
								</TabsContent>
								<TabsContent value="account" className="pt-0">
									{settingsTab === "account" ? (
										<AccountModeForm
											key={`${open}:${accountModeForm.currentMode ?? "unavailable"}`}
											{...accountModeForm}
											isUpdating={dismissBlocked}
											onClose={() => handleOpenChange(false)}
											onSubmissionLockChange={setSubmissionLocked}
											mobileLayout
										/>
									) : null}
								</TabsContent>
							</Tabs>
						) : (
							<MarginModeForm
								key={formKey}
								{...formProps}
								isUpdating={dismissBlocked}
								onClose={() => handleOpenChange(false)}
								sessionOpen={open}
								onSubmissionLockChange={setSubmissionLocked}
								mobileLayout
								mobileView="margin"
							/>
						)}
					</>
				)}
			</AdaptiveModal>
		);
	}

	return (
		<Modal open={open} onOpenChange={handleOpenChange} disablePointerDismissal={dismissBlocked}>
			<ModalPopup
				size="sm"
				showClose={!dismissBlocked}
				overlayClassName="bg-trading-panel-scrim"
				className="font-market-close"
			>
				<ModalHeader>
					<ModalTitle>
						<Trans>Margin mode</Trans>
					</ModalTitle>
				</ModalHeader>
				<MarginModeForm
					key={formKey}
					{...formProps}
					isUpdating={dismissBlocked}
					onClose={() => handleOpenChange(false)}
					sessionOpen={open}
					onSubmissionLockChange={setSubmissionLocked}
				/>
			</ModalPopup>
		</Modal>
	);
}

export const MarginModeModal = memo(MarginModeModalComponent);

function MobileLeverageDrawerContent(props: FormProps) {
	const [leverageDraft, setLeverageDraft] = useState<number | null>(null);

	return (
		<>
			<ModalHeader divider={false} className="px-4 pt-7 pb-2 pr-4">
				<ModalTitle className="text-trading-panel-fg">
					<Trans>Adjust leverage</Trans>
				</ModalTitle>
			</ModalHeader>
			<MarginModeForm
				{...props}
				mobileLayout
				mobileView="leverage"
				leverageDraft={leverageDraft}
				onLeverageDraftChange={setLeverageDraft}
			/>
		</>
	);
}

function MarginModeForm({
	onClose,
	sessionOpen,
	currentMode,
	currentLeverage,
	pendingLeverage,
	committedLeverage: appliedLeverage = null,
	maxLeverage,
	onPendingLeverageChange,
	hasPosition,
	positionStateReady,
	allowsCrossMargin,
	allowsIsolatedMarginRemoval,
	isUpdating,
	updateError,
	showLeverage,
	onApply,
	mobileLayout = false,
	mobileView = "margin",
	leverageDraft = null,
	onLeverageDraftChange,
	onSubmissionLockChange,
}: FormProps) {
	const [selectedMode, setSelectedMode] = useState<MarginMode>(currentMode);
	const [submittedLeverage, setSubmittedLeverage] = useState<number | null>(null);
	const [leverageInputValid, setLeverageInputValid] = useState(true);
	const applyInFlightRef = useRef(false);
	const mountedRef = useRef(false);
	const {
		showSuccess,
		trigger: triggerAutoClose,
		reset: resetAutoClose,
	} = useAutoCloseSuccess(onClose, MARGIN_MODE_SUCCESS_DURATION_MS);

	useLayoutEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		if (sessionOpen) return;
		resetAutoClose();
		setSubmittedLeverage(null);
		setLeverageInputValid(true);
		onLeverageDraftChange?.(null);
	}, [onLeverageDraftChange, resetAutoClose, sessionOpen]);

	const effectiveLeverage = appliedLeverage ?? currentLeverage;
	const canonicalLeverage = pendingLeverage ?? effectiveLeverage;
	const successfulLeverage = appliedLeverage ?? submittedLeverage ?? canonicalLeverage;
	const displayLeverage = showSuccess ? successfulLeverage : (leverageDraft ?? canonicalLeverage);

	function handleLeverageChange(value: number) {
		if (showSuccess) return;
		onLeverageDraftChange?.(null);
		onPendingLeverageChange(value);
	}

	const showMarginControls = !mobileLayout || mobileView === "margin";
	const showLeverageControls = showLeverage && maxLeverage > 1 && (!mobileLayout || mobileView === "leverage");
	const modeDirty = showMarginControls && selectedMode !== currentMode;
	const leverageDirty = showLeverageControls && pendingLeverage !== null && pendingLeverage !== effectiveLeverage;
	const isDirty = modeDirty || leverageDirty;
	const leverageInputInvalid = showLeverageControls && !leverageInputValid;
	const hasLeverageDraft = showLeverageControls && leverageDraft !== null;
	const cannotSwitch = hasPosition && selectedMode === "isolated" && currentMode === "cross";
	const positionStateUnavailable = !positionStateReady && selectedMode === "isolated" && currentMode === "cross";

	async function handleConfirm(): Promise<void> {
		if (
			!isDirty ||
			hasLeverageDraft ||
			leverageInputInvalid ||
			isUpdating ||
			cannotSwitch ||
			positionStateUnavailable ||
			showSuccess ||
			applyInFlightRef.current
		)
			return;
		applyInFlightRef.current = true;
		onSubmissionLockChange?.(true);
		const mode = showMarginControls ? selectedMode : currentMode;
		const lev = showLeverageControls ? canonicalLeverage : effectiveLeverage;
		if (showLeverageControls) {
			setSubmittedLeverage(lev);
			onLeverageDraftChange?.(lev);
		}
		try {
			await onApply(mode, lev);
			applyInFlightRef.current = false;
			onSubmissionLockChange?.(false);
			if (mountedRef.current) triggerAutoClose();
		} catch {
			applyInFlightRef.current = false;
			onSubmissionLockChange?.(false);
			if (mountedRef.current && showLeverageControls) {
				setSubmittedLeverage(null);
				onLeverageDraftChange?.(null);
			}
		}
	}

	function handleCancel() {
		onClose();
	}

	function getModeDescription(mode: MarginMode): string {
		return mode === "isolated" && !allowsIsolatedMarginRemoval
			? t`Each position uses only its allocated margin. If the margin ratio reaches 100%, the position is liquidated. Margin can be added, but cannot be removed while the position is open.`
			: (MODE_OPTIONS.find((option) => option.id === mode)?.description() ?? "");
	}

	return (
		<>
			<ModalContent className={cn("space-y-5", mobileLayout && "overflow-y-auto px-4 pt-3 pb-3")}>
				{showMarginControls ? (
					<div className="space-y-2.5">
						<div className="space-y-2">
							{MODE_OPTIONS.map((option) => (
								<ModeOption
									key={option.id}
									option={option}
									description={getModeDescription(option.id)}
									isSelected={selectedMode === option.id}
									isCurrent={currentMode === option.id}
									isDisabled={!allowsCrossMargin && option.id === "cross"}
									isUpdating={isUpdating || showSuccess}
									onSelect={() => {
										if (!showSuccess) setSelectedMode(option.id);
									}}
								/>
							))}
						</div>
					</div>
				) : null}

				{showLeverageControls && (
					<LeverageEditor
						key={maxLeverage}
						value={displayLeverage}
						riskValue={showSuccess ? successfulLeverage : (leverageDraft ?? canonicalLeverage)}
						max={maxLeverage}
						disabled={isUpdating || showSuccess}
						onChange={handleLeverageChange}
						onDraftChange={onLeverageDraftChange}
						onInputValidityChange={setLeverageInputValid}
						variant={mobileLayout ? "sheet" : "modal"}
					/>
				)}

				{mobileLayout && mobileView === "leverage" && !showLeverageControls ? (
					<p className="rounded-12 border border-trading-panel-stroke-card bg-trading-panel-card px-3.5 py-4 text-xs leading-relaxed text-trading-panel-muted">
						<Trans>Leverage is fixed at {currentLeverage}× for this market.</Trans>
					</p>
				) : null}

				{cannotSwitch && (
					<div className="flex items-start gap-2 rounded-xs border border-stroke-warning-strong/20 bg-warning-soft/10 p-2.5">
						<WarningIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
						<p className="text-xs leading-relaxed text-warning">
							<Trans>Cannot switch to Isolated mode with an open position. Close your position first.</Trans>
						</p>
					</div>
				)}

				{positionStateUnavailable && (
					<div className="flex items-start gap-2 rounded-xs border border-stroke-warning-strong/20 bg-warning-soft/10 p-2.5">
						<WarningIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
						<p className="text-xs leading-relaxed text-warning">
							<Trans>
								Position data is unavailable. Wait for the account connection to recover before changing margin mode.
							</Trans>
						</p>
					</div>
				)}

				{showMarginControls && !allowsCrossMargin && (
					<p className="text-xs leading-relaxed text-fg-muted">
						<Trans>This market only supports isolated margin mode.</Trans>
					</p>
				)}

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

			<ModalFooter className={cn(mobileLayout && "px-4 pt-0 pb-4")}>
				{!showSuccess && mobileView === "leverage" && (
					<Button
						variant="outline"
						intent="neutral"
						size="sm"
						onClick={handleCancel}
						disabled={isUpdating}
						className="min-h-11 flex-1 rounded-[10px] border-trading-panel-stroke-input font-semibold text-trading-panel-fg shadow-none"
					>
						<Trans>Cancel</Trans>
					</Button>
				)}
				{showSuccess ? (
					<Button
						variant="filled"
						intent="neutral"
						size="sm"
						disabled
						className={cn(
							"gap-1.5 border-stroke-success-strong/30 bg-success-soft text-success disabled:opacity-100",
							mobileLayout && "min-h-11 w-full flex-1",
						)}
						iconLeft={<CheckIcon className="size-3.5" weight="bold" />}
					>
						{showLeverageControls ? <Trans>Updated to {displayLeverage}x</Trans> : <Trans>Updated</Trans>}
					</Button>
				) : (
					<TradingActionButton
						onClick={handleConfirm}
						disabled={
							!isDirty ||
							hasLeverageDraft ||
							leverageInputInvalid ||
							isUpdating ||
							cannotSwitch ||
							positionStateUnavailable
						}
						containerClassName={cn(mobileLayout && "w-full flex-1")}
						className="gap-1.5 min-h-11 w-full flex-1 rounded-[10px] bg-trading-panel-control font-bold text-trading-panel-on-control hover:opacity-90"
					>
						{isUpdating && <SpinnerGapIcon className="size-3.5 animate-spin" />}
						<Trans>Confirm</Trans>
					</TradingActionButton>
				)}
			</ModalFooter>
		</>
	);
}
