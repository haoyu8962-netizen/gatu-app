import { Button, Dropdown } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { DownloadSimpleIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { GatuLogo } from "@/components/brand/gatu-logo";
import { DESKTOP_NAV_ITEMS, DESKTOP_NAV_LABELS } from "@/config/desktop-nav";
import {
	APP_BAR_BUTTON_HEIGHT_CLASS,
	DESKTOP_NAV_COMPACT_MEDIA_QUERY,
	DESKTOP_NAV_NARROW_MEDIA_QUERY,
} from "@/config/layout";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useTradeHomePath } from "@/hooks/trade/use-trade-home-path";
import { useMediaQuery } from "@/hooks/use-mobile";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { createLazyComponent, preloadLazyComponents } from "@/lib/lazy";
import { isDesktopNavItemActive, resolveDesktopNavLayout } from "@/lib/navigation/desktop-nav";
import { useRenderCommitTrack } from "@/lib/performance/render-profile";
import { useDepositModalActions, useSettingsDialogActions } from "@/stores/use-global-modal-store";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { DesktopUtilitiesMenu } from "./desktop-utilities-menu";
import { HEADER_ICON_BUTTON_CLASS, HeaderIconButtonView } from "./header-icon-button-view";
import { LanguageSwitcher } from "./language-switcher";
import { DESKTOP_LANGUAGE_TRIGGER_CLASS, NavMenuTriggerView } from "./nav-menu-trigger-view";
import { ThemeToggle } from "./theme-toggle";
import {
	TOP_NAV_CONNECTED_WORDMARK_CLASS,
	TOP_NAV_DEPOSIT_CLASS,
	TOP_NAV_DEPOSIT_LABEL_CLASS,
	TOP_NAV_LOGO_CLASS,
	TOP_NAV_MARK_CLASS,
	TOP_NAV_WORDMARK_CLASS,
	TopNavView,
} from "./top-nav-view";

const UserMenu = createLazyComponent(() => import("./user-menu"), "UserMenu");

export function preloadTopNav(): Promise<void> {
	return preloadLazyComponents([UserMenu]);
}

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

	const compact = useMediaQuery(DESKTOP_NAV_COMPACT_MEDIA_QUERY);
	const narrow = useMediaQuery(DESKTOP_NAV_NARROW_MEDIA_QUERY);
	const layout = resolveDesktopNavLayout({ compact, narrow, connected: hasWalletAccess });
	const soonLabel = t(DESKTOP_NAV_LABELS.soon);
	const items = layout.topLevel.map((item) => ({
		id: item.id,
		label: t(item.label),
		soon: "soon" in item && item.soon === true,
		soonLabel,
		active: isDesktopNavItemActive(item, pathname),
	}));
	const moreItems = layout.more.map((item) => {
		const label = t(item.label);
		if ("href" in item) return { label, href: item.href, target: "_blank" as const, rel: "noopener noreferrer" };
		if (!("path" in item)) return { label: `${label} — ${soonLabel}`, disabled: true };
		const destination = item.path;
		return {
			label,
			active: isDesktopNavItemActive(item, pathname),
			onSelect: () => void navigate({ to: destination }),
		};
	});
	const moreActive = layout.more.some((item) => isDesktopNavItemActive(item, pathname));
	return (
		<TopNavView
			items={items}
			renderItem={(item, className) => {
				if (item.id === "trade")
					return (
						<Link
							to={tradeHomePath}
							search={{ scope: "all" }}
							aria-current={item.active ? "page" : undefined}
							className={className}
						>
							{item.label}
						</Link>
					);
				const entry = DESKTOP_NAV_ITEMS.find((candidate) => candidate.id === item.id);
				const destination = entry && "path" in entry ? entry.path : undefined;
				if (!destination) return null;
				return (
					<Link to={destination} aria-current={item.active ? "page" : undefined} className={className}>
						{item.label}
					</Link>
				);
			}}
			moreLabel={t(DESKTOP_NAV_LABELS.more)}
			navigationLabel={t(DESKTOP_NAV_LABELS.primary)}
			bannerOffset={isTestnet}
			connected={hasWalletAccess}
			compactHiddenWhenConnected={hasWalletAccess && !isMarketLoading}
			logo={
				<Link to={tradeHomePath} search={{ scope: "all" }} aria-label="GATU" className={TOP_NAV_LOGO_CLASS}>
					<GatuLogo className={cn(TOP_NAV_WORDMARK_CLASS, hasWalletAccess && TOP_NAV_CONNECTED_WORDMARK_CLASS)} />
					{hasWalletAccess ? <GatuLogo variant="mark" micro className={TOP_NAV_MARK_CLASS} /> : null}
				</Link>
			}
			moreTrigger={
				<Dropdown
					align="start"
					size="md"
					triggerVariant="minimal"
					triggerAriaLabel={t(DESKTOP_NAV_LABELS.more)}
					renderTrigger={<NavMenuTriggerView label={t(DESKTOP_NAV_LABELS.more)} active={moreActive} />}
					popupClassName="max-h-[calc(100vh-4.5rem)] min-w-[148px] rounded-[10px] border-market-close-stroke-card bg-overlay p-1 font-market-close shadow-overlay [&_[role=menuitem]]:rounded-[7px] [&_[role=menuitem]]:px-3 [&_[role=menuitem]]:py-[9px] [&_[role=menuitem]]:text-[13px] [&_[role=menuitem]]:leading-[18px] [&_[role=menuitem]]:font-medium"
					items={moreItems}
				/>
			}
			pairing={
				showsDepositEntry && (
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
						className={cn(APP_BAR_BUTTON_HEIGHT_CLASS, TOP_NAV_DEPOSIT_CLASS)}
					>
						<span className={TOP_NAV_DEPOSIT_LABEL_CLASS}>
							{depositAvailability.available ? <Trans>Deposit</Trans> : depositAvailability.unavailableLabel}
						</span>
					</Button>
				)
			}
			wallet={
				<Suspense key="user-menu" fallback={null}>
					<UserMenu variant="desktop-nav" />
				</Suspense>
			}
			theme={<ThemeToggle className={HEADER_ICON_BUTTON_CLASS} iconClassName="size-[18px]" />}
			language={<LanguageSwitcher showLabel compactLabel className={DESKTOP_LANGUAGE_TRIGGER_CLASS} />}
			settings={
				<HeaderIconButtonView
					className={HEADER_ICON_BUTTON_CLASS}
					disabled={isMarketLoading}
					onClick={isMarketLoading ? undefined : openSettingsDialog}
					aria-label={t(DESKTOP_NAV_LABELS.settings)}
				>
					<SlidersHorizontalIcon className="size-[18px]" />
				</HeaderIconButtonView>
			}
			compactUtilities={
				hasWalletAccess && <DesktopUtilitiesMenu disabled={isMarketLoading} onOpenSettings={openSettingsDialog} />
			}
		/>
	);
}
