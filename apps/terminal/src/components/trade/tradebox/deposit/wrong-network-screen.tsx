import { Trans, useLingui } from "@lingui/react/macro";
import { CaretLeftIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { AdaptiveModal, Button, ButtonIcon, ModalContent, ModalHeader, ModalTitle } from "@sairn/ui";
import { ButtonLoading } from "@/components/brand/button-loading";
import { formatTransferError } from "@/lib/errors/format";

interface Props {
	open: boolean;
	onClose: () => void;
	onBack?: () => void;
	onSwitch: () => void;
	isSwitching: boolean;
	error?: Error | null;
	presentation?: "modal" | "drawer";
}

export function WrongNetworkScreen({
	open,
	onClose,
	onBack,
	onSwitch,
	isSwitching,
	error,
	presentation = "modal",
}: Props) {
	const { t } = useLingui();

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={onClose}
			presentation={presentation}
			size="sm"
			closeLabel={t`Close`}
			showHandle={presentation === "drawer"}
			handleClassName="top-2 h-1 w-9 bg-fill/30"
			className={presentation === "drawer" ? "max-h-[calc(100dvh-1rem)] overflow-y-auto !rounded-t-[18px]" : undefined}
		>
			<ModalHeader className={onBack ? "flex-row items-center gap-2" : undefined}>
				{onBack ? (
					<ButtonIcon
						type="button"
						variant="ghost"
						intent="neutral"
						size="sm"
						onClick={onBack}
						disabled={isSwitching}
						aria-label={t`Back`}
						className="-ml-1 rounded-16 hover:bg-transparent not-data-disabled:hover:bg-fill-hover"
					>
						<CaretLeftIcon className="size-4 rtl:rotate-180" aria-hidden="true" />
					</ButtonIcon>
				) : null}
				<ModalTitle>
					<Trans>Deposit</Trans>
				</ModalTitle>
			</ModalHeader>
			<ModalContent className="space-y-4">
				<div className="flex items-start gap-3 rounded-8 border border-stroke-warning-strong/20 bg-warning-soft/10 p-4">
					<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warning-soft/20">
						<WarningCircleIcon className="size-4 text-warning" />
					</div>
					<div className="space-y-1">
						<p className="text-sm font-medium">
							<Trans>Switch to Arbitrum</Trans>
						</p>
						<p className="text-xs text-fg">
							<Trans>Switch to Arbitrum to deposit USDC to Hyperliquid</Trans>
						</p>
					</div>
				</div>
				{error && (
					<p role="alert" className="px-1 text-xs text-error">
						{formatTransferError(
							error,
							(descriptor) => t(descriptor),
							t`Unable to switch wallet to Arbitrum. Switch networks in your wallet and retry.`,
						)}
					</p>
				)}
				<Button variant="filled" intent="neutral" onClick={onSwitch} disabled={isSwitching} className="w-full">
					{isSwitching ? (
						<>
							<ButtonLoading />
							<Trans>Switching...</Trans>
						</>
					) : (
						<Trans>Switch to Arbitrum</Trans>
					)}
				</Button>
			</ModalContent>
		</AdaptiveModal>
	);
}
