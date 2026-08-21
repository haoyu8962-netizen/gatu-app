import { Button, ButtonIcon, Dropdown } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { DownloadSimpleIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { APP_BAR_BUTTON_HEIGHT_CLASS, APP_HEADER_HEIGHT_CLASS } from "@/config/layout";
import { HYPERSCREENER_URL, isTradeRoutePath } from "@/config/nav";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useTradeHomePath } from "@/hooks/trade/use-trade-home-path";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { createLazyComponent } from "@/lib/lazy";
import { useRenderCommitTrack } from "@/lib/performance/render-profile";
import { useDepositModalActions, useSettingsDialogActions } from "@/stores/use-global-modal-store";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { DesktopUtilitiesMenu } from "./desktop-utilities-menu";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";

const UserMenu = createLazyComponent(() => import("./user-menu"), "UserMenu");

export type TopNavMode = "default" | "market-loading";

interface Props {
	mode?: TopNavMode;
}

export function TopNav({ mode = "default" }: Props) {
	useRenderCommitTrack("top-nav");
	const { t } = useLingui();
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const { open: openDepositModal } = useDepositModalActions();
	const depositAvailability = useDepositAvailability();
	const { open: openSettingsDialog } = useSettingsDialogActions();
	const { hasWalletAccess } = useWalletSession();
	const isTestnet = useIsTestnet();
	const tradeHomePath = useTradeHomePath();
	const showsDepositEntry = hasWalletAccess || depositAvailability.path === "sponsored";
	const isMarketLoading = mode === "market-loading";

	const tradeActive = isTradeRoutePath(pathname);
	const portfolioActive = pathname === "/portfolio";
	const referralsActive = pathname === "/referrals";
	const apiWalletActive = pathname === "/api-wallet";
	const vaultsActive = pathname === "/vaults" || pathname.startsWith("/vaults/");
	const stakingActive = pathname === "/staking";
	const leaderboardActive = pathname === "/leaderboard";
	const moreItems = [
		{
			label: t`Statistics`,
			href: HYPERSCREENER_URL,
			target: "_blank" as const,
			rel: "noopener noreferrer",
		},
		{
			label: t`API Wallet`,
			active: apiWalletActive,
			onSelect: () => void navigate({ to: "/api-wallet" }),
		},
	];
	const compactMoreItems = [
		{
			label: t`Vaults`,
			active: vaultsActive,
			onSelect: () => void navigate({ to: "/vaults" }),
		},
		{
			label: t`Staking`,
			active: stakingActive,
			onSelect: () => void navigate({ to: "/staking" }),
		},
		{
			label: t`Referrals`,
			active: referralsActive,
			onSelect: () => void navigate({ to: "/referrals" }),
		},
		{
			label: t`Leaderboard`,
			active: leaderboardActive,
			onSelect: () => void navigate({ to: "/leaderboard" }),
		},
		...moreItems,
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
								"rounded-[8px] px-2.5 py-2 font-semibold whitespace-nowrap transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg",
								tradeActive ? "text-market-close-fg" : "text-market-close-muted",
							)}
						>
							<Trans>Trade</Trans>
						</Link>
						<Link
							to="/portfolio"
							aria-current={portfolioActive ? "page" : undefined}
							className={cn(
								"rounded-[8px] px-2.5 py-2 font-semibold whitespace-nowrap transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg",
								portfolioActive ? "text-market-close-fg" : "text-market-close-muted",
							)}
						>
							<Trans>Portfolio</Trans>
						</Link>
						<UpcomingNavItem label={t`Earn`} soonLabel={t`Soon`} />
						<Link
							to="/vaults"
							aria-current={vaultsActive ? "page" : undefined}
							className={cn(
								"rounded-[8px] px-2.5 py-2 font-semibold whitespace-nowrap transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg max-[1181px]:hidden",
								vaultsActive ? "text-market-close-fg" : "text-market-close-muted",
							)}
						>
							<Trans>Vaults</Trans>
						</Link>
						<Link
							to="/staking"
							aria-current={stakingActive ? "page" : undefined}
							className={cn(
								"rounded-[8px] px-2.5 py-2 font-semibold whitespace-nowrap transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg max-[1181px]:hidden",
								stakingActive ? "text-market-close-fg" : "text-market-close-muted",
							)}
						>
							<Trans>Staking</Trans>
						</Link>
						<Link
							to="/referrals"
							aria-current={referralsActive ? "page" : undefined}
							className={cn(
								"rounded-[8px] px-2.5 py-2 font-semibold whitespace-nowrap transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg max-[1181px]:hidden",
								referralsActive ? "text-market-close-fg" : "text-market-close-muted",
							)}
						>
							<Trans>Referrals</Trans>
						</Link>
						<Link
							to="/leaderboard"
							aria-current={leaderboardActive ? "page" : undefined}
							className={cn(
								"rounded-[8px] px-2.5 py-2 font-semibold whitespace-nowrap transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg max-[1181px]:hidden",
								leaderboardActive ? "text-market-close-fg" : "text-market-close-muted",
							)}
						>
							<Trans>Leaderboard</Trans>
						</Link>
						<Dropdown
							className="max-[1181px]:hidden"
							align="start"
							size="md"
							triggerVariant="minimal"
							triggerAriaLabel={t`More`}
							triggerClassName={cn(
								"h-[34px] rounded-[8px] px-2.5 py-2 text-[13px] leading-[18px] font-semibold whitespace-nowrap text-market-close-muted transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg data-[popup-open]:bg-market-close-hover data-[popup-open]:text-market-close-fg [&>svg]:size-[10px]",
								apiWalletActive && "text-market-close-fg",
							)}
							popupClassName="max-h-[calc(100vh-4.5rem)] min-w-[148px] rounded-[10px] border-market-close-stroke-card bg-overlay p-1 font-market-close shadow-overlay [&_[role=menuitem]]:rounded-[7px] [&_[role=menuitem]]:px-3 [&_[role=menuitem]]:py-[9px] [&_[role=menuitem]]:text-[13px] [&_[role=menuitem]]:leading-[18px] [&_[role=menuitem]]:font-medium"
							trigger={<Trans>More</Trans>}
							items={moreItems}
						/>
						<Dropdown
							className="hidden max-[1181px]:block"
							align="start"
							size="md"
							triggerVariant="minimal"
							triggerAriaLabel={t`More`}
							triggerClassName={cn(
								"h-[34px] rounded-[8px] px-2.5 py-2 text-[13px] leading-[18px] font-semibold whitespace-nowrap text-market-close-muted transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg data-[popup-open]:bg-market-close-hover data-[popup-open]:text-market-close-fg [&>svg]:size-[10px]",
								(referralsActive || apiWalletActive || vaultsActive || stakingActive || leaderboardActive) &&
									"text-market-close-fg",
							)}
							popupClassName="max-h-[calc(100vh-4.5rem)] min-w-[148px] rounded-[10px] border-market-close-stroke-card bg-overlay p-1 font-market-close shadow-overlay [&_[role=menuitem]]:rounded-[7px] [&_[role=menuitem]]:px-3 [&_[role=menuitem]]:py-[9px] [&_[role=menuitem]]:text-[13px] [&_[role=menuitem]]:leading-[18px] [&_[role=menuitem]]:font-medium"
							trigger={<Trans>More</Trans>}
							items={compactMoreItems}
						/>
					</nav>
				</div>
			</div>

			<div className="ml-auto flex min-h-[34px] items-center gap-2">
				{showsDepositEntry && (
					<Button
						key="deposit"
						variant="filled"
						intent="brand"
						size="sm"
						disabled={isMarketLoading || !depositAvailability.available}
						onClick={!isMarketLoading && depositAvailability.available ? () => openDepositModal("deposit") : undefined}
						aria-label={depositAvailability.available ? t`Deposit` : depositAvailability.unavailableLabel}
						title={depositAvailability.unavailableReason ?? undefined}
						iconLeft={<DownloadSimpleIcon className="size-[18px]" />}
						className={cn(
							APP_BAR_BUTTON_HEIGHT_CLASS,
							"h-[34px] min-h-[34px] shrink-0 gap-[7px] rounded-[10px] bg-market-close-control px-3.5 font-market-close text-[13px] leading-[18px] font-bold text-market-close-on-control shadow-none hover:bg-market-close-control hover:opacity-90 active:bg-market-close-control max-[1181px]:size-[34px] max-[1181px]:px-0",
						)}
					>
						<span className="max-[1181px]:sr-only">
							{depositAvailability.available ? <Trans>Deposit</Trans> : depositAvailability.unavailableLabel}
						</span>
					</Button>
				)}
				<Suspense key="user-menu" fallback={<UserMenuSkeleton />}>
					<UserMenu variant="desktop-nav" />
				</Suspense>
				<div className={cn("contents", hasWalletAccess && !isMarketLoading && "max-[1181px]:hidden")}>
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
						disabled={isMarketLoading}
						onClick={isMarketLoading ? undefined : openSettingsDialog}
						aria-label={t`Settings`}
					>
						<SlidersHorizontalIcon className="size-[18px]" />
					</ButtonIcon>
				</div>
				{hasWalletAccess && (
					<DesktopUtilitiesMenu
						className="hidden max-[1181px]:inline-flex"
						disabled={isMarketLoading}
						onOpenSettings={openSettingsDialog}
					/>
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
				"cursor-default rounded-[8px] px-2.5 py-2 font-semibold whitespace-nowrap text-market-close-muted disabled:hover:bg-transparent disabled:hover:text-market-close-muted",
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
				"h-[34px] w-36 shrink-0 rounded-[10px] bg-market-close-hover max-[1181px]:w-32",
			)}
		/>
	);
}
