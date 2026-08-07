import { Button, Modal, ModalContent, ModalFooter, ModalHeader, ModalPopup, ModalTitle } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { CheckIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { useState } from "react";
import type { SelectableAccountAbstraction } from "@/hooks/trade/use-account-abstraction-control";
import { cn } from "@/lib/cn";

export interface AccountModeFormProps {
	currentMode: SelectableAccountAbstraction | null;
	isLoading?: boolean;
	isUpdating?: boolean;
	canChange?: boolean;
	portfolioMarginActivationEnabled?: boolean;
	mobileLayout?: boolean;
	onConnect?: () => void;
	onClose: () => void;
	onApply: (mode: SelectableAccountAbstraction) => Promise<void>;
}

interface Props extends Omit<AccountModeFormProps, "onClose"> {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

interface AccountModeOption {
	id: SelectableAccountAbstraction;
	label: string;
	badge?: string;
	description: string;
}

export function AccountModeModal({ open, onOpenChange, ...formProps }: Props) {
	return (
		<Modal open={open} onOpenChange={onOpenChange}>
			<ModalPopup size="sm" className="max-h-[min(90dvh,42rem)]">
				<ModalHeader>
					<ModalTitle>
						<Trans>Account type</Trans>
					</ModalTitle>
				</ModalHeader>
				<AccountModeForm
					key={`${open}:${formProps.currentMode ?? "unavailable"}`}
					{...formProps}
					onClose={() => onOpenChange(false)}
				/>
			</ModalPopup>
		</Modal>
	);
}

export function AccountModeForm({
	currentMode,
	isLoading,
	isUpdating,
	canChange,
	portfolioMarginActivationEnabled = false,
	mobileLayout = false,
	onConnect,
	onClose,
	onApply,
}: AccountModeFormProps) {
	const { t } = useLingui();
	const [selectedMode, setSelectedMode] = useState<SelectableAccountAbstraction | null>(currentMode);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const accountModeOptions: AccountModeOption[] = [
		{
			id: "unifiedAccount",
			label: t`Unified account`,
			badge: t`Recommended`,
			description: t`Recommended account setting. Each collateral asset has a single balance. Perps can only use the settlement asset as collateral, and cross margin is shared between cross positions that use the same collateral asset.`,
		},
		{
			id: "portfolioMargin",
			label: t`Portfolio margin`,
			description: t`For advanced users who want higher flexibility and capital efficiency. Spot and perps trading are fully unified, and eligible collateral assets such as HYPE and BTC can be used directly as perp collateral without converting to the settlement asset.`,
		},
		{
			id: "disabled",
			label: t`Separate`,
			description: t`Recommended only for automated traders. Every DEX has a separate balance, and cross margin applies separately within each DEX.`,
		},
	];
	const selectedModeLabel = accountModeOptions.find((option) => option.id === selectedMode)?.label;
	const isDirty = selectedMode !== null && selectedMode !== currentMode;
	const isBusy = !!isLoading || !!isUpdating;
	const isModeUnavailable = !!canChange && !isLoading && currentMode === null;
	const portfolioGuidance = (
		<>
			<p className={cn("text-2xs leading-relaxed", mobileLayout ? "text-trading-panel-muted" : "text-fg-muted")}>
				<Trans>
					Hyperliquid labels portfolio margin as pre-alpha and recommends testing with new accounts or subaccounts
					holding less than $1,000.
				</Trans>
			</p>
			{!portfolioMarginActivationEnabled && currentMode !== "portfolioMargin" ? (
				<p className={cn("text-xs", mobileLayout ? "text-trading-panel-error" : "text-warning")}>
					<Trans>
						New portfolio margin activation is temporarily unavailable. Existing portfolio margin accounts are not
						affected and can switch away.
					</Trans>
				</p>
			) : null}
		</>
	);

	async function handleApply() {
		if (!canChange) {
			onClose();
			onConnect?.();
			return;
		}
		if (!selectedMode || !isDirty || isBusy || isModeUnavailable) return;

		setSubmitError(null);
		try {
			await onApply(selectedMode);
			onClose();
		} catch (error) {
			setSubmitError(error instanceof Error && error.message ? error.message : t`Failed to update account mode`);
		}
	}

	return (
		<>
			<ModalContent className={cn("space-y-3 overflow-y-auto", mobileLayout && "px-4 pt-3 pb-3")}>
				<div className="space-y-2">
					{accountModeOptions.map((option) => {
						const isSelected = selectedMode === option.id;
						const isCurrent = currentMode === option.id;
						const isActivationDisabled =
							option.id === "portfolioMargin" && !isCurrent && !portfolioMarginActivationEnabled;
						const isOptionDisabled = isBusy || isModeUnavailable || isActivationDisabled;

						return (
							<button
								key={option.id}
								type="button"
								onClick={() => setSelectedMode(option.id)}
								disabled={isOptionDisabled}
								aria-pressed={isSelected}
								className={cn(
									"min-h-11 w-full border px-3 py-3 text-left transition-colors",
									"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
									mobileLayout ? "rounded-12 px-3.5" : "rounded-8",
									isSelected && mobileLayout
										? "border-[1.5px] border-trading-panel-control bg-trading-panel-card text-trading-panel-fg"
										: isSelected
											? "border-stroke-selected bg-brand-soft text-fg"
											: mobileLayout
												? "border-trading-panel-stroke-card bg-modal text-trading-panel-fg enabled:hover:border-trading-panel-control enabled:hover:bg-trading-panel-hover"
												: "border-stroke-weak bg-fill-weak/40 text-fg hover:bg-fill-hover",
									isOptionDisabled && "cursor-not-allowed opacity-70",
								)}
							>
								<span className="flex min-w-0 items-center gap-2">
									{mobileLayout ? (
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
									) : null}
									<span className={cn("min-w-0 flex-1 font-semibold", mobileLayout ? "text-[13px]" : "text-sm")}>
										{option.label}
										{option.badge ? (
											<span
												className={cn(
													"ml-1 text-2xs font-medium",
													mobileLayout ? "text-trading-panel-muted" : "text-brand",
												)}
											>
												({option.badge})
											</span>
										) : null}
									</span>
									{isCurrent ? (
										<span
											className={cn(
												"text-2xs font-medium uppercase",
												mobileLayout ? "text-trading-panel-subtle" : "text-fg-muted",
											)}
										>
											{t`Current`}
										</span>
									) : null}
									{isActivationDisabled ? (
										<span className="text-2xs font-medium uppercase text-warning">{t`Unavailable`}</span>
									) : null}
									{isSelected && !mobileLayout ? <CheckIcon className="size-3.5 shrink-0 text-brand" /> : null}
								</span>
								<span
									className={cn(
										"mt-2 block text-xs leading-relaxed",
										mobileLayout ? "text-trading-panel-muted" : "text-fg-muted",
									)}
								>
									{option.description}
								</span>
							</button>
						);
					})}
				</div>

				{!mobileLayout ? portfolioGuidance : null}
				{isModeUnavailable ? (
					<p className="text-xs text-error">
						<Trans>Unable to load the current account mode. Reconnect your wallet and try again.</Trans>
					</p>
				) : null}

				{submitError ? <p className="text-xs text-error">{submitError}</p> : null}
			</ModalContent>

			<ModalFooter className={cn(mobileLayout && "px-4 pt-0 pb-3")}>
				{!mobileLayout ? (
					<Button
						type="button"
						variant="ghost"
						intent="neutral"
						onClick={onClose}
						disabled={isBusy}
						className={cn(mobileLayout && "min-h-11 flex-1")}
					>
						<Trans>Cancel</Trans>
					</Button>
				) : null}
				<Button
					type="button"
					variant="filled"
					intent="brand"
					onClick={handleApply}
					disabled={canChange ? isBusy || isModeUnavailable || !isDirty : false}
					iconLeft={isUpdating ? <SpinnerGapIcon className="size-3 animate-spin" /> : undefined}
					className={cn(
						mobileLayout &&
							"min-h-11 w-full flex-1 bg-trading-panel-control text-trading-panel-on-control hover:opacity-90",
					)}
				>
					{!canChange ? (
						<Trans>Connect</Trans>
					) : isLoading ? (
						<Trans>Loading...</Trans>
					) : isUpdating ? (
						<Trans>Switching...</Trans>
					) : mobileLayout ? (
						<Trans>Confirm</Trans>
					) : isDirty && selectedModeLabel ? (
						<Trans>Switch to {selectedModeLabel}</Trans>
					) : (
						<Trans>Current</Trans>
					)}
				</Button>
			</ModalFooter>
			{mobileLayout ? (
				<div className="mx-4 mb-4 space-y-2 rounded-[10px] border border-trading-panel-error/30 bg-trading-panel-error-soft p-2.5 text-center">
					{portfolioGuidance}
				</div>
			) : null}
		</>
	);
}
