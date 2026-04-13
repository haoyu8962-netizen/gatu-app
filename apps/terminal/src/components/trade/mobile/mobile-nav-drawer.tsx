import { Badge, Button, ButtonIcon, Divider, Drawer, DrawerContent } from "@hypeterminal/ui";
import { Trans } from "@lingui/react/macro";
import {
	DownloadSimpleIcon,
	GearIcon,
	HammerIcon,
	ListIcon,
	TerminalIcon,
	TrendUpIcon,
	WalletIcon,
	XIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useConnection } from "wagmi";
import { cn } from "@/lib/cn";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useDepositModalActions, useSettingsDialogActions } from "@/stores/use-global-modal-store";
import { WalletModal } from "../components/wallet-modal";
import { ThemeToggle } from "../header/theme-toggle";

const SCOPE_NAV_ITEMS = [
	{
		scope: "all" as const,
		label: <Trans>All</Trans>,
		to: "/",
		activeClass: "text-text-strong font-medium bg-fill-hover",
	},
	{
		scope: "perp" as const,
		label: <Trans>Perp</Trans>,
		to: "/perp",
		activeClass: "text-scope-perp font-medium bg-scope-perp/10",
	},
	{
		scope: "spot" as const,
		label: <Trans>Spot</Trans>,
		to: "/spot",
		activeClass: "text-scope-spot font-medium bg-scope-spot/10",
	},
	{
		scope: "builders-perp" as const,
		label: <Trans>Builders</Trans>,
		to: "/builders-perp",
		activeClass: "text-scope-builders font-medium bg-scope-builders/10",
	},
] as const;

const STATIC_NAV_ITEMS = [
	{ key: "vaults", label: <Trans>Vaults</Trans> },
	{ key: "portfolio", label: <Trans>Portfolio</Trans> },
	{ key: "staking", label: <Trans>Staking</Trans> },
	{ key: "leaderboard", label: <Trans>Leaderboard</Trans> },
] as const;

function ScopeIcon({ scope }: { scope: string }) {
	switch (scope) {
		case "perp":
			return <TrendUpIcon className="size-4 shrink-0" />;
		case "spot":
			return <WalletIcon className="size-4 shrink-0" />;
		case "builders-perp":
			return <HammerIcon className="size-4 shrink-0" />;
		default:
			return <TerminalIcon className="size-4 shrink-0" />;
	}
}

export function MobileNavDrawer() {
	const [open, setOpen] = useState(false);
	const [walletOpen, setWalletOpen] = useState(false);
	const { scope } = useExchangeScope();
	const { isConnected } = useConnection();
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openSettingsDialog } = useSettingsDialogActions();

	function close() {
		setOpen(false);
	}

	return (
		<>
			<ButtonIcon variant="ghost" intent="neutral" size="md" aria-label="Open navigation" onClick={() => setOpen(true)}>
				<ListIcon className="size-4" />
			</ButtonIcon>

			<Drawer side="left" open={open} onOpenChange={setOpen}>
				<DrawerContent className="w-72 flex flex-col p-0">
					<div className="h-12 px-3 flex items-center justify-between border-b border-stroke-weak/60 shrink-0">
						<div className="flex items-center gap-1.5">
							<div className="size-5 rounded-8 bg-fill-brand-strong/10 border border-fill-brand-strong/30 flex items-center justify-center">
								<TerminalIcon className="size-3 text-text-brand" />
							</div>
							<span className="text-xs font-bold tracking-tight">
								<span className="text-text-brand">HYPE</span>
								<span className="text-text-strong">TERMINAL</span>
							</span>
						</div>
						<ButtonIcon variant="ghost" intent="neutral" size="md" aria-label="Close navigation" onClick={close}>
							<XIcon className="size-4" />
						</ButtonIcon>
					</div>

					<div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden">
						<nav className="p-2 flex flex-col" aria-label="Markets">
							<p className="px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-text-weak">Markets</p>
							{SCOPE_NAV_ITEMS.map((item) => (
								<Link
									key={item.scope}
									to={item.to}
									onClick={close}
									className={cn(
										"flex items-center gap-3 px-3 py-2.5 rounded-xs text-sm transition-colors duration-150",
										scope === item.scope
											? item.activeClass
											: "text-text-weak hover:text-text-strong hover:bg-fill-hover",
									)}
								>
									<ScopeIcon scope={item.scope} />
									{item.label}
								</Link>
							))}
						</nav>

						<Divider className="mx-3" />

						<nav className="p-2 flex flex-col" aria-label="Platform">
							<p className="px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-text-weak">Platform</p>
							{STATIC_NAV_ITEMS.map((item) => (
								<div
									key={item.key}
									className="flex items-center justify-between px-3 py-2.5 rounded-xs text-sm text-text-disabled"
								>
									<span>{item.label}</span>
									<Badge tone="neutral" size="xxs" className="text-text-disabled">
										Soon
									</Badge>
								</div>
							))}
						</nav>
					</div>

					<div className="shrink-0 p-3 border-t border-stroke-weak/60 flex flex-col gap-2">
						{isConnected ? (
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
						) : (
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
						<div className="flex items-center justify-between pt-1">
							<ButtonIcon
								variant="ghost"
								intent="neutral"
								size="md"
								aria-label="Settings"
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

			<WalletModal open={walletOpen} onOpenChange={setWalletOpen} />
		</>
	);
}
