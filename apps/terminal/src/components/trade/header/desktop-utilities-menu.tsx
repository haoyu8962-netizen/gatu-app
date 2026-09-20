import { Button } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { DotsThreeVerticalIcon, QrCodeIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DESKTOP_NAV_LABELS } from "@/config/desktop-nav";
import { cn } from "@/lib/cn";
import { menuPopupSurfaceClass } from "@/lib/ui/menu-popup-skin";
import { HEADER_ICON_BUTTON_CLASS, HeaderIconButtonView } from "./header-icon-button-view";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";

const UTILITY_ROW_BUTTON_CLASS =
	"h-9 w-full justify-start rounded-16 px-3 font-market-close text-2sm font-medium text-trading-panel-fg shadow-none hover:bg-trading-panel-hover";
const UTILITY_ROW_CLASS =
	"flex items-center justify-between rounded-16 px-3 py-1 text-2sm font-medium text-trading-panel-fg";
const UTILITY_ROW_CONTROL_CLASS =
	"size-9 rounded-20 text-trading-panel-muted hover:bg-trading-panel-hover hover:text-trading-panel-fg";

interface Props {
	className?: string;
	settingsDisabled?: boolean;
	onOpenSettings: () => void;
	linkMobileVisible?: boolean;
	linkMobileDisabled?: boolean;
	onLinkMobile?: () => void;
}

export function DesktopUtilitiesMenu({
	className,
	settingsDisabled = false,
	onOpenSettings,
	linkMobileVisible = false,
	linkMobileDisabled = false,
	onLinkMobile,
}: Props) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);

	function handleOpenSettings() {
		if (settingsDisabled) return;
		setOpen(false);
		onOpenSettings();
	}

	function handleLinkMobile() {
		if (linkMobileDisabled || !onLinkMobile) return;
		setOpen(false);
		onLinkMobile();
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<HeaderIconButtonView
					className={cn(HEADER_ICON_BUTTON_CLASS, className)}
					aria-label={t(DESKTOP_NAV_LABELS.utilities)}
				>
					<DotsThreeVerticalIcon className="size-[18px]" weight="bold" />
				</HeaderIconButtonView>
			</PopoverTrigger>
			<PopoverContent align="end" sideOffset={6} className={cn(menuPopupSurfaceClass, "w-52")}>
				<div className={UTILITY_ROW_CLASS}>
					<span>
						<Trans>Display</Trans>
					</span>
					<ThemeToggle className={UTILITY_ROW_CONTROL_CLASS} iconClassName="size-[18px]" />
				</div>
				<div className={UTILITY_ROW_CLASS}>
					<span>
						<Trans>Language</Trans>
					</span>
					<LanguageSwitcher className={UTILITY_ROW_CONTROL_CLASS} />
				</div>
				{linkMobileVisible && (
					<Button
						variant="ghost"
						intent="neutral"
						size="sm"
						disabled={linkMobileDisabled}
						className={UTILITY_ROW_BUTTON_CLASS}
						onClick={linkMobileDisabled ? undefined : handleLinkMobile}
						iconLeft={<QrCodeIcon className="size-[18px] text-trading-panel-muted" />}
					>
						<Trans>Link mobile device</Trans>
					</Button>
				)}
				<Button
					variant="ghost"
					intent="neutral"
					size="sm"
					disabled={settingsDisabled}
					className={UTILITY_ROW_BUTTON_CLASS}
					onClick={settingsDisabled ? undefined : handleOpenSettings}
					iconLeft={<SlidersHorizontalIcon className="size-[18px] text-trading-panel-muted" />}
				>
					<Trans>Settings</Trans>
				</Button>
			</PopoverContent>
		</Popover>
	);
}
