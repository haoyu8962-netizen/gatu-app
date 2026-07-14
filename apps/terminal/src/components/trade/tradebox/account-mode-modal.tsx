import { Button, Modal, ModalContent, ModalFooter, ModalHeader, ModalPopup, ModalTitle } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { CheckIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { SelectableAccountAbstraction } from "@/hooks/trade/use-account-abstraction-control";
import { cn } from "@/lib/cn";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentMode: SelectableAccountAbstraction | null;
	isLoading?: boolean;
	isUpdating?: boolean;
	canChange?: boolean;
	onConnect?: () => void;
	onApply: (mode: SelectableAccountAbstraction) => Promise<void>;
}

interface AccountModeOption {
	id: SelectableAccountAbstraction;
	label: string;
	badge?: string;
	description: string;
}

export function AccountModeModal({
	open,
	onOpenChange,
	currentMode,
	isLoading,
	isUpdating,
	canChange,
	onConnect,
	onApply,
}: Props) {
	const { t } = useLingui();
	const [selectedMode, setSelectedMode] = useState<SelectableAccountAbstraction>(currentMode ?? "unifiedAccount");
	const [submitError, setSubmitError] = useState<string | null>(null);
	const accountModeOptions: AccountModeOption[] = [
		{
			id: "unifiedAccount",
			label: t`Unified account`,
			badge: t`Recommended`,
			description: t`Default account setting. Each collateral asset has a single balance. Perps can only use the settlement asset as collateral, and cross margin is shared between cross positions that use the same collateral asset.`,
		},
		{
			id: "portfolioMargin",
			label: t`Portfolio margin`,
			description: t`For advanced users who want higher flexibility and capital efficiency. Spot and perps trading are fully unified, and eligible collateral assets such as HYPE and BTC can be used directly as perp collateral without converting to the settlement asset.`,
		},
		{
			id: "disabled",
			label: t`Manual`,
			description: t`Recommended only for automated traders. Every DEX has a separate balance, and cross margin applies separately within each DEX.`,
		},
	];
	const selectedModeLabel =
		accountModeOptions.find((option) => option.id === selectedMode)?.label ?? t`Unified account`;

	useEffect(() => {
		if (open) {
			setSelectedMode(currentMode ?? "unifiedAccount");
			setSubmitError(null);
		}
	}, [currentMode, open]);

	const isDirty = selectedMode !== currentMode;
	const isBusy = !!isLoading || !!isUpdating;

	async function handleApply() {
		if (!canChange) {
			onOpenChange(false);
			onConnect?.();
			return;
		}
		if (!isDirty || isBusy) return;

		setSubmitError(null);
		try {
			await onApply(selectedMode);
			onOpenChange(false);
		} catch (error) {
			setSubmitError(error instanceof Error && error.message ? error.message : t`Failed to update account mode`);
		}
	}

	return (
		<Modal open={open} onOpenChange={onOpenChange}>
			<ModalPopup size="sm" className="max-h-[min(90dvh,42rem)]">
				<ModalHeader>
					<ModalTitle>
						<Trans>Account type</Trans>
					</ModalTitle>
				</ModalHeader>

				<ModalContent className="space-y-3 overflow-y-auto">
					<div className="space-y-2">
						{accountModeOptions.map((option) => {
							const isSelected = selectedMode === option.id;
							const isCurrent = currentMode === option.id;

							return (
								<button
									key={option.id}
									type="button"
									onClick={() => setSelectedMode(option.id)}
									disabled={isBusy}
									aria-pressed={isSelected}
									className={cn(
										"w-full rounded-xs border px-3 py-3 text-left transition-colors",
										"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
										isSelected
											? "border-brand bg-brand/10 text-fg"
											: "border-stroke-weak bg-fill-weak/40 text-fg hover:bg-fill-hover",
										isBusy && "cursor-not-allowed opacity-70",
									)}
								>
									<span className="flex min-w-0 items-center gap-2">
										<span className="min-w-0 flex-1 text-sm font-semibold">
											{option.label}
											{option.badge && <span className="ml-1 text-2xs font-medium text-brand">({option.badge})</span>}
										</span>
										{isCurrent && <span className="text-2xs font-medium uppercase text-fg-muted">{t`Current`}</span>}
										{isSelected && <CheckIcon className="size-3.5 shrink-0 text-brand" />}
									</span>
									<span className="mt-2 block text-xs leading-relaxed text-fg-muted">{option.description}</span>
								</button>
							);
						})}
					</div>

					<p className="text-2xs leading-relaxed text-fg-muted">
						<Trans>Account value must be below $25M to use portfolio margin while it is in beta.</Trans>
					</p>

					{submitError && <p className="text-xs text-error">{submitError}</p>}
				</ModalContent>

				<ModalFooter>
					<Button type="button" variant="ghost" intent="neutral" onClick={() => onOpenChange(false)} disabled={isBusy}>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						type="button"
						variant="filled"
						intent="brand"
						onClick={handleApply}
						disabled={canChange ? isBusy || !isDirty : false}
						iconLeft={isUpdating ? <SpinnerGapIcon className="size-3 animate-spin" /> : undefined}
					>
						{!canChange ? (
							<Trans>Connect</Trans>
						) : isUpdating ? (
							<Trans>Switching...</Trans>
						) : isDirty ? (
							<Trans>Switch to {selectedModeLabel}</Trans>
						) : (
							<Trans>Current</Trans>
						)}
					</Button>
				</ModalFooter>
			</ModalPopup>
		</Modal>
	);
}
