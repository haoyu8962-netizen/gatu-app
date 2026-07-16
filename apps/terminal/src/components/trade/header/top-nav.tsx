import { Button, ButtonIcon, Divider } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { DownloadSimpleIcon, GearIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { APP_BAR_BUTTON_HEIGHT_CLASS, APP_HEADER_HEIGHT_CLASS } from "@/config/layout";
import { DEFAULT_SELECTED_MARKETS } from "@/config/markets";
import { SCOPE_NAV_ITEMS, STATIC_NAV_ITEMS } from "@/config/nav";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { useMarketsInfo } from "@/lib/hyperliquid";
import { getTradePathForMarket, getTradePathForMarketName } from "@/lib/hyperliquid/market-route";
import { getExchangeDexForMarket } from "@/lib/hyperliquid/market-scope";
import { createLazyComponent } from "@/lib/lazy";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useDepositModalActions, useSettingsDialogActions } from "@/stores/use-global-modal-store";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { useMarketActions, useSelectedMarkets } from "@/stores/use-market-store";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";

const UserMenu = createLazyComponent(() => import("./user-menu"), "UserMenu");

function getScopeAccentClass(scope: string): string {
	switch (scope) {
		case "perp":
			return "border-scope-perp/40";
		case "spot":
			return "border-scope-spot/40";
		case "builders-perp":
			return "border-scope-builders/40";
		default:
			return "border-stroke-weak";
	}
}

export function TopNav() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openSettingsDialog } = useSettingsDialogActions();
	const { isConnected, sessionMode } = useWalletSession();
	const { marketName, scope, setScope } = useExchangeScope();
	const selectedMarkets = useSelectedMarkets();
	const { setSelectedMarket } = useMarketActions();
	const { getMarketInfo } = useMarketsInfo();
	const isTestnet = useIsTestnet();
	const { tradeRestricted } = useGeoRestriction();

	const accentClass = getScopeAccentClass(scope);
	const currentMarketName = marketName ?? selectedMarkets[scope] ?? selectedMarkets.all;

	function handleScopeNavigation(item: (typeof SCOPE_NAV_ITEMS)[number]) {
		const targetMarketName =
			item.scope === "all" ? currentMarketName : (selectedMarkets[item.scope] ?? DEFAULT_SELECTED_MARKETS[item.scope]);
		const targetMarket = getMarketInfo(targetMarketName);
		const resolvedMarketName = targetMarket?.name ?? targetMarketName;
		const targetPath = targetMarket ? getTradePathForMarket(targetMarket) : getTradePathForMarketName(targetMarketName);

		setScope(
			item.scope,
			item.scope === "builders-perp" && targetMarket ? getExchangeDexForMarket(targetMarket) : undefined,
			resolvedMarketName,
		);
		setSelectedMarket(item.scope, resolvedMarketName);
		setSelectedMarket("all", resolvedMarketName);
		void navigate({ to: targetPath, resetScroll: false });
	}

	return (
		<header
			className={cn(
				APP_HEADER_HEIGHT_CLASS,
				"fixed left-0 right-0 z-40 border-b border-stroke-weak px-3 flex items-center justify-between bg-background transition-[border-color] duration-300 ease-in-out",
				isTestnet ? "top-8" : "top-0",
				accentClass,
			)}
		>
			<div className="flex items-center gap-3 min-w-0">
				<div className="flex items-center gap-1.5">
					<img src="/icon.svg" alt="gatu" className="size-5 rounded-8" />
					<span className="text-xs font-bold tracking-tight">
						<span className="text-brand">ga</span>
						<span className="text-fg">tu</span>
					</span>
				</div>
				<Divider orientation="vertical" className="my-2 hidden lg:block" />
				<nav className="hidden lg:flex items-center text-xs tracking-wide">
					{SCOPE_NAV_ITEMS.map((item) => (
						<button
							key={item.scope}
							type="button"
							onClick={() => handleScopeNavigation(item)}
							aria-pressed={scope === item.scope}
							className={cn(
								"cursor-pointer px-2.5 py-1 rounded-8 transition-colors duration-150",
								scope === item.scope ? item.activeClass : "text-fg-muted hover:text-fg",
							)}
						>
							{item.label}
						</button>
					))}
					<Divider orientation="vertical" className="my-2 mx-1" />
					{STATIC_NAV_ITEMS.map((item) => (
						<button
							key={item.key}
							type="button"
							disabled
							className="px-2.5 py-1.5 text-fg-disabled cursor-not-allowed"
							tabIndex={-1}
						>
							{item.label}
						</button>
					))}
				</nav>
			</div>

			<div className="flex items-center gap-2 min-h-8">
				{isConnected && sessionMode === "wallet" && !tradeRestricted && (
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
