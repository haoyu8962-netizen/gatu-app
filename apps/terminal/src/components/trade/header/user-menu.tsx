import { Button, ButtonIcon, Dropdown } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { CheckIcon, CopyIcon, DeviceMobileIcon, SignOutIcon, SpinnerGapIcon, WalletIcon } from "@phosphor-icons/react";
import { Suspense, useEffect, useState } from "react";
import { useEnsName } from "wagmi";
import { APP_BAR_BUTTON_HEIGHT_CLASS } from "@/config/layout";
import { useCopyToClipboard } from "@/hooks/ui/use-copy-to-clipboard";
import { useIsMobile, useIsMobileQrSurface } from "@/hooks/use-mobile";
import { useDisconnectWallet, useReconnectWallet, useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { shortenAddress } from "@/lib/format";
import { createLazyComponent } from "@/lib/lazy";
import { getPrivyEmailAddress } from "@/lib/wallet/privy-wagmi";
import { UserMenuModalErrorBoundary, UserMenuModalLoadingFallback } from "./user-menu-modal-boundary";
import { loadUserMenuModalModule } from "./user-menu-modal-load";

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

const USER_MENU_BUTTON_MIN_WIDTH = "min-w-[9rem]";
const USER_MENU_LABEL_MAX_WIDTH = "max-w-[11rem]";

interface Props {
	variant?: "default" | "desktop-nav";
}

export function UserMenu({ variant = "default" }: Props) {
	const { t } = useLingui();
	const { ready, authenticated, isConnected, isConnecting, displayAddress, sessionMode, hasWalletAccess, user } =
		useWalletSession();
	const { disconnectWallet } = useDisconnectWallet();
	const { reconnectWallet, walletsReady, isReconnecting } = useReconnectWallet();
	const emailAddress = getPrivyEmailAddress(user);
	const { data: ensName } = useEnsName({ address: emailAddress ? undefined : displayAddress });
	const [mobileSyncOpen, setMobileSyncOpen] = useState(false);
	const [hasOpenedMobileSync, setHasOpenedMobileSync] = useState(() => shouldKeepMobileSyncModalMounted);
	const [mobileSyncLoadAttempt, setMobileSyncLoadAttempt] = useState(0);
	const [walletModalOpen, setWalletModalOpen] = useState(false);
	const [walletModalLoadAttempt, setWalletModalLoadAttempt] = useState(0);
	const [mounted, setMounted] = useState(false);
	const { copied, copy } = useCopyToClipboard();
	const isMobile = useIsMobile();
	const isMobileQrSurface = useIsMobileQrSurface();
	const isDesktopNav = variant === "desktop-nav";

	useEffect(() => {
		setMounted(true);
	}, []);

	const walletSessionLoading =
		sessionMode !== "agent-only" && (!ready || isConnecting || isReconnecting || (authenticated && !walletsReady));

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

	if (!mounted || walletSessionLoading) {
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
				disabled
			>
				<SpinnerGapIcon className="size-3.5 animate-spin" />
				<span className={cn(!isDesktopNav && "min-w-0 truncate")}>
					<Trans>Connecting...</Trans>
				</span>
			</Button>
		);
	}

	if (!authenticated && !isConnected) {
		return (
			<>
				<Button
					variant={isDesktopNav ? "filled" : "outline"}
					intent="neutral"
					size="sm"
					onClick={() => setWalletModalOpen(true)}
					onFocus={() => void WalletModal.preload?.()}
					onPointerEnter={() => void WalletModal.preload?.()}
					iconLeft={isDesktopNav ? undefined : <WalletIcon className="size-3.5" />}
					className={cn(
						APP_BAR_BUTTON_HEIGHT_CLASS,
						isDesktopNav ? "shrink-0" : "min-w-0 max-w-full",
						"px-3 transition-[color,background-color,border-color] duration-150 ease-out",
						isDesktopNav &&
							"h-[34px] min-h-[34px] rounded-[10px] border-market-close-control bg-market-close-control px-4 font-market-close text-[13px] leading-[18px] font-bold text-market-close-on-control shadow-none hover:bg-market-close-control hover:opacity-90 active:bg-market-close-control",
					)}
				>
					<span className={cn(!isDesktopNav && "min-w-0 truncate")}>
						<Trans>Connect Wallet</Trans>
					</span>
				</Button>
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

	if (authenticated && sessionMode !== "agent-only" && !hasWalletAccess) {
		return (
			<div className={cn("flex items-center", isDesktopNav ? "shrink-0 gap-1" : "min-w-0 max-w-full gap-2")}>
				<Button
					variant={isDesktopNav ? "filled" : "outline"}
					intent="neutral"
					size="sm"
					onClick={() => void reconnectWallet()}
					iconLeft={<WalletIcon className="size-3.5" />}
					className={cn(
						APP_BAR_BUTTON_HEIGHT_CLASS,
						isDesktopNav ? "shrink-0" : "min-w-0 flex-1",
						"px-3 transition-[color,background-color,border-color] duration-150 ease-out",
						isDesktopNav &&
							"h-[34px] min-h-[34px] rounded-[10px] border-market-close-control bg-market-close-control px-4 font-market-close text-[13px] leading-[18px] font-bold text-market-close-on-control shadow-none hover:bg-market-close-control hover:opacity-90 active:bg-market-close-control",
					)}
				>
					<span className={cn(!isDesktopNav && "min-w-0 truncate")}>
						<Trans>Reconnect wallet</Trans>
					</span>
				</Button>
				<ButtonIcon
					variant="ghost"
					intent="error"
					size="sm"
					onClick={() => void disconnectWallet()}
					aria-label={t`Disconnect`}
					className={cn(
						APP_BAR_BUTTON_HEIGHT_CLASS,
						isDesktopNav && "size-[34px] min-h-[34px] rounded-[10px] text-market-close-danger",
					)}
				>
					<SignOutIcon className="size-3.5" />
				</ButtonIcon>
			</div>
		);
	}

	const displayLabel = emailAddress ?? ensName ?? (displayAddress ? shortenAddress(displayAddress) : "");
	const compactDisplayLabel = displayAddress ? shortenAddress(displayAddress) : displayLabel;

	const actionItems = [
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
								"size-1.5 shrink-0 rounded-full bg-success",
								isDesktopNav && "size-[7px] bg-market-close-success",
							)}
							aria-hidden
						/>
						<span
							className={cn(
								"min-w-0 truncate font-mono text-xs text-fg",
								USER_MENU_LABEL_MAX_WIDTH,
								isDesktopNav && "font-market-close text-[13px] leading-[18px] font-semibold max-[1181px]:hidden",
							)}
						>
							{displayLabel}
						</span>
						{isDesktopNav && (
							<span className="hidden min-w-0 max-w-[8rem] truncate font-mono text-[13px] leading-[18px] font-semibold text-market-close-fg max-[1181px]:block">
								{compactDisplayLabel}
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
								onSelect: () => {
									void disconnectWallet();
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
