import { Button, ButtonIcon, Divider, Dropdown } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { DownloadSimpleIcon, GearIcon } from "@phosphor-icons/react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { APP_BAR_BUTTON_HEIGHT_CLASS, APP_HEADER_HEIGHT_CLASS } from "@/config/layout";
import { isTradeRoutePath } from "@/config/nav";
import { useTradeHomePath } from "@/hooks/trade/use-trade-home-path";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { createLazyComponent } from "@/lib/lazy";
import { useDepositModalActions, useSettingsDialogActions } from "@/stores/use-global-modal-store";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";

const UserMenu = createLazyComponent(() => import("./user-menu"), "UserMenu");

export function TopNav() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openSettingsDialog } = useSettingsDialogActions();
	const { hasWalletAccess } = useWalletSession();
	const isTestnet = useIsTestnet();
	const { tradeRestricted } = useGeoRestriction();
	const tradeHomePath = useTradeHomePath();

	const tradeActive = isTradeRoutePath(pathname);
	const portfolioActive = pathname === "/portfolio";
	const moreActive = ["/docs", "/support", "/terms", "/privacy", "/risk"].includes(pathname);
	const moreItems = [
		{
			label: t`Docs`,
			active: pathname === "/docs",
			onSelect: () => void navigate({ to: "/docs" }),
		},
		{
			label: t`Support`,
			active: pathname === "/support",
			onSelect: () => void navigate({ to: "/support" }),
		},
		{
			label: t`Terms`,
			active: pathname === "/terms",
			onSelect: () => void navigate({ to: "/terms" }),
		},
		{
			label: t`Privacy Policy`,
			active: pathname === "/privacy",
			onSelect: () => void navigate({ to: "/privacy" }),
		},
		{
			label: t`Risk Disclosure`,
			active: pathname === "/risk",
			onSelect: () => void navigate({ to: "/risk" }),
		},
	];

	return (
		<header
			className={cn(
				APP_HEADER_HEIGHT_CLASS,
				"fixed left-0 right-0 z-40 border-b border-stroke-weak px-3 flex items-center justify-between bg-background",
				isTestnet ? "top-8" : "top-0",
			)}
		>
			<div className="flex min-w-0 items-center gap-3">
				<Link
					to={tradeHomePath}
					search={{ scope: "all" }}
					aria-label="gatu"
					className="flex shrink-0 items-center gap-1.5 rounded-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
				>
					<img src="/icon.svg" alt="" aria-hidden className="size-5 rounded-8" />
					<span className="text-xs font-bold tracking-tight">
						<span className="text-brand">ga</span>
						<span className="text-fg">tu</span>
					</span>
				</Link>
				<Divider orientation="vertical" className="my-2 hidden min-[1001px]:block" />
				<div className="hidden min-[1001px]:flex min-w-0 items-center">
					<nav className="flex items-center text-xs tracking-wide" aria-label={t`Primary navigation`}>
						<Link
							to={tradeHomePath}
							search={{ scope: "all" }}
							aria-current={tradeActive ? "page" : undefined}
							className={cn(
								"rounded-8 px-2.5 py-1 transition-colors",
								tradeActive ? "font-medium text-brand" : "text-fg-muted hover:text-fg",
							)}
						>
							<Trans>Trade</Trans>
						</Link>
						<Link
							to="/portfolio"
							aria-current={portfolioActive ? "page" : undefined}
							className={cn(
								"rounded-8 px-2.5 py-1 transition-colors",
								portfolioActive ? "font-medium text-brand" : "text-fg-muted hover:text-fg",
							)}
						>
							<Trans>Portfolio</Trans>
						</Link>
						<Dropdown
							align="start"
							size="sm"
							triggerVariant="minimal"
							triggerAriaLabel={t`More`}
							triggerClassName={cn(
								"h-8 px-2.5 text-xs tracking-wide hover:bg-fill-hover",
								moreActive ? "font-medium text-brand" : "text-fg-muted",
							)}
							popupClassName="min-w-44"
							trigger={<Trans>More</Trans>}
							items={moreItems}
						/>
					</nav>
				</div>
			</div>

			<div className="flex items-center gap-2 min-h-8">
				{hasWalletAccess && !tradeRestricted && (
					<Button
						variant="filled"
						intent="brand"
						size="sm"
						onClick={() => openDepositModal("deposit")}
						iconLeft={<DownloadSimpleIcon className="size-3.5" />}
						className={cn(APP_BAR_BUTTON_HEIGHT_CLASS, "shrink-0 px-3")}
					>
						<Trans>Deposit</Trans>
					</Button>
				)}
				<Suspense fallback={<UserMenuSkeleton />}>
					<UserMenu />
				</Suspense>
				<ThemeToggle />
				<LanguageSwitcher />
				<ButtonIcon
					variant="ghost"
					intent="neutral"
					className="size-8 shrink-0"
					onClick={openSettingsDialog}
					aria-label={t`Settings`}
				>
					<GearIcon className="size-4" />
				</ButtonIcon>
			</div>
		</header>
	);
}

function UserMenuSkeleton() {
	return <div className={cn(APP_BAR_BUTTON_HEIGHT_CLASS, "h-8 w-32 shrink-0 rounded-8 bg-surface animate-pulse")} />;
}
