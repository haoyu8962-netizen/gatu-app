import { Button, Dropdown } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import {
	ArrowClockwiseIcon,
	CheckIcon,
	CopyIcon,
	DeviceMobileIcon,
	SignOutIcon,
	SpinnerGapIcon,
	WalletIcon,
} from "@phosphor-icons/react";
import { Suspense, useState } from "react";
import { useEnsName } from "wagmi";
import { DESKTOP_NAV_LABELS } from "@/config/desktop-nav";
import { APP_BAR_BUTTON_HEIGHT_CLASS } from "@/config/layout";
import { useCopyToClipboard } from "@/hooks/ui/use-copy-to-clipboard";
import { useIsMobile, useIsMobileQrSurface } from "@/hooks/use-mobile";
import { useEmailWalletExport } from "@/hooks/wallet/use-email-wallet-export";
import { useWalletInitializationRecovery } from "@/hooks/wallet/use-wallet-initialization-recovery";
import { useDisconnectWallet, useReconnectWallet, useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { shortenAddress } from "@/lib/format";
import { createLazyComponent } from "@/lib/lazy";
import { hasPersistedPrivySession } from "@/lib/wallet/privy-session-hint";
import { getPrivyEmailAddress } from "@/lib/wallet/privy-wagmi";
import { MobileWalletCtaView } from "../mobile/mobile-wallet-cta-view";
import { UserMenuModalErrorBoundary, UserMenuModalLoadingFallback } from "./user-menu-modal-boundary";
import { loadUserMenuModalModule } from "./user-menu-modal-load";
import { USER_MENU_BUTTON_MIN_WIDTH, WalletCtaView } from "./wallet-cta-view";

// Keep successful loads across UserMenu remounts; replace only a wrapper that cached a tagged import failure.
let MobileAgentSyncModal = createLazyComponent(
	() => loadUserMenuModalModule(() => import("../components/mobile-agent-sync-modal")),
	"MobileAgentSyncModal",
);
let WalletModal = createLazyComponent(
	() => loadUserMenuModalModule(() => import("../components/wallet-modal")),
	"WalletModal",
);
let shouldKeepMobileSyncModalMounted = false;

const USER_MENU_LABEL_MAX_WIDTH = "max-w-[11rem]";

interface Props {
	variant?: "default" | "desktop-nav";
}

export function UserMenu({ variant = "default" }: Props) {
	const { t } = useLingui();
	const walletExport = useEmailWalletExport();
	const {
		authenticationReady,
		walletDirectoryReady,
		authenticated,
		isConnected,
		isConnecting,
		isReconnecting: isWalletReconnecting,
		displayAddress,
		sessionMode,
		hasWalletAccess,
		user,
	} = useWalletSession();
	const { disconnectWallet, isDisconnecting } = useDisconnectWallet();
	const { reconnectWallet, isReconnecting } = useReconnectWallet();
	const emailAddress = authenticationReady && authenticated ? getPrivyEmailAddress(user) : undefined;
	const { data: ensName } = useEnsName({ address: emailAddress ? undefined : displayAddress });
	const [mobileSyncOpen, setMobileSyncOpen] = useState(false);
	const [hasOpenedMobileSync, setHasOpenedMobileSync] = useState(() => shouldKeepMobileSyncModalMounted);
	const [mobileSyncLoadAttempt, setMobileSyncLoadAttempt] = useState(0);
	const [walletModalOpen, setWalletModalOpen] = useState(false);
	const [walletModalLoadAttempt, setWalletModalLoadAttempt] = useState(0);
	const [sessionHint] = useState(() => hasPersistedPrivySession());
	const { copied, copy } = useCopyToClipboard();
	const isMobile = useIsMobile();
	const isMobileQrSurface = useIsMobileQrSurface();
	const isDesktopNav = variant === "desktop-nav";

	const initializationScope =
		sessionMode === "agent-only"
			? null
			: !authenticationReady
				? "authentication"
				: authenticated && !walletDirectoryReady
					? `wallets:${user?.id ?? ""}`
					: null;
	const recoveryAvailable = useWalletInitializationRecovery(initializationScope);
	const reconnectDisabled = !walletDirectoryReady || isConnecting || isWalletReconnecting || isReconnecting;
	const disconnectDisabled = initializationScope !== null || isDisconnecting;

	function handleReloadPage() {
		window.location.reload();
	}

	function handleWalletModalErrorOpenChange(open: boolean) {
		setWalletModalOpen(open);
		if (!open) resetWalletModalLoad();
	}

	function handleMobileSyncErrorOpenChange(open: boolean) {
		setMobileSyncOpen(open);
		if (!open) resetMobileSyncLoad();
	}

	function resetWalletModalLoad() {
		WalletModal = createLazyComponent(
			() => loadUserMenuModalModule(() => import("../components/wallet-modal")),
			"WalletModal",
		);
		setWalletModalLoadAttempt((attempt) => attempt + 1);
	}

	function resetMobileSyncLoad() {
		MobileAgentSyncModal = createLazyComponent(
			() => loadUserMenuModalModule(() => import("../components/mobile-agent-sync-modal")),
			"MobileAgentSyncModal",
		);
		setMobileSyncLoadAttempt((attempt) => attempt + 1);
	}

	const awaitsStoredSession =
		!authenticationReady && sessionMode !== "agent-only" && (sessionHint || recoveryAvailable);

	if (awaitsStoredSession) {
		return (
			<Button
				variant={isDesktopNav ? "filled" : "outline"}
				intent="neutral"
				size="sm"
				className={cn(
					APP_BAR_BUTTON_HEIGHT_CLASS,
					isDesktopNav && USER_MENU_BUTTON_MIN_WIDTH,
					isDesktopNav ? "shrink-0" : "min-w-0 max-w-full",
					"px-3 transition-[color,background-color,border-color] duration-150 ease-out",
					isDesktopNav &&
						"h-[34px] min-h-[34px] rounded-[10px] border-market-close-control bg-market-close-control px-4 font-market-close text-[13px] leading-[18px] font-bold text-market-close-on-control shadow-none",
				)}
				disabled={!recoveryAvailable}
				onClick={handleReloadPage}
			>
				{recoveryAvailable ? (
					<ArrowClockwiseIcon className="size-3.5" />
				) : (
					<SpinnerGapIcon className="size-3.5 animate-spin" />
				)}
				<span className={cn(!isDesktopNav && "min-w-0 truncate")}>
					{recoveryAvailable ? <Trans>Reload page</Trans> : <Trans>Connecting...</Trans>}
				</span>
			</Button>
		);
	}

	if (!authenticated && !isConnected) {
		return (
			<>
				{isDesktopNav ? (
					<WalletCtaView
						label={t(DESKTOP_NAV_LABELS.wallet)}
						onClick={() => setWalletModalOpen(true)}
						onFocus={() => void WalletModal.preload?.()}
						onPointerEnter={() => void WalletModal.preload?.()}
					/>
				) : (
					<MobileWalletCtaView
						label={t`Connect`}
						onClick={() => setWalletModalOpen(true)}
						onFocus={() => void WalletModal.preload?.()}
						onPointerEnter={() => void WalletModal.preload?.()}
					/>
				)}
				{walletModalOpen && (
					<UserMenuModalErrorBoundary
						key={walletModalLoadAttempt}
						onOpenChange={handleWalletModalErrorOpenChange}
						onRetry={resetWalletModalLoad}
						open
						presentation={isMobileQrSurface ? "drawer" : "modal"}
					>
						<Suspense
							fallback={
								<UserMenuModalLoadingFallback
									onOpenChange={setWalletModalOpen}
									open
									presentation={isMobileQrSurface ? "drawer" : "modal"}
								/>
							}
						>
							<WalletModal open onOpenChange={setWalletModalOpen} />
						</Suspense>
					</UserMenuModalErrorBoundary>
				)}
			</>
		);
	}

	const displayLabel = emailAddress ?? ensName ?? (displayAddress ? shortenAddress(displayAddress) : t`Account`);
	const compactDisplayLabel =
		emailAddress ?? ensName ?? (displayAddress ? shortenAddress(displayAddress) : displayLabel);

	const actionItems = [
		...(walletExport.visible
			? [
					{
						label: t`Export email wallet`,
						icon: <WalletIcon className="size-3.5" />,
						disabled: !walletExport.canExport,
						onSelect: () => {
							void walletExport.exportEmailWallet();
						},
					},
				]
			: []),
		...(authenticated && sessionMode !== "agent-only" && !hasWalletAccess
			? [
					{
						label: t`Reconnect wallet`,
						icon: <WalletIcon className="size-3.5" />,
						disabled: reconnectDisabled,
						onSelect: () => {
							if (!reconnectDisabled) void reconnectWallet();
						},
					},
				]
			: []),
		...(recoveryAvailable
			? [{ label: t`Reload page`, icon: <ArrowClockwiseIcon className="size-3.5" />, onSelect: handleReloadPage }]
			: []),
		...(displayAddress
			? [
					{
						label: copied ? t`Copied!` : t`Copy Address`,
						icon: copied ? (
							<CheckIcon className="size-3.5 animate-in zoom-in-50 fade-in-0 duration-150 ease-out" />
						) : (
							<CopyIcon className="size-3.5" />
						),
						onSelect: () => copy(displayAddress),
					},
				]
			: []),
		...(hasWalletAccess
			? [
					{
						label: t`Link mobile device`,
						icon: <DeviceMobileIcon className="size-3.5" />,
						onSelect: () => {
							shouldKeepMobileSyncModalMounted = true;
							setHasOpenedMobileSync(true);
							setMobileSyncOpen(true);
						},
					},
				]
			: []),
	];

	return (
		<>
			<Dropdown
				align="end"
				size="sm"
				triggerVariant="minimal"
				className={cn("flex items-center", isDesktopNav ? "shrink-0" : "min-w-0 max-w-full")}
				triggerClassName={cn(
					APP_BAR_BUTTON_HEIGHT_CLASS,
					"max-h-8 !rounded-8 border border-stroke-weak bg-transparent px-3 shadow-raised",
					"!py-0 text-xs gap-1.5",
					"items-center justify-start font-semibold text-fg",
					"hover:bg-fill-hover active:bg-fill-press",
					"data-[popup-open]:border-stroke-action/40 data-[popup-open]:bg-fill-hover",
					"transition-[color,background-color,border-color] duration-150 ease-out",
					isDesktopNav ? "shrink-0" : "min-w-0 max-w-full",
					isDesktopNav &&
						"h-[34px] min-h-[34px] max-h-[34px] !rounded-[10px] border-market-close-stroke-input px-3 font-market-close text-[13px] leading-[18px] shadow-none hover:border-market-close-fg hover:bg-market-close-hover data-[popup-open]:border-market-close-fg data-[popup-open]:bg-transparent [&>svg]:size-[10px]",
				)}
				popupClassName={cn(
					isDesktopNav &&
						"min-w-[268px] rounded-[12px] border-market-close-stroke-card bg-overlay p-1 font-market-close shadow-overlay [&_[role=menuitem]]:rounded-[7px] [&_[role=menuitem]]:px-3 [&_[role=menuitem]]:py-[9px] [&_[role=menuitem]]:text-[13px] [&_[role=menuitem]]:leading-[18px]",
				)}
				triggerAriaLabel={t`Account and wallet`}
				trigger={
					<>
						<span
							className={cn(
								"size-1.5 shrink-0 rounded-full",
								isDesktopNav && "size-[7px]",
								isConnected ? (isDesktopNav ? "bg-market-close-success" : "bg-success") : "bg-fg-muted",
							)}
							aria-hidden
						/>
						<span
							className={cn(
								"min-w-0 truncate font-mono text-xs text-fg",
								USER_MENU_LABEL_MAX_WIDTH,
								isDesktopNav && "font-market-close text-[13px] leading-[18px] font-semibold nav-compact:hidden",
							)}
						>
							<bdi dir="ltr">{displayLabel}</bdi>
						</span>
						{isDesktopNav && (
							<span className="hidden min-w-0 max-w-[8rem] truncate font-mono text-[13px] leading-[18px] font-semibold text-market-close-fg nav-compact:block">
								<bdi dir="ltr">{compactDisplayLabel}</bdi>
							</span>
						)}
					</>
				}
				groups={[
					...(actionItems.length > 0 ? [{ items: actionItems }] : []),
					{
						items: [
							{
								label: t`Disconnect`,
								icon: <SignOutIcon className="size-3.5" />,
								danger: true,
								disabled: disconnectDisabled,
								onSelect: () => {
									if (!disconnectDisabled) void disconnectWallet();
								},
							},
						],
					},
				]}
			/>
			{hasOpenedMobileSync && (
				<UserMenuModalErrorBoundary
					key={mobileSyncLoadAttempt}
					onOpenChange={handleMobileSyncErrorOpenChange}
					onRetry={resetMobileSyncLoad}
					open={mobileSyncOpen}
					presentation={isMobile ? "drawer" : "modal"}
				>
					<Suspense
						fallback={
							<UserMenuModalLoadingFallback
								onOpenChange={setMobileSyncOpen}
								open={mobileSyncOpen}
								presentation={isMobile ? "drawer" : "modal"}
							/>
						}
					>
						<MobileAgentSyncModal open={mobileSyncOpen} onOpenChange={setMobileSyncOpen} />
					</Suspense>
				</UserMenuModalErrorBoundary>
			)}
		</>
	);
}
