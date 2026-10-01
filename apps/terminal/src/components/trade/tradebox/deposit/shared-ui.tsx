import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowSquareOutIcon, WalletIcon } from "@phosphor-icons/react";
import { AdaptiveModal, Button, ModalContent, ModalHeader, ModalTitle } from "@sairn/ui";
import type { Chain } from "viem";
import { BrandMotion } from "@/components/brand/brand-motion";
import { ButtonLoading } from "@/components/brand/button-loading";
import {
	BRAND_MOTION_AWAITING_RESULT,
	BRAND_MOTION_ERROR,
	BRAND_MOTION_SUCCESS,
	BRAND_MOTION_WALLET_AWAITING,
} from "@/lib/brand/brand-motion.gen";
import { getExplorerTxUrl } from "@/lib/explorer";

const STATUS_SCREEN_MOTIONS = {
	wallet: BRAND_MOTION_WALLET_AWAITING,
	awaiting: BRAND_MOTION_AWAITING_RESULT,
	success: BRAND_MOTION_SUCCESS,
	error: BRAND_MOTION_ERROR,
} as const;

interface StatusScreenProps {
	open: boolean;
	title: React.ReactNode;
	icon: keyof typeof STATUS_SCREEN_MOTIONS;
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
						<BrandMotion key={icon} motion={STATUS_SCREEN_MOTIONS[icon]} size={64} />
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
					{isConnecting ? <ButtonLoading /> : <WalletIcon className="size-4" />}
					<Trans>Reconnect wallet</Trans>
				</Button>
			) : null}
		</div>
	);
}
