import { Badge, Button, ButtonIcon, Drawer, DrawerContent } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { DownloadSimpleIcon, GearIcon, ListIcon, XIcon } from "@phosphor-icons/react";
import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { isTradeRoutePath, STATIC_NAV_ITEMS } from "@/config/nav";
import { useTradeHomePath } from "@/hooks/trade/use-trade-home-path";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { useDepositModalActions, useSettingsDialogActions } from "@/stores/use-global-modal-store";
import { LanguageSwitcher } from "../header/language-switcher";
import { ThemeToggle } from "../header/theme-toggle";

export function MobileNavDrawer() {
	const { t } = useLingui();
	const { pathname } = useLocation();
	const [open, setOpen] = useState(false);
	const { hasWalletAccess } = useWalletSession();
	const { tradeRestricted } = useGeoRestriction();
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openSettingsDialog } = useSettingsDialogActions();
	const tradeHomePath = useTradeHomePath();
	const tradeActive = isTradeRoutePath(pathname);

	function getNavLinkClass(active: boolean): string {
		return cn(
			"rounded-8 px-3 py-2.5 text-sm transition-colors hover:bg-fill-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
			active ? "bg-fill-hover font-medium text-brand" : "text-fg",
		);
	}

	function close() {
		setOpen(false);
	}

	return (
		<>
			<ButtonIcon
				variant="ghost"
				intent="neutral"
				size="md"
				className="touch-target"
				aria-label={t`Open navigation`}
				onClick={() => setOpen(true)}
			>
				<ListIcon className="size-4" />
			</ButtonIcon>

			<Drawer side="left" open={open} onOpenChange={setOpen}>
				<DrawerContent className="w-[80vw] max-w-72 flex flex-col p-0">
					<div className="h-12 px-3 flex items-center justify-between border-b border-stroke-weak/60 shrink-0">
						<Link
							to={tradeHomePath}
							search={{ scope: "all" }}
							onClick={close}
							aria-label="gatu"
							className="flex items-center gap-1.5 rounded-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
						>
							<img src="/icon.svg" alt="" aria-hidden className="size-5 rounded-8" />
							<span className="text-xs font-bold tracking-tight">
								<span className="text-brand">ga</span>
								<span className="text-fg">tu</span>
							</span>
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
								to={tradeHomePath}
								search={{ scope: "all" }}
								onClick={close}
								aria-current={tradeActive ? "page" : undefined}
								className={getNavLinkClass(tradeActive)}
							>
								<Trans>Trade</Trans>
							</Link>
							<Link
								to="/docs"
								onClick={close}
								aria-current={pathname === "/docs" ? "page" : undefined}
								className={getNavLinkClass(pathname === "/docs")}
							>
								<Trans>Docs</Trans>
							</Link>
							<Link
								to="/support"
								onClick={close}
								aria-current={pathname === "/support" ? "page" : undefined}
								className={getNavLinkClass(pathname === "/support")}
							>
								<Trans>Support</Trans>
							</Link>
							<Link
								to="/terms"
								onClick={close}
								aria-current={pathname === "/terms" ? "page" : undefined}
								className={getNavLinkClass(pathname === "/terms")}
							>
								<Trans>Terms</Trans>
							</Link>
							<Link
								to="/privacy"
								onClick={close}
								aria-current={pathname === "/privacy" ? "page" : undefined}
								className={getNavLinkClass(pathname === "/privacy")}
							>
								<Trans>Privacy Policy</Trans>
							</Link>
						</nav>
						<nav className="flex flex-col p-2 pt-0" aria-label={t`Platform`}>
							<p className="px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-fg-muted">
								<Trans>Platform</Trans>
							</p>
							{STATIC_NAV_ITEMS.map((item) => (
								<div
									key={item.key}
									className="flex items-center justify-between px-3 py-2.5 rounded-xs text-sm text-fg-disabled"
								>
									<span>{item.label}</span>
									<Badge tone="neutral" size="xxs" className="text-fg-disabled">
										<Trans>Soon</Trans>
									</Badge>
								</div>
							))}
						</nav>
					</div>

					<div className="shrink-0 p-3 border-t border-stroke-weak/60 flex flex-col gap-2">
						{hasWalletAccess && !tradeRestricted && (
							<Button
								variant="filled"
								intent="brand"
								size="sm"
								onClick={() => {
									openDepositModal("deposit");
									close();
								}}
								iconLeft={<DownloadSimpleIcon className="size-3.5" />}
								className="w-full"
							>
								<Trans>Deposit</Trans>
							</Button>
						)}
						<div className="flex items-center justify-between pt-1">
							<div className="flex items-center gap-1">
								<LanguageSwitcher />
								<ThemeToggle />
							</div>
							<ButtonIcon
								variant="ghost"
								intent="neutral"
								size="md"
								aria-label={t`Settings`}
								onClick={() => {
									openSettingsDialog();
									close();
								}}
							>
								<GearIcon className="size-4" />
							</ButtonIcon>
						</div>
					</div>
				</DrawerContent>
			</Drawer>
		</>
	);
}
