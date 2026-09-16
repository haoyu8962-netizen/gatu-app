import { ButtonIcon } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { GearIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { GatuLogo } from "@/components/brand/gatu-logo";
import * as mobileChrome from "@/components/trade/mobile/mobile-chrome-classes";
import { useTradeHomePath } from "@/hooks/trade/use-trade-home-path";
import { cn } from "@/lib/cn";
import { useSettingsDialogActions } from "@/stores/use-global-modal-store";
import { LanguageSwitcher } from "../header/language-switcher";
import { ThemeToggle } from "../header/theme-toggle";
import { UserMenu } from "../header/user-menu";
import { MobileNavDrawer } from "./mobile-nav-drawer";

interface Props {
	className?: string;
}

export function MobileHeader({ className }: Props) {
	const { t } = useLingui();
	const tradeHomePath = useTradeHomePath();
	const { open: openSettingsDialog } = useSettingsDialogActions();

	return (
		<header
			className={cn(mobileChrome.headerSafeArea, mobileChrome.headerSurface, mobileChrome.headerBorder, className)}
		>
			<div data-slot="mobile-header-inner" className={mobileChrome.headerInner}>
				<div data-slot="mobile-header-brand" className={mobileChrome.headerBrand}>
					<MobileNavDrawer />
					<Link to={tradeHomePath} search={{ scope: "all" }} aria-label="GATU" className={mobileChrome.headerLogo}>
						<GatuLogo variant="mark" micro className="size-[22px]" />
					</Link>
				</div>

				<div data-slot="mobile-header-actions" className={mobileChrome.headerActions}>
					<div data-slot="mobile-header-account" className={mobileChrome.headerAccount}>
						<UserMenu />
					</div>
					<ThemeToggle className={mobileChrome.headerTheme} iconClassName="size-4.5" />
					<LanguageSwitcher sideOffset={14} alignOffset={-36} className={mobileChrome.headerLanguage} />
					<ButtonIcon
						variant="ghost"
						intent="neutral"
						className={mobileChrome.headerSettings}
						onClick={openSettingsDialog}
						aria-label={t`Settings`}
					>
						<GearIcon className="size-4.5" />
					</ButtonIcon>
				</div>
			</div>
		</header>
	);
}
