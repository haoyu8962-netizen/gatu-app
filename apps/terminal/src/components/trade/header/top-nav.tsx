import { Button, ButtonIcon, Dropdown } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { DownloadSimpleIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
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
import { DesktopUtilitiesMenu } from "./desktop-utilities-menu";
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
	const referralsActive = pathname === "/referrals";
	const futureMoreItems = [
		{ label: t`Statistics`, disabled: true },
		{ label: t`API & Subaccounts`, disabled: true },
	];
	const compactMoreItems = [
		...(hasWalletAccess ? [{ label: t`Vaults`, disabled: true }] : []),
		{ label: t`Staking`, disabled: true },
		{
			label: t`Referrals`,
			active: referralsActive,
			onSelect: () => void navigate({ to: "/referrals" }),
		},
		...(hasWalletAccess ? [{ label: t`Leaderboard`, disabled: true }] : []),
		...futureMoreItems,
	];

	return (
		<header
			className={cn(
				APP_HEADER_HEIGHT_CLASS,
				"fixed right-0 left-0 z-40 flex items-center justify-between border-b border-market-close-stroke-card bg-surface px-5 font-market-close shadow-[0_1px_0_rgba(20,30,45,0.02)]",
				isTestnet ? "top-8" : "top-0",
			)}
		>
			<div className="flex min-w-0 items-center">
				<Link
					to={tradeHomePath}
					search={{ scope: "all" }}
					aria-label="gatu"
					className={cn(
						"mr-6 flex shrink-0 items-center gap-2 rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
						hasWalletAccess ? "max-[1181px]:mr-7" : "max-[1181px]:mr-8",
					)}
				>
					<span className="grid size-[26px] shrink-0 place-items-center rounded-[7px] bg-market-close-control text-market-close-on-control">
						<svg aria-hidden viewBox="0 0 120 120" fill="none" className="size-[18px]">
							<title>Gatu</title>
							<path
								d="M66 60 H100 A40 40 0 1 0 76.9 96.25"
								stroke="currentColor"
								strokeWidth="16"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</span>
					<span
						className={cn(
							"text-base leading-6 font-bold tracking-[-0.2px] whitespace-nowrap text-market-close-fg",
							hasWalletAccess && "max-[1181px]:hidden",
						)}
					>
						gatu
					</span>
				</Link>
				<div className="hidden min-[1001px]:flex min-w-0 items-center">
					<nav className="flex items-center gap-0.5 text-[13px] leading-[18px]" aria-label={t`Primary navigation`}>
						<Link
							to={tradeHomePath}
							search={{ scope: "all" }}
							aria-current={tradeActive ? "page" : undefined}
							className={cn(
								"rounded-[8px] px-2.5 py-2 font-medium whitespace-nowrap transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg",
								tradeActive ? "font-bold text-market-close-fg" : "text-market-close-muted",
							)}
						>
							<Trans>Trade</Trans>
						</Link>
						<Link
							to="/portfolio"
							aria-current={portfolioActive ? "page" : undefined}
							className={cn(
								"rounded-[8px] px-2.5 py-2 font-medium whitespace-nowrap transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg",
								portfolioActive ? "font-bold text-market-close-fg" : "text-market-close-muted",
							)}
						>
							<Trans>Portfolio</Trans>
						</Link>
						<UpcomingNavItem label={t`Earn`} soonLabel={t`Soon`} />
						<UpcomingNavItem
							label={t`Vaults`}
							soonLabel={t`Soon`}
							className={hasWalletAccess ? "max-[1181px]:hidden" : undefined}
						/>
						<UpcomingNavItem label={t`Staking`} soonLabel={t`Soon`} className="max-[1181px]:hidden" />
						<Link
							to="/referrals"
							aria-current={referralsActive ? "page" : undefined}
							className={cn(
								"rounded-[8px] px-2.5 py-2 font-medium whitespace-nowrap transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg max-[1181px]:hidden",
								referralsActive ? "font-bold text-market-close-fg" : "text-market-close-muted",
							)}
						>
							<Trans>Referrals</Trans>
						</Link>
						<UpcomingNavItem
							label={t`Leaderboard`}
							soonLabel={t`Soon`}
							className={hasWalletAccess ? "max-[1181px]:hidden" : undefined}
						/>
						<Dropdown
							className="max-[1181px]:hidden"
							align="start"
							size="md"
							triggerVariant="minimal"
							triggerAriaLabel={t`More`}
							triggerClassName="h-[34px] rounded-[8px] px-2.5 py-2 text-[13px] leading-[18px] font-medium whitespace-nowrap text-market-close-muted transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg data-[popup-open]:bg-market-close-hover data-[popup-open]:text-market-close-fg [&>svg]:size-[10px]"
							popupClassName="max-h-[calc(100vh-4.5rem)] min-w-[148px] rounded-[10px] border-market-close-stroke-card bg-surface p-1 font-market-close shadow-[0_12px_32px_rgba(20,30,45,0.16)] [&_[role=menuitem]]:rounded-[7px] [&_[role=menuitem]]:px-3 [&_[role=menuitem]]:py-[9px] [&_[role=menuitem]]:text-[13px] [&_[role=menuitem]]:leading-[18px] [&_[role=menuitem]]:font-medium"
							trigger={<Trans>More</Trans>}
							items={futureMoreItems}
						/>
						<Dropdown
							className="hidden max-[1181px]:block"
							align="start"
							size="md"
							triggerVariant="minimal"
							triggerAriaLabel={t`More`}
							triggerClassName={cn(
								"h-[34px] rounded-[8px] px-2.5 py-2 text-[13px] leading-[18px] font-medium whitespace-nowrap text-market-close-muted transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg data-[popup-open]:bg-market-close-hover data-[popup-open]:text-market-close-fg [&>svg]:size-[10px]",
								referralsActive && "font-bold text-market-close-fg",
							)}
							popupClassName="max-h-[calc(100vh-4.5rem)] min-w-[148px] rounded-[10px] border-market-close-stroke-card bg-surface p-1 font-market-close shadow-[0_12px_32px_rgba(20,30,45,0.16)] [&_[role=menuitem]]:rounded-[7px] [&_[role=menuitem]]:px-3 [&_[role=menuitem]]:py-[9px] [&_[role=menuitem]]:text-[13px] [&_[role=menuitem]]:leading-[18px] [&_[role=menuitem]]:font-medium"
							trigger={<Trans>More</Trans>}
							items={compactMoreItems}
						/>
					</nav>
				</div>
			</div>

			<div className="ml-auto flex min-h-[34px] items-center gap-2">
				{hasWalletAccess && !tradeRestricted && (
					<Button
						variant="filled"
						intent="brand"
						size="sm"
						onClick={() => openDepositModal("deposit")}
						iconLeft={<DownloadSimpleIcon className="size-[18px]" />}
						className={cn(
							APP_BAR_BUTTON_HEIGHT_CLASS,
							"h-[34px] min-h-[34px] shrink-0 gap-[7px] rounded-[10px] bg-market-close-control px-3.5 font-market-close text-[13px] leading-[18px] font-bold text-market-close-on-control shadow-none hover:bg-market-close-control hover:opacity-90 active:bg-market-close-control max-[1181px]:size-[34px] max-[1181px]:px-0",
						)}
					>
						<span className="max-[1181px]:sr-only">
							<Trans>Deposit</Trans>
						</span>
					</Button>
				)}
				<Suspense fallback={<UserMenuSkeleton />}>
					<UserMenu variant="desktop-nav" />
				</Suspense>
				<div className={cn("contents", hasWalletAccess && "max-[1181px]:hidden")}>
					<ThemeToggle
						className="size-[34px] rounded-[10px] text-market-close-muted hover:bg-market-close-hover hover:text-market-close-fg"
						iconClassName="size-[18px]"
					/>
					<LanguageSwitcher
						showLabel
						className="h-[34px] min-h-[34px] rounded-[10px] px-[9px] text-market-close-muted hover:bg-market-close-hover hover:text-market-close-fg"
						labelClassName="max-[1181px]:hidden"
					/>
					<ButtonIcon
						variant="ghost"
						intent="neutral"
						className="size-[34px] shrink-0 rounded-[10px] text-market-close-muted hover:bg-market-close-hover hover:text-market-close-fg"
						onClick={openSettingsDialog}
						aria-label={t`Settings`}
					>
						<SlidersHorizontalIcon className="size-[18px]" />
					</ButtonIcon>
				</div>
				{hasWalletAccess && (
					<DesktopUtilitiesMenu className="hidden max-[1181px]:inline-flex" onOpenSettings={openSettingsDialog} />
				)}
			</div>
		</header>
	);
}

interface UpcomingNavItemProps {
	label: string;
	soonLabel: string;
	className?: string;
}

function UpcomingNavItem({ label, soonLabel, className }: UpcomingNavItemProps) {
	return (
		<button
			type="button"
			disabled
			title={soonLabel}
			className={cn(
				"cursor-default rounded-[8px] px-2.5 py-2 font-medium whitespace-nowrap text-market-close-muted disabled:hover:bg-transparent disabled:hover:text-market-close-muted",
				className,
			)}
		>
			{label}
			<span className="sr-only"> — {soonLabel}</span>
		</button>
	);
}

function UserMenuSkeleton() {
	return (
		<div
			className={cn(
				APP_BAR_BUTTON_HEIGHT_CLASS,
				"h-[34px] w-36 shrink-0 animate-pulse rounded-[10px] bg-market-close-hover max-[1181px]:w-32",
			)}
		/>
	);
}
