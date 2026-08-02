import { AdaptiveModal, Button, ModalContent, ModalDescription, ModalHeader, ModalTitle } from "@gatu/ui";
import { Trans } from "@lingui/react/macro";
import { QrCodeIcon, SpinnerGapIcon, WalletIcon } from "@phosphor-icons/react";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";
import { MOBILE_PAIRING_FEATURES } from "@/config/mobile-pairing";
import { useIsMobileQrSurface } from "@/hooks/use-mobile";
import { useReconnectWallet } from "@/hooks/wallet/use-wallet-session";
import { MobileAgentQrScanner } from "./mobile-agent-qr-scanner";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function WalletModal({ open, onOpenChange }: Props) {
	const { ready, authenticated, login } = usePrivy();
	const isMobileQrSurface = useIsMobileQrSurface();

	if (!isMobileQrSurface) {
		return (
			<PrivyWalletLauncher
				open={open}
				ready={ready}
				authenticated={authenticated}
				login={login}
				onOpenChange={onOpenChange}
			/>
		);
	}

	return (
		<MobileWalletChooser
			key={open ? "open" : "closed"}
			open={open}
			ready={ready}
			authenticated={authenticated}
			onOpenChange={onOpenChange}
		/>
	);
}

function PrivyWalletLauncher({
	open,
	ready,
	authenticated,
	login,
	onOpenChange,
}: Props & {
	ready: boolean;
	authenticated: boolean;
	login: () => void;
}) {
	const launchedForOpenRef = useRef(false);
	const { reconnectWallet, walletsReady, isReconnecting } = useReconnectWallet();

	useEffect(() => {
		if (!open) {
			launchedForOpenRef.current = false;
			return;
		}
		if (!ready || launchedForOpenRef.current || (authenticated && (!walletsReady || isReconnecting))) {
			return;
		}
		launchedForOpenRef.current = true;
		onOpenChange(false);
		if (authenticated) {
			void reconnectWallet();
			return;
		}
		login();
	}, [open, ready, authenticated, login, onOpenChange, reconnectWallet, walletsReady, isReconnecting]);

	return null;
}

function MobileWalletChooser({
	open,
	ready,
	authenticated,
	onOpenChange,
}: Props & {
	ready: boolean;
	authenticated: boolean;
}) {
	const [view, setView] = useState<"choice" | "scanner">("choice");
	const { reconnectWallet, walletsReady, isReconnecting } = useReconnectWallet();

	function handleConnectWallet() {
		if (!ready || !walletsReady || isReconnecting) return;
		onOpenChange(false);
		void reconnectWallet();
	}

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={onOpenChange}
			presentation="drawer"
			size="sm"
			className="max-h-[calc(100dvh-1rem)] overflow-y-auto"
		>
			<ModalHeader>
				<ModalTitle>
					{view === "choice" ? <Trans>Connect to trade</Trans> : <Trans>Link Desktop Wallet</Trans>}
				</ModalTitle>
				<ModalDescription>
					{view === "choice" ? (
						MOBILE_PAIRING_FEATURES.importFromQr ? (
							<Trans>Connect a wallet on this phone, or scan a desktop-approved trading key.</Trans>
						) : (
							<Trans>Connect a wallet on this phone to trade.</Trans>
						)
					) : (
						<Trans>Only scan a QR displayed by this terminal on your desktop.</Trans>
					)}
				</ModalDescription>
			</ModalHeader>

			<ModalContent className="space-y-3">
				{view === "choice" ? (
					<>
						<Button
							type="button"
							variant="filled"
							intent="brand"
							size="md"
							className="w-full"
							disabled={!ready || !walletsReady || isReconnecting}
							onClick={handleConnectWallet}
							iconLeft={
								isReconnecting ? (
									<SpinnerGapIcon className="size-4 animate-spin" aria-hidden />
								) : (
									<WalletIcon className="size-4" aria-hidden />
								)
							}
						>
							{isReconnecting ? (
								<Trans>Connecting...</Trans>
							) : authenticated ? (
								<Trans>Reconnect wallet</Trans>
							) : (
								<Trans>Connect wallet</Trans>
							)}
						</Button>
						{MOBILE_PAIRING_FEATURES.importFromQr && (
							<Button
								type="button"
								variant="outline"
								intent="neutral"
								size="md"
								className="w-full"
								onClick={() => setView("scanner")}
								iconLeft={<QrCodeIcon className="size-4" aria-hidden />}
							>
								<Trans>Link Desktop Wallet</Trans>
							</Button>
						)}
						{MOBILE_PAIRING_FEATURES.importFromQr && (
							<p className="text-xs text-fg-muted">
								<Trans>
									Desktop linking imports an approved trading key. It cannot withdraw funds or change account
									permissions.
								</Trans>
							</p>
						)}
					</>
				) : (
					<MobileAgentQrScanner onCancel={() => setView("choice")} />
				)}
			</ModalContent>
		</AdaptiveModal>
	);
}
