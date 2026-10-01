import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowLeftIcon, DesktopIcon, DownloadSimpleIcon, EnvelopeSimpleIcon, WalletIcon } from "@phosphor-icons/react";
import { type LoginModalOptions, usePrivy } from "@privy-io/react-auth";
import { AdaptiveModal, Button, ModalContent, ModalDescription, ModalHeader, ModalTitle } from "@sairn/ui";
import { useEffect, useRef, useState } from "react";
import { ButtonLoading } from "@/components/brand/button-loading";
import { BRAND_NAME } from "@/config/brand";
import { MOBILE_PAIRING_FEATURES } from "@/config/mobile-pairing";
import { useIsMobileQrSurface } from "@/hooks/use-mobile";
import { useReconnectWallet } from "@/hooks/wallet/use-wallet-session";
import { usePwaInstall } from "@/providers/pwa-install";
import { MobileAgentQrScanner } from "./mobile-agent-qr-scanner";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const MOBILE_CONNECT_BUTTON_CLASS = "h-13 w-full justify-start bg-fill-weak px-4 text-base font-medium shadow-none";

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
			login={login}
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
	login,
	onOpenChange,
}: Props & {
	ready: boolean;
	authenticated: boolean;
	login: (options?: LoginModalOptions) => void;
}) {
	const { t } = useLingui();
	const [view, setView] = useState<"choice" | "pwa" | "scanner">("choice");
	const [isInstalling, setIsInstalling] = useState(false);
	const { reconnectWallet, walletsReady, isReconnecting } = useReconnectWallet();
	const { capability: pwaCapability, promptInstall } = usePwaInstall();
	const canOfferPwa = pwaCapability === "browser-prompt" || pwaCapability === "ios-instructions";

	function handleReconnectWallet() {
		if (!ready || !walletsReady || isReconnecting) return;
		onOpenChange(false);
		void reconnectWallet();
	}

	function handleEmailLogin() {
		if (!ready || authenticated) return;
		onOpenChange(false);
		login({ loginMethods: ["email"] });
	}

	function handleWalletLogin() {
		if (!ready || authenticated) return;
		onOpenChange(false);
		login({ loginMethods: ["wallet"], walletChainType: "ethereum-only" });
	}

	async function handleInstallApp() {
		if (pwaCapability !== "browser-prompt" || isInstalling) return;
		setIsInstalling(true);
		await promptInstall();
		setIsInstalling(false);
		onOpenChange(false);
	}

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={onOpenChange}
			presentation="drawer"
			size="sm"
			closeLabel={t`Close`}
			showHandle={false}
			className="max-h-[calc(100dvh-1rem)] overflow-y-auto"
		>
			<ModalHeader divider={view !== "choice"} className={view === "choice" ? "px-4 pt-5 pb-2" : undefined}>
				<ModalTitle className={view === "choice" ? "text-xl" : undefined}>
					{view === "choice" ? (
						<Trans>Connect</Trans>
					) : view === "scanner" ? (
						<Trans>Link Desktop Wallet</Trans>
					) : (
						<Trans>Install {BRAND_NAME}</Trans>
					)}
				</ModalTitle>
				<ModalDescription className={view === "choice" ? "sr-only" : undefined}>
					{view === "choice" ? (
						MOBILE_PAIRING_FEATURES.enabled ? (
							<Trans>Connect a wallet on this phone, or scan a desktop-approved trading key.</Trans>
						) : (
							<Trans>Connect a wallet on this phone to trade.</Trans>
						)
					) : view === "scanner" ? (
						<Trans>Only scan a QR displayed by this terminal on your desktop.</Trans>
					) : pwaCapability === "ios-instructions" ? (
						<Trans>
							On iPhone or iPad, open the Share menu, choose Add to Home Screen, then launch {BRAND_NAME} from your Home
							Screen.
						</Trans>
					) : (
						<Trans>Install this web app for a full-screen, app-like trading experience.</Trans>
					)}
				</ModalDescription>
			</ModalHeader>

			<ModalContent className={view === "choice" ? "space-y-3 px-3 pt-2 pb-4" : "space-y-3"}>
				{view === "choice" ? (
					<>
						{MOBILE_PAIRING_FEATURES.enabled && (
							<Button
								type="button"
								variant="ghost"
								intent="neutral"
								size="md"
								className={MOBILE_CONNECT_BUTTON_CLASS}
								onClick={() => setView("scanner")}
								iconLeft={<DesktopIcon className="size-5" aria-hidden />}
							>
								<Trans>Link Desktop Wallet</Trans>
							</Button>
						)}
						{authenticated ? (
							<Button
								type="button"
								variant="ghost"
								intent="neutral"
								size="md"
								className={MOBILE_CONNECT_BUTTON_CLASS}
								disabled={!ready || !walletsReady || isReconnecting}
								onClick={handleReconnectWallet}
								iconLeft={
									isReconnecting ? <ButtonLoading className="m-0.5" /> : <WalletIcon className="size-5" aria-hidden />
								}
							>
								{isReconnecting ? <Trans>Connecting...</Trans> : <Trans>Reconnect wallet</Trans>}
							</Button>
						) : (
							<>
								<Button
									type="button"
									variant="ghost"
									intent="neutral"
									size="md"
									className={MOBILE_CONNECT_BUTTON_CLASS}
									disabled={!ready}
									onClick={handleEmailLogin}
									iconLeft={<EnvelopeSimpleIcon className="size-5" aria-hidden />}
								>
									<Trans>Log in with Email</Trans>
								</Button>
								<div className="flex items-center gap-3 px-0.5 text-2xs text-fg-muted" aria-hidden="true">
									<span className="h-px flex-1 bg-stroke-weak" />
									<span>
										<Trans>OR</Trans>
									</span>
									<span className="h-px flex-1 bg-stroke-weak" />
								</div>
								<Button
									type="button"
									variant="ghost"
									intent="neutral"
									size="md"
									className={MOBILE_CONNECT_BUTTON_CLASS}
									disabled={!ready}
									onClick={handleWalletLogin}
									iconLeft={<WalletIcon className="size-5" aria-hidden />}
								>
									WalletConnect
								</Button>
							</>
						)}
						{canOfferPwa && (
							<Button
								type="button"
								variant="ghost"
								intent="brand"
								size="md"
								className="h-13 w-full bg-success-soft px-4 text-sm font-medium text-success shadow-none"
								onClick={() => setView("pwa")}
								iconLeft={<DownloadSimpleIcon className="size-5" aria-hidden />}
							>
								<span>
									<Trans>Prefer an app-like experience?</Trans>{" "}
									<span className="underline underline-offset-4">
										<Trans>Try the PWA.</Trans>
									</span>
								</span>
							</Button>
						)}
					</>
				) : view === "scanner" ? (
					<MobileAgentQrScanner onCancel={() => setView("choice")} />
				) : (
					<div className="space-y-3">
						{pwaCapability === "browser-prompt" && (
							<Button
								type="button"
								variant="filled"
								intent="brand"
								size="md"
								className="w-full"
								disabled={isInstalling}
								onClick={() => void handleInstallApp()}
								iconLeft={isInstalling ? <ButtonLoading /> : <DownloadSimpleIcon className="size-4" aria-hidden />}
							>
								<Trans>Install app</Trans>
							</Button>
						)}
						<Button
							type="button"
							variant="outline"
							intent="neutral"
							size="md"
							className="w-full"
							onClick={() => setView("choice")}
							iconLeft={<ArrowLeftIcon className="size-4 rtl:rotate-180" aria-hidden />}
						>
							<Trans>Back</Trans>
						</Button>
					</div>
				)}
			</ModalContent>
		</AdaptiveModal>
	);
}
