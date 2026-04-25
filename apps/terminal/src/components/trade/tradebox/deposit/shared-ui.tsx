import { Modal, ModalContent, ModalHeader, ModalPopup, ModalTitle, Select } from "@hypeterminal/ui";
import { Trans } from "@lingui/react/macro";
import {
	ArrowSquareOutIcon,
	CheckCircleIcon,
	SpinnerGapIcon,
	WalletIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { NETWORKS, type NetworkId } from "@/config/networks";
import { cn } from "@/lib/cn";
import { getExplorerTxUrl } from "@/lib/explorer";

interface NetworkSelectProps {
	label: React.ReactNode;
	value: NetworkId;
	onChange: (value: NetworkId) => void;
	disabled?: boolean;
}

export function NetworkSelect({ label, value, onChange, disabled }: NetworkSelectProps) {
	return (
		<Select
			label={label as string}
			value={value}
			onValueChange={(v) => v && onChange(v as NetworkId)}
			disabled={disabled}
			options={NETWORKS.map((n) => ({ value: n.id, label: n.name }))}
		/>
	);
}

interface StatusScreenProps {
	title: React.ReactNode;
	icon: "success" | "error" | "loading";
	heading: React.ReactNode;
	description?: React.ReactNode;
	txHash?: string;
	children?: React.ReactNode;
	onClose?: () => void;
	closable?: boolean;
}

export function StatusScreen({
	title,
	icon,
	heading,
	description,
	txHash,
	children,
	onClose,
	closable = true,
}: StatusScreenProps) {
	const explorerUrl = txHash ? getExplorerTxUrl(txHash) : null;

	return (
		<Modal open onOpenChange={closable ? onClose : undefined}>
			<ModalPopup size="sm" showClose={closable}>
				<ModalHeader>
					<ModalTitle>{title}</ModalTitle>
				</ModalHeader>
				<ModalContent>
					<div className="flex flex-col items-center gap-4 py-6">
						{icon === "loading" ? (
							<div className="relative">
								<div className="absolute inset-0 animate-ping rounded-full bg-brand-soft/20" />
								<div className="relative flex size-14 items-center justify-center rounded-full bg-brand-soft/10 border border-stroke-brand-strong/30">
									<SpinnerGapIcon className="size-7 animate-spin text-brand" />
								</div>
							</div>
						) : (
							<div
								className={cn(
									"flex size-14 items-center justify-center rounded-full border",
									icon === "success"
										? "bg-success-soft border-stroke-success-strong/30"
										: "bg-error-soft border-stroke-error-strong/30",
								)}
							>
								{icon === "success" ? (
									<CheckCircleIcon className="size-7 text-success" />
								) : (
									<WarningCircleIcon className="size-7 text-error" />
								)}
							</div>
						)}
						<div className="text-center space-y-1.5">
							<p className="text-sm font-medium">{heading}</p>
							{description && <p className="text-xs text-fg-muted">{description}</p>}
						</div>
						{explorerUrl && (
							<a
								href={explorerUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline"
							>
								<Trans>View on explorer</Trans>
								<ArrowSquareOutIcon className="size-3" aria-hidden="true" />
							</a>
						)}
						{children && <div className="w-full pt-2">{children}</div>}
					</div>
				</ModalContent>
			</ModalPopup>
		</Modal>
	);
}

export function WalletNotConnected() {
	return (
		<div className="flex flex-col items-center gap-4 py-8">
			<div className="flex size-12 items-center justify-center rounded-full bg-surface border border-stroke-weak/40">
				<WalletIcon className="size-6 text-fg" />
			</div>
			<div className="text-center space-y-1">
				<p className="text-sm font-medium">
					<Trans>Wallet not connected</Trans>
				</p>
				<p className="text-xs text-fg">
					<Trans>Connect your wallet to withdraw funds</Trans>
				</p>
			</div>
		</div>
	);
}
