import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { CheckIcon } from "@phosphor-icons/react";
import { Button, Modal, ModalContent, ModalFooter, ModalHeader, ModalPopup, ModalTitle } from "@sairn/ui";
import { useRef, useState } from "react";
import {
	type SelectableAccountAbstraction,
	toSelectableAccountAbstraction,
} from "@/hooks/trade/use-account-abstraction-control";
import type { AccountAbstraction } from "@/hooks/trade/use-account-balances";
import { useAccountModeLabels } from "@/hooks/trade/use-account-mode-labels";
import { cn } from "@/lib/cn";
import { classifyActionError, isAmbiguousExchangeActionError } from "@/lib/errors/action-error";
import { useHyperliquid } from "@/lib/hyperliquid";
import { addOrderQueueItem, updateOrderQueueItem } from "@/stores/use-order-queue-store";

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
	const { t } = useLingui();

	return (
		<Modal open={open} onOpenChange={onOpenChange}>
			<ModalPopup
				size="sm"
				showClose
				closeLabel={t`Close`}
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
					isUpdating={!!formProps.isUpdating || !open}
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
	const { clientKey, env } = useHyperliquid();
	const modes = useAccountModeLabels();
	const [selectedMode, setSelectedMode] = useState<SelectableAccountAbstraction | null>(() =>
		toSelectableAccountAbstraction(currentMode),
	);
	const applyInFlightRef = useRef(false);
	const accountModeOptions: AccountModeOption[] = [
		{
			id: "unifiedAccount",
			label: modes.unified.name,
			badge: t`Recommended`,
			description: t`Recommended account setting. Each collateral asset has a single balance. Perps can only use the settlement asset as collateral, and cross margin is shared between cross positions that use the same collateral asset.`,
		},
		{
			id: "portfolioMargin",
			label: modes.portfolio.name,
			description: t`For advanced users who want higher flexibility and capital efficiency. Spot and perps trading are fully unified, and eligible collateral assets such as HYPE and BTC can be used directly as perp collateral without converting to the settlement asset.`,
		},
		{
			id: "disabled",
			label: modes.manual.name,
			description: t`Recommended only for automated traders. Every DEX has a separate balance, and cross margin applies separately within each DEX.`,
		},
	];
	const isDirty = selectedMode !== null && selectedMode !== currentMode;
	const isBusy = !!isLoading || !!isUpdating;
	const isModeUnavailable = !!canChange && !isLoading && currentMode === null;
	const requiresExplicitSelection = currentMode === "default" || currentMode === "dexAbstraction";
	async function handleApply() {
		if (applyInFlightRef.current) return;
		if (!canChange) {
			onClose();
			onConnect?.();
			return;
		}
		if (!selectedMode || !isDirty || isBusy || isModeUnavailable) return;

		applyInFlightRef.current = true;
		const notificationId = addOrderQueueItem({ owner: clientKey, env, title: msg`Account type`, status: "pending" });
		onClose();
		try {
			await onApply(selectedMode);
			updateOrderQueueItem(notificationId, { status: "success", message: getAccountModeAppliedMessage(selectedMode) });
		} catch (error) {
			const unknown = isAmbiguousExchangeActionError(error);
			updateOrderQueueItem(notificationId, {
				status: unknown ? "unconfirmed" : "failed",
				error: unknown ? undefined : classifyActionError(error),
				message: unknown ? msg`Update not confirmed. Check account settings before retrying.` : msg`Update failed`,
			});
		} finally {
			applyInFlightRef.current = false;
		}
	}

	return (
		<>
			<ModalContent aria-busy={isBusy} className={cn("space-y-3 overflow-y-auto", mobileLayout && "px-4 pt-3 pb-3")}>
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
									"min-h-11 w-full rounded-12 border px-3.5 py-3 text-start transition-colors",
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
											<span className="ms-1 text-2xs font-medium text-trading-panel-muted">({option.badge})</span>
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

				{requiresExplicitSelection ? (
					<p className="text-xs text-warning">
						<Trans>Select a supported account mode before using balances or moving funds.</Trans>
					</p>
				) : null}
			</ModalContent>

			<ModalFooter className={cn(mobileLayout && "px-4 pt-0 pb-3")}>
				<Button
					type="button"
					variant="filled"
					intent="neutral"
					onClick={handleApply}
					disabled={canChange ? isBusy || isModeUnavailable || !isDirty : false}
					className="min-h-11 w-full flex-1 rounded-[10px] bg-trading-panel-control font-bold text-trading-panel-on-control shadow-none hover:opacity-90"
				>
					{canChange ? <Trans>Confirm</Trans> : <Trans>Connect</Trans>}
				</Button>
			</ModalFooter>
			<div className={cn("space-y-2 text-xs text-trading-panel-muted", mobileLayout ? "mx-4 mb-4" : "mx-5 mb-5")}>
				{!portfolioMarginActivationEnabled && currentMode !== "portfolioMargin" ? (
					<p>
						<Trans>
							This terminal has not enabled new portfolio margin activation. Existing accounts can switch to another
							mode.
						</Trans>
					</p>
				) : null}
				<a
					href="https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-margin"
					target="_blank"
					rel="noreferrer"
					className="inline-block underline underline-offset-4"
				>
					<Trans>Portfolio margin eligibility and limits</Trans>
				</a>
			</div>
		</>
	);
}

function getAccountModeAppliedMessage(mode: SelectableAccountAbstraction): MessageDescriptor {
	if (mode === "unifiedAccount") return msg`Switched to Unified account`;
	if (mode === "portfolioMargin") return msg`Switched to Portfolio margin`;
	return msg`Switched to Manual`;
}
