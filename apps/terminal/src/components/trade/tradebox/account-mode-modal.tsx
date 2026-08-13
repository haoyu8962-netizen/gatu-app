import { Button, Modal, ModalContent, ModalFooter, ModalHeader, ModalPopup, ModalTitle } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { CheckIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { useLayoutEffect, useRef, useState } from "react";
import {
	type SelectableAccountAbstraction,
	toSelectableAccountAbstraction,
} from "@/hooks/trade/use-account-abstraction-control";
import type { AccountAbstraction } from "@/hooks/trade/use-account-balances";
import { cn } from "@/lib/cn";

export interface AccountModeFormProps {
	currentMode: AccountAbstraction;
	isLoading?: boolean;
	isUpdating?: boolean;
	canChange?: boolean;
	portfolioMarginActivationEnabled?: boolean;
	mobileLayout?: boolean;
	onConnect?: () => void;
	onClose: () => void;
	onApply: (mode: SelectableAccountAbstraction) => Promise<void>;
	onSubmissionLockChange?: (locked: boolean) => void;
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
	const [submissionLocked, setSubmissionLocked] = useState(false);
	const actionPending = !!formProps.isUpdating || submissionLocked;

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
				className="max-h-[min(90dvh,42rem)] font-market-close"
			>
				<ModalHeader>
					<ModalTitle>
						<Trans>Account type</Trans>
					</ModalTitle>
				</ModalHeader>
				<AccountModeForm
					key={`${open}:${formProps.currentMode ?? "unavailable"}`}
					{...formProps}
					isUpdating={actionPending}
					onClose={() => handleOpenChange(false)}
					onSubmissionLockChange={setSubmissionLocked}
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
	onSubmissionLockChange,
}: AccountModeFormProps) {
	const { t } = useLingui();
	const [selectedMode, setSelectedMode] = useState<SelectableAccountAbstraction | null>(() =>
		toSelectableAccountAbstraction(currentMode),
	);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const applyInFlightRef = useRef(false);
	const mountedRef = useRef(false);

	useLayoutEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);
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
	const isDirty = selectedMode !== null && selectedMode !== currentMode;
	const isBusy = !!isLoading || !!isUpdating;
	const isModeUnavailable = !!canChange && !isLoading && currentMode === null;
	const requiresExplicitSelection =
		currentMode === "default" || currentMode === "dexAbstraction" || currentMode === "unknown";
	const portfolioGuidance = (
		<>
			<p className="text-2xs leading-relaxed text-trading-panel-muted">
				<Trans>
					Hyperliquid labels portfolio margin as pre-alpha and recommends testing with new accounts or subaccounts
					holding less than $1,000.
				</Trans>
			</p>
			{!portfolioMarginActivationEnabled && currentMode !== "portfolioMargin" ? (
				<p className="text-xs text-trading-panel-error">
					<Trans>
						New portfolio margin activation is temporarily unavailable. Existing portfolio margin accounts are not
						affected and can switch away.
					</Trans>
				</p>
			) : null}
		</>
	);

	async function handleApply() {
		if (applyInFlightRef.current) return;
		if (!canChange) {
			onClose();
			onConnect?.();
			return;
		}
		if (!selectedMode || !isDirty || isBusy || isModeUnavailable) return;

		applyInFlightRef.current = true;
		onSubmissionLockChange?.(true);
		setSubmitError(null);
		try {
			await onApply(selectedMode);
			applyInFlightRef.current = false;
			onSubmissionLockChange?.(false);
			if (mountedRef.current) onClose();
		} catch (error) {
			applyInFlightRef.current = false;
			onSubmissionLockChange?.(false);
			if (mountedRef.current) {
				setSubmitError(error instanceof Error && error.message ? error.message : t`Failed to update account mode`);
			}
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
									"min-h-11 w-full rounded-12 border px-3.5 py-3 text-left transition-colors",
									"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
									isSelected
										? "border-[1.5px] border-trading-panel-control bg-trading-panel-card text-trading-panel-fg"
										: "border-trading-panel-stroke-card bg-modal text-trading-panel-fg enabled:hover:border-trading-panel-control enabled:hover:bg-trading-panel-hover",
									isOptionDisabled && "cursor-not-allowed opacity-70",
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
									<span className="min-w-0 flex-1 text-2sm font-semibold">
										{option.label}
										{option.badge ? (
											<span className="ml-1 text-2xs font-medium text-trading-panel-muted">({option.badge})</span>
										) : null}
									</span>
									{isCurrent ? (
										<span className="text-2xs font-medium uppercase text-trading-panel-subtle">{t`Current`}</span>
									) : null}
									{isActivationDisabled ? (
										<span className="text-2xs font-medium uppercase text-warning">{t`Unavailable`}</span>
									) : null}
								</span>
								<span className="mt-2 block text-xs leading-relaxed text-trading-panel-muted">
									{option.description}
								</span>
							</button>
						);
					})}
				</div>

				{isModeUnavailable ? (
					<p className="text-xs text-error">
						<Trans>Unable to load the current account mode. Reconnect your wallet and try again.</Trans>
					</p>
				) : null}
				{requiresExplicitSelection ? (
					<p className="text-xs text-warning">
						<Trans>Select a supported account mode before using balances or moving funds.</Trans>
					</p>
				) : null}

				{submitError ? <p className="text-xs text-error">{submitError}</p> : null}
			</ModalContent>

			<ModalFooter className={cn(mobileLayout && "px-4 pt-0 pb-3")}>
				<Button
					type="button"
					variant="filled"
					intent="neutral"
					onClick={handleApply}
					disabled={canChange ? isBusy || isModeUnavailable || !isDirty : false}
					iconLeft={isUpdating ? <SpinnerGapIcon className="size-3 animate-spin" /> : undefined}
					className="min-h-11 w-full flex-1 rounded-[10px] bg-trading-panel-control font-bold text-trading-panel-on-control shadow-none hover:opacity-90"
				>
					{!canChange ? (
						<Trans>Connect</Trans>
					) : isLoading ? (
						<Trans>Loading...</Trans>
					) : isUpdating ? (
						<Trans>Switching...</Trans>
					) : (
						<Trans>Confirm</Trans>
					)}
				</Button>
			</ModalFooter>
			<div
				className={cn(
					"space-y-2 rounded-[10px] border border-trading-panel-error/30 bg-trading-panel-error-soft p-2.5 text-center",
					mobileLayout ? "mx-4 mb-4" : "mx-5 mb-5",
				)}
			>
				{portfolioGuidance}
			</div>
		</>
	);
}
