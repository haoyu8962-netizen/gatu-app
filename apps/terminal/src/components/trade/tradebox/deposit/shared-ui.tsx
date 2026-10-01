import { AdaptiveModal, Button, ModalContent, ModalHeader, ModalTitle } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import {
	ArrowSquareOutIcon,
	CheckCircleIcon,
	SpinnerGapIcon,
	WalletIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import type { Chain } from "viem";
import { cn } from "@/lib/cn";
import { getExplorerTxUrl } from "@/lib/explorer";

interface StatusScreenProps {
	open: boolean;
	title: React.ReactNode;
	icon: "success" | "error" | "loading";
	heading: React.ReactNode;
	description?: React.ReactNode;
	txHash?: string;
	txChain?: Chain;
	children?: React.ReactNode;
	onClose?: () => void;
	closable?: boolean;
	presentation?: "modal" | "drawer";
}

export function StatusScreen({
	open,
	title,
	icon,
	heading,
	description,
	txHash,
	txChain,
	children,
	onClose,
	closable = true,
	presentation = "modal",
}: StatusScreenProps) {
	const { t } = useLingui();
	const explorerUrl = txHash ? getExplorerTxUrl(txHash, txChain) : null;

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={onClose ?? (() => {})}
			presentation={presentation}
			size="sm"
			dismissible={closable}
			showClose={closable}
			closeLabel={t`Close`}
			showHandle={presentation === "drawer" && closable}
			handleClassName="top-2 h-1 w-9 bg-fill/30"
			className={presentation === "drawer" ? "max-h-[calc(100dvh-1rem)] overflow-y-auto !rounded-t-[18px]" : undefined}
		>
			<ModalHeader>
				<ModalTitle>{title}</ModalTitle>
			</ModalHeader>
			<ModalContent>
				<div className="flex flex-col items-center gap-4 py-6">
					<div
						role={icon === "error" ? "alert" : "status"}
						aria-atomic="true"
						className="flex flex-col items-center gap-4"
					>
						{icon === "loading" ? (
							<div className="relative">
								<div className="absolute inset-0 animate-ping rounded-full bg-signal-soft/20" />
								<div className="relative flex size-14 items-center justify-center rounded-full border border-stroke-signal/30 bg-signal-soft/10">
									<SpinnerGapIcon className="size-7 animate-spin text-fg-muted" />
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
						<div className="space-y-1.5 text-center">
							<p className="text-sm font-medium">{heading}</p>
							{description && <div className="text-xs text-fg-muted">{description}</div>}
						</div>
					</div>
					{explorerUrl && (
						<a
							href={explorerUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 text-xs text-signal hover:text-signal-hover hover:underline"
						>
							<Trans>View on explorer</Trans>
							<ArrowSquareOutIcon className="size-3" aria-hidden="true" />
						</a>
					)}
					{children && <div className="w-full pt-2">{children}</div>}
				</div>
			</ModalContent>
		</AdaptiveModal>
	);
}

interface WalletNotConnectedProps {
	onConnect?: () => void;
	isConnecting?: boolean;
}

export function WalletNotConnected({ onConnect, isConnecting = false }: WalletNotConnectedProps) {
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
					<Trans>Connect your wallet to manage funds</Trans>
				</p>
			</div>
			{onConnect ? (
				<Button onClick={onConnect} disabled={isConnecting} className="min-w-36">
					{isConnecting ? <SpinnerGapIcon className="size-4 animate-spin" /> : <WalletIcon className="size-4" />}
					<Trans>Reconnect wallet</Trans>
				</Button>
			) : null}
		</div>
	);
}
