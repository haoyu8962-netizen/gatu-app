import { useLingui } from "@lingui/react/macro";
import { GearIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { GatuLogo } from "@/components/brand/gatu-logo";
import { headerLanguage, headerLogo, headerSettings } from "@/components/trade/mobile/mobile-header-view";
import { BRAND_NAME } from "@/config/brand";
import { useTradeHomePath } from "@/hooks/trade/use-trade-home-path";
import { useSettingsDialogActions } from "@/stores/use-global-modal-store";
import { HeaderIconButtonView } from "../header/header-icon-button-view";
import { LanguageSwitcher } from "../header/language-switcher";
import { UserMenu } from "../header/user-menu";
import { MobileHeaderView } from "./mobile-header-view";
import { MobileNavDrawer } from "./mobile-nav-drawer";

interface Props {
	className?: string;
}

export function MobileHeader({ className }: Props) {
	const { t } = useLingui();
	const tradeHomePath = useTradeHomePath();
	const { open: openSettingsDialog } = useSettingsDialogActions();

	return (
		<MobileHeaderView
			className={className}
			drawer={<MobileNavDrawer />}
			logo={
				<Link
					to={tradeHomePath}
					search={{ scope: "all" }}
					aria-label={BRAND_NAME}
					data-brand-home-link=""
					className={headerLogo}
				>
					<GatuLogo variant="mark" micro className="size-[22px]" />
				</Link>
			}
			account={<UserMenu />}
			language={<LanguageSwitcher sideOffset={14} alignOffset={-36} className={headerLanguage} />}
			settings={
				<HeaderIconButtonView className={headerSettings} onClick={openSettingsDialog} aria-label={t`Settings`}>
					<GearIcon className="size-4.5" />
				</HeaderIconButtonView>
			}
		/>
	);
}
