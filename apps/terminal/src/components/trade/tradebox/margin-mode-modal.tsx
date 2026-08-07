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
import { useState } from "react";
import { MARGIN_MODE_SUCCESS_DURATION_MS } from "@/config/time";
import { useAutoCloseSuccess } from "@/hooks/ui/use-auto-close-success";
import { cn } from "@/lib/cn";
import type { MarginMode } from "@/lib/trade/margin-mode";
import { TradingActionButton } from "../components/trading-action-button";
import { AccountModeForm, type AccountModeFormProps } from "./account-mode-modal";
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
	mobileLayout?: boolean;
	mobileView?: MobileTradeSettingsView;
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
	mobileLayout: boolean;
	onSelect: () => void;
}

function ModeOption({
	option,
	description,
	isSelected,
	isCurrent,
	isDisabled,
	isUpdating,
	mobileLayout,
	onSelect,
}: ModeOptionProps) {
	const Icon = option.icon;

	if (mobileLayout) {
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
					<span className="min-w-0 flex-1 text-[13px] font-semibold text-trading-panel-fg">{option.label()}</span>
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

	return (
		<button
			type="button"
			onClick={onSelect}
			disabled={isUpdating || isDisabled}
			aria-pressed={isSelected}
			className={cn(
				"flex min-h-11 w-full items-center gap-2 rounded-8 px-3 py-2.5 text-left transition-colors",
				isSelected ? "bg-surface text-fg" : "text-fg-muted hover:text-fg",
				isDisabled && "opacity-40 cursor-not-allowed",
			)}
		>
			<Icon className={cn("size-3.5 shrink-0", isSelected ? "text-brand" : "text-fg-muted")} />
			<span className="text-xs font-semibold">{option.label()}</span>
			{isCurrent && (
				<span className="ml-auto text-2xs font-medium uppercase text-fg-muted">
					<Trans>Current</Trans>
				</span>
			)}
			{isSelected && !isCurrent && <CheckIcon className="ml-auto size-3 text-brand" />}
		</button>
	);
}

export function MarginModeModal({
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
	const formKey = `${open}:${marketIdentity ?? "market"}`;

	if (presentation === "drawer") {
		const actionPending = formProps.isUpdating || !!accountModeForm?.isUpdating;
		const title =
			mobileView === "leverage" ? (
				<>
					{marketLabel ? `${marketLabel} ` : null}
					<Trans>Leverage</Trans>
				</>
			) : settingsTab === "account" ? (
				<Trans>Account type</Trans>
			) : (
				<>
					{marketLabel ? `${marketLabel} ` : null}
					<Trans>Margin mode</Trans>
				</>
			);

		function handleTabChange(value: string) {
			if (actionPending) return;
			if (value === "margin" || value === "account") onSettingsTabChange?.(value);
		}

		return (
			<AdaptiveModal
				open={open}
				onOpenChange={onOpenChange}
				presentation="drawer"
				size="sm"
				dismissible={!actionPending}
				showClose={!actionPending}
				showHandle={!actionPending}
				handleClassName="top-2 h-1 w-9 bg-trading-panel-stroke-input"
				overlayClassName="bg-trading-panel-scrim"
				className="max-h-[calc(100dvh-1rem)] !rounded-t-[18px] border-trading-panel-stroke-card"
			>
				<ModalHeader divider={false} className="px-4 pt-7 pb-2 pr-14">
					<ModalTitle className="text-trading-panel-fg">{title}</ModalTitle>
				</ModalHeader>

				{mobileView === "leverage" ? (
					<MarginModeForm
						key={`${formKey}:leverage`}
						{...formProps}
						isUpdating={actionPending}
						onClose={() => onOpenChange(false)}
						mobileLayout
						mobileView="leverage"
					/>
				) : accountModeForm ? (
					<Tabs value={settingsTab} onValueChange={handleTabChange} size="md" fullWidth disabled={actionPending}>
						<div className="px-4">
							<TabsList
								className="w-full border-trading-panel-stroke-card"
								indicatorClassName="bg-trading-panel-control"
							>
								<TabsTrigger
									value="margin"
									className="min-h-10 text-[13px] text-trading-panel-subtle data-active:font-semibold data-active:text-trading-panel-fg"
								>
									<Trans>Position margin</Trans>
								</TabsTrigger>
								<TabsTrigger
									value="account"
									className="min-h-10 text-[13px] text-trading-panel-subtle data-active:font-semibold data-active:text-trading-panel-fg"
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
									isUpdating={actionPending}
									onClose={() => onOpenChange(false)}
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
									isUpdating={actionPending}
									onClose={() => onOpenChange(false)}
									mobileLayout
								/>
							) : null}
						</TabsContent>
					</Tabs>
				) : (
					<MarginModeForm
						key={formKey}
						{...formProps}
						isUpdating={actionPending}
						onClose={() => onOpenChange(false)}
						mobileLayout
						mobileView="margin"
					/>
				)}
			</AdaptiveModal>
		);
	}

	return (
		<Modal open={open} onOpenChange={onOpenChange}>
			<ModalPopup size="sm">
				<ModalHeader>
					<ModalTitle>
						<Trans>Margin & leverage</Trans>
					</ModalTitle>
				</ModalHeader>
				<MarginModeForm key={formKey} {...formProps} onClose={() => onOpenChange(false)} />
			</ModalPopup>
		</Modal>
	);
}

function MarginModeForm({
	onClose,
	currentMode,
	currentLeverage,
	pendingLeverage,
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
}: FormProps) {
	const [selectedMode, setSelectedMode] = useState<MarginMode>(currentMode);
	const { showSuccess, trigger: triggerAutoClose } = useAutoCloseSuccess(onClose, MARGIN_MODE_SUCCESS_DURATION_MS);

	const displayLeverage = pendingLeverage ?? currentLeverage;

	const showMarginControls = !mobileLayout || mobileView === "margin";
	const showLeverageControls = showLeverage && maxLeverage > 1 && (!mobileLayout || mobileView === "leverage");
	const modeDirty = showMarginControls && selectedMode !== currentMode;
	const leverageDirty = showLeverageControls && pendingLeverage !== null && pendingLeverage !== currentLeverage;
	const isDirty = modeDirty || leverageDirty;
	const cannotSwitch = hasPosition && selectedMode === "isolated" && currentMode === "cross";
	const positionStateUnavailable = !positionStateReady && selectedMode === "isolated" && currentMode === "cross";

	async function handleConfirm(): Promise<void> {
		if (!isDirty || cannotSwitch || positionStateUnavailable) return;
		const mode = showMarginControls ? selectedMode : currentMode;
		const lev = showLeverageControls ? (pendingLeverage ?? currentLeverage) : currentLeverage;
		try {
			await onApply(mode, lev);
			triggerAutoClose();
		} catch {}
	}

	function handleCancel() {
		onClose();
	}

	function getModeDescription(mode: MarginMode): string {
		return mode === "isolated" && !allowsIsolatedMarginRemoval
			? t`Each position uses only its allocated margin. If the margin ratio reaches 100%, the position is liquidated. Margin can be added, but cannot be removed while the position is open.`
			: (MODE_OPTIONS.find((option) => option.id === mode)?.description() ?? "");
	}

	const selectedModeDescription = getModeDescription(selectedMode);

	return (
		<>
			<ModalContent className={cn("space-y-5", mobileLayout && "overflow-y-auto px-4 pt-3 pb-3")}>
				{showMarginControls ? (
					<div className="space-y-2.5">
						{!mobileLayout ? (
							<p className="text-2xs font-semibold uppercase text-fg-muted">
								<Trans>Margin mode</Trans>
							</p>
						) : null}
						<div className={cn(mobileLayout ? "space-y-2" : "grid grid-cols-2 gap-0.5 rounded-xs bg-sunken p-1")}>
							{MODE_OPTIONS.map((option) => (
								<ModeOption
									key={option.id}
									option={option}
									description={getModeDescription(option.id)}
									isSelected={selectedMode === option.id}
									isCurrent={currentMode === option.id}
									isDisabled={!allowsCrossMargin && option.id === "cross"}
									isUpdating={isUpdating}
									mobileLayout={mobileLayout}
									onSelect={() => setSelectedMode(option.id)}
								/>
							))}
						</div>
						{!mobileLayout && selectedModeDescription && (
							<p className="text-2xs leading-relaxed text-pretty text-fg-muted">{selectedModeDescription}</p>
						)}
					</div>
				) : null}

				{showLeverageControls && (
					<div
						className={cn(
							"space-y-3",
							mobileLayout
								? "rounded-12 border border-trading-panel-stroke-card bg-trading-panel-card px-3.5 py-4"
								: "border-t border-stroke-weak/60 pt-4",
						)}
					>
						<div className="flex items-center justify-between">
							<p
								className={cn(
									"text-2xs font-semibold uppercase",
									mobileLayout ? "text-trading-panel-muted" : "text-fg-muted",
								)}
							>
								<Trans>Leverage</Trans>
							</p>
							<div className="flex items-center gap-1.5 tabular-nums">
								{leverageDirty && (
									<>
										<span className={cn("text-xs", mobileLayout ? "text-trading-panel-muted" : "text-fg-muted")}>
											{currentLeverage}×
										</span>
										<span className={cn("text-xs", mobileLayout ? "text-trading-panel-muted" : "text-fg-muted")}>
											→
										</span>
									</>
								)}
								<span className={cn("text-sm font-semibold", mobileLayout ? "text-trading-panel-fg" : "text-fg")}>
									{displayLeverage}×
								</span>
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
					<div className="flex items-center gap-2 rounded-xs border border-stroke-error-strong/20 bg-error-soft p-2.5 text-xs text-error">
						<WarningIcon className="size-3.5 shrink-0" />
						<span className="min-w-0 flex-1">{updateError.message || t`Update failed`}</span>
					</div>
				)}
			</ModalContent>

			<ModalFooter className={cn(mobileLayout && "px-4 pt-0 pb-4")}>
				{!mobileLayout && !showSuccess && (
					<Button
						variant="ghost"
						intent="neutral"
						size="sm"
						onClick={handleCancel}
						disabled={isUpdating}
						className={cn(mobileLayout && "min-h-11 flex-1")}
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
						<Trans>Updated</Trans>
					</Button>
				) : (
					<TradingActionButton
						onClick={handleConfirm}
						disabled={!isDirty || isUpdating || cannotSwitch || positionStateUnavailable}
						containerClassName={cn(mobileLayout && "w-full flex-1")}
						className={cn(
							"gap-1.5",
							mobileLayout &&
								"min-h-11 w-full flex-1 bg-trading-panel-control text-trading-panel-on-control hover:opacity-90",
						)}
					>
						{isUpdating && <SpinnerGapIcon className="size-3.5 animate-spin" />}
						<Trans>Confirm</Trans>
					</TradingActionButton>
				)}
			</ModalFooter>
		</>
	);
}
