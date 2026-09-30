import { Button, ButtonIcon, Drawer, DrawerContent, DrawerTitle } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { DownloadSimpleIcon, GearIcon, ListIcon, SpinnerGapIcon, XIcon } from "@phosphor-icons/react";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { GatuLogo } from "@/components/brand/gatu-logo";
import { TOUCH_PRESS_CLASS, TOUCH_PRESS_FADE_CLASS } from "@/components/ui/touch-press";
import { DESKTOP_NAV_LABELS } from "@/config/desktop-nav";
import { HYPERSCREENER_URL, isTradeRoutePath } from "@/config/nav";
import { getFundsAvailabilityNotice } from "@/domain/trade/data-presentation";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useTradeHomePath } from "@/hooks/trade/use-trade-home-path";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { useDepositModalActions, useSettingsDialogActions } from "@/stores/use-global-modal-store";
import { type PreloadableGlobalModal, preloadGlobalModal } from "../components/lazy-global-modals";
import { HeaderIconButtonView } from "../header/header-icon-button-view";
import { ThemeToggle } from "../header/theme-toggle";

interface NavigationTarget {
	to: string;
	search?: { scope: "all" };
}

export function MobileNavDrawer() {
	const router = useRouter();
	const pendingNavigationRef = useRef<NavigationTarget | null>(null);
	const { t } = useLingui();
	const pathname = normalizeActivePathname(useLocation().pathname);
	const [open, setOpen] = useState(false);
	const [pendingModal, setPendingModal] = useState<PreloadableGlobalModal | null>(null);
	const [preloadFailed, setPreloadFailed] = useState(false);
	const pendingModalRef = useRef<PreloadableGlobalModal | null>(null);
	const preloadRequestRef = useRef(0);
	const closingForModalRef = useRef(false);
	const { hasWalletAccess, sessionMode } = useWalletSession();
	const depositAvailability = useDepositAvailability();
	const depositNotice = getFundsAvailabilityNotice(depositAvailability);
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openSettingsDialog } = useSettingsDialogActions();
	const tradeHomePath = useTradeHomePath();
	const tradeActive = isTradeRoutePath(pathname);
	const vaultsActive = pathname === "/vaults" || pathname.startsWith("/vaults/");
	const showsDepositEntry = hasWalletAccess || sessionMode === "agent-only" || depositAvailability.path === "sponsored";

	function getNavLinkClass(active: boolean): string {
		return cn(
			"rounded-8 px-3 py-2.5 text-sm hover:bg-fill-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
			active ? cn("bg-fill-hover font-medium text-action", TOUCH_PRESS_FADE_CLASS) : cn("text-fg", TOUCH_PRESS_CLASS),
		);
	}

	const cancelPendingAction = useCallback(() => {
		pendingNavigationRef.current = null;
		preloadRequestRef.current += 1;
		pendingModalRef.current = null;
		closingForModalRef.current = false;
		setPendingModal(null);
		setPreloadFailed(false);
	}, []);

	useEffect(
		() => () => {
			pendingNavigationRef.current = null;
			preloadRequestRef.current += 1;
			pendingModalRef.current = null;
			closingForModalRef.current = false;
		},
		[],
	);

	useEffect(
		() =>
			router.subscribe("onBeforeNavigate", () => {
				pendingNavigationRef.current = null;
			}),
		[router],
	);

	function navigationLinkProps(target: NavigationTarget) {
		return {
			...target,
			onClick(event: MouseEvent<HTMLAnchorElement>) {
				const anchor = event.currentTarget;
				if (
					event.defaultPrevented ||
					event.button !== 0 ||
					event.metaKey ||
					event.ctrlKey ||
					event.shiftKey ||
					event.altKey ||
					anchor.hasAttribute("download") ||
					(anchor.target && anchor.target !== "_self")
				)
					return;
				event.preventDefault();
				if (pendingNavigationRef.current) return;
				cancelPendingAction();
				pendingNavigationRef.current = target;
				void router.preloadRoute(target).catch(() => {});
				setOpen(false);
			},
		};
	}

	function close() {
		cancelPendingAction();
		setOpen(false);
	}

	function handleOpenChange(nextOpen: boolean) {
		if (nextOpen || !closingForModalRef.current) cancelPendingAction();
		setOpen(nextOpen);
	}

	function requestGlobalModal(modal: PreloadableGlobalModal) {
		if (pendingModalRef.current || pendingNavigationRef.current) return;

		const requestId = preloadRequestRef.current + 1;
		preloadRequestRef.current = requestId;
		pendingModalRef.current = modal;
		setPendingModal(modal);
		setPreloadFailed(false);

		void preloadGlobalModal(modal).then(
			() => {
				if (preloadRequestRef.current !== requestId || pendingModalRef.current !== modal) return;
				closingForModalRef.current = true;
				setOpen(false);
			},
			() => {
				if (preloadRequestRef.current !== requestId || pendingModalRef.current !== modal) return;
				pendingModalRef.current = null;
				setPendingModal(null);
				setPreloadFailed(true);
			},
		);
	}

	function handleOpenChangeComplete(completedOpen: boolean) {
		if (completedOpen) return;
		const navigation = pendingNavigationRef.current;
		pendingNavigationRef.current = null;
		if (navigation) {
			const originLocation = router.latestLocation;
			const requestId = ++preloadRequestRef.current;
			void router.navigate(navigation).catch(() => {
				if (preloadRequestRef.current !== requestId || router.latestLocation !== originLocation) return;
				setPreloadFailed(true);
				setOpen(true);
			});
			return;
		}
		if (!closingForModalRef.current) return;

		const modal = pendingModalRef.current;
		closingForModalRef.current = false;
		pendingModalRef.current = null;
		setPendingModal(null);
		setPreloadFailed(false);

		if (modal === "deposit" && depositAvailability.available) openDepositModal("deposit");
		if (modal === "settings") openSettingsDialog();
	}

	return (
		<>
			<HeaderIconButtonView
				size="md"
				className="touch-target"
				aria-label={t(DESKTOP_NAV_LABELS.openNavigation)}
				onClick={() => {
					cancelPendingAction();
					setOpen(true);
				}}
			>
				<ListIcon className="size-4.5 text-trading-panel-fg" />
			</HeaderIconButtonView>

			<Drawer side="left" open={open} onOpenChange={handleOpenChange} onOpenChangeComplete={handleOpenChangeComplete}>
				<DrawerContent className="w-[80vw] max-w-72 flex flex-col p-0 pl-[env(safe-area-inset-left)]">
					<DrawerTitle className="sr-only">
						<Trans>Navigation</Trans>
					</DrawerTitle>
					<div className="h-[calc(3rem+env(safe-area-inset-top))] px-3 pt-[env(safe-area-inset-top)] flex items-center justify-between border-b border-stroke-weak/60 shrink-0">
						<Link
							{...navigationLinkProps({ to: tradeHomePath, search: { scope: "all" } })}
							aria-label="GATU"
							className="flex items-center gap-1.5 rounded-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
						>
							<GatuLogo className="h-4 w-auto" />
						</Link>
						<ButtonIcon variant="ghost" intent="neutral" size="md" aria-label={t`Close navigation`} onClick={close}>
							<XIcon className="size-4" />
						</ButtonIcon>
					</div>

					<div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden">
						<nav className="flex flex-col p-2" aria-label={t`Primary navigation`}>
							<p className="px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-fg-muted">
								<Trans>Navigation</Trans>
							</p>
							<Link
								{...navigationLinkProps({ to: tradeHomePath, search: { scope: "all" } })}
								aria-current={tradeActive ? "page" : undefined}
								className={getNavLinkClass(tradeActive)}
							>
								<Trans>Trade</Trans>
							</Link>
							<Link
								{...navigationLinkProps({ to: "/portfolio" })}
								aria-current={pathname === "/portfolio" ? "page" : undefined}
								className={getNavLinkClass(pathname === "/portfolio")}
							>
								<Trans>Portfolio</Trans>
							</Link>
							<Link
								{...navigationLinkProps({ to: "/earn" })}
								aria-current={pathname === "/earn" ? "page" : undefined}
								className={getNavLinkClass(pathname === "/earn")}
							>
								<Trans>Earn</Trans>
							</Link>
							<Link
								{...navigationLinkProps({ to: "/vaults" })}
								aria-current={vaultsActive ? "page" : undefined}
								className={getNavLinkClass(vaultsActive)}
							>
								<Trans>Vaults</Trans>
							</Link>
							<Link
								{...navigationLinkProps({ to: "/staking" })}
								aria-current={pathname === "/staking" ? "page" : undefined}
								className={getNavLinkClass(pathname === "/staking")}
							>
								<Trans>Staking</Trans>
							</Link>
							<Link
								{...navigationLinkProps({ to: "/referrals" })}
								aria-current={pathname === "/referrals" ? "page" : undefined}
								className={getNavLinkClass(pathname === "/referrals")}
							>
								<Trans>Referrals</Trans>
							</Link>
							<Link
								{...navigationLinkProps({ to: "/leaderboard" })}
								aria-current={pathname === "/leaderboard" ? "page" : undefined}
								className={getNavLinkClass(pathname === "/leaderboard")}
							>
								<Trans>Leaderboard</Trans>
							</Link>
						</nav>
						<nav className="flex flex-col p-2 pt-0" aria-label={t`More`}>
							<p className="px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-fg-muted">
								<Trans>More</Trans>
							</p>
							<Link
								{...navigationLinkProps({ to: "/fundingComparison" })}
								aria-current={pathname === "/fundingcomparison" ? "page" : undefined}
								className={getNavLinkClass(pathname === "/fundingcomparison")}
							>
								<Trans>Funding Comparison</Trans>
							</Link>
							<a
								href={HYPERSCREENER_URL}
								target="_blank"
								rel="noopener noreferrer"
								onClick={close}
								className={getNavLinkClass(false)}
							>
								<Trans>Statistics</Trans>
							</a>
							<Link
								{...navigationLinkProps({ to: "/api-wallet" })}
								aria-current={pathname === "/api-wallet" ? "page" : undefined}
								className={getNavLinkClass(pathname === "/api-wallet")}
							>
								<Trans>API Wallet</Trans>
							</Link>
							<Link
								{...navigationLinkProps({ to: "/docs" })}
								aria-current={pathname === "/docs" ? "page" : undefined}
								className={getNavLinkClass(pathname === "/docs")}
							>
								<Trans>Docs</Trans>
							</Link>
							<Link
								{...navigationLinkProps({ to: "/support" })}
								aria-current={pathname === "/support" ? "page" : undefined}
								className={getNavLinkClass(pathname === "/support")}
							>
								<Trans>Support</Trans>
							</Link>
						</nav>
					</div>

					<div className="shrink-0 px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] border-t border-stroke-weak/60 flex flex-col gap-2">
						{preloadFailed && (
							<p role="alert" className="text-center text-2xs text-error">
								<Trans>Try again</Trans>
							</p>
						)}
						{showsDepositEntry && (
							<>
								<Button
									variant="filled"
									intent="brand"
									size="sm"
									onClick={depositAvailability.available ? () => requestGlobalModal("deposit") : undefined}
									disabled={pendingModal !== null || !depositAvailability.available}
									aria-busy={pendingModal === "deposit" || undefined}
									iconLeft={
										pendingModal === "deposit" ? (
											<SpinnerGapIcon className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
										) : (
											<DownloadSimpleIcon className="size-3.5" />
										)
									}
									className="w-full"
								>
									<Trans>Deposit</Trans>
								</Button>
								{depositNotice ? <output className="text-center text-2xs text-fg-muted">{depositNotice}</output> : null}
							</>
						)}
						<div className="flex items-center justify-between pt-1">
							<ThemeToggle />
							<ButtonIcon
								variant="ghost"
								intent="neutral"
								size="md"
								aria-label={t`Settings`}
								onClick={() => requestGlobalModal("settings")}
								disabled={pendingModal !== null}
								aria-busy={pendingModal === "settings" || undefined}
							>
								{pendingModal === "settings" ? (
									<SpinnerGapIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
								) : (
									<GearIcon className="size-4" />
								)}
							</ButtonIcon>
						</div>
					</div>
				</DrawerContent>
			</Drawer>
		</>
	);
}

function normalizeActivePathname(pathname: string): string {
	const lowerCase = pathname.toLowerCase();
	return lowerCase.length > 1 ? lowerCase.replace(/\/+$/, "") : lowerCase;
}
