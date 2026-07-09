import { Badge, Button, ButtonIcon, Drawer, DrawerContent } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { DownloadSimpleIcon, GearIcon, ListIcon, WalletIcon, XIcon } from "@phosphor-icons/react";
import { Suspense, useState } from "react";
import { STATIC_NAV_ITEMS } from "@/config/nav";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { createLazyComponent } from "@/lib/lazy";
import { useDepositModalActions, useSettingsDialogActions } from "@/stores/use-global-modal-store";
import { ThemeToggle } from "../header/theme-toggle";

const WalletModal = createLazyComponent(() => import("../components/wallet-modal"), "WalletModal");

export function MobileNavDrawer() {
	const [open, setOpen] = useState(false);
	const [walletOpen, setWalletOpen] = useState(false);
	const { isConnected, sessionMode } = useWalletSession();
	const { tradeRestricted } = useGeoRestriction();
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openSettingsDialog } = useSettingsDialogActions();

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
						<div className="flex items-center gap-1.5">
							<img src="/icon.svg" alt="gatu" className="size-5 rounded-8" />
							<span className="text-xs font-bold tracking-tight">
								<span className="text-brand">ga</span>
								<span className="text-fg">tu</span>
							</span>
						</div>
						<ButtonIcon variant="ghost" intent="neutral" size="md" aria-label={t`Close navigation`} onClick={close}>
							<XIcon className="size-4" />
						</ButtonIcon>
					</div>

					<div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden">
						<nav className="p-2 flex flex-col" aria-label={t`Platform`}>
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
						{!isConnected && (
							<Button
								variant="outline"
								intent="neutral"
								size="sm"
								onClick={() => setWalletOpen(true)}
								iconLeft={<WalletIcon className="size-3.5" />}
								className="w-full"
							>
								<Trans>Connect Wallet</Trans>
							</Button>
						)}
						{isConnected && sessionMode === "wallet" && !tradeRestricted && (
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
							<ThemeToggle />
						</div>
					</div>
				</DrawerContent>
			</Drawer>

			{walletOpen && (
				<Suspense fallback={null}>
					<WalletModal open onOpenChange={setWalletOpen} />
				</Suspense>
			)}
		</>
	);
}
