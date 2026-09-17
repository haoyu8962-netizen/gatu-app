import { Button } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { DotsThreeVerticalIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DESKTOP_NAV_LABELS } from "@/config/desktop-nav";
import { cn } from "@/lib/cn";
import { HEADER_ICON_BUTTON_CLASS, HeaderIconButtonView } from "./header-icon-button-view";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";

interface Props {
	className?: string;
	settingsDisabled?: boolean;
	onOpenSettings: () => void;
}

export function DesktopUtilitiesMenu({ className, settingsDisabled = false, onOpenSettings }: Props) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);

	function handleOpenSettings() {
		if (settingsDisabled) return;
		setOpen(false);
		onOpenSettings();
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
			<PopoverContent
				align="end"
				sideOffset={6}
				className="w-52 rounded-[12px] border-market-close-stroke-card bg-overlay p-2 font-market-close shadow-overlay"
			>
				<div className="flex items-center justify-between rounded-[8px] px-3 py-1 text-[13px] leading-[18px] font-medium text-market-close-fg">
					<span>
						<Trans>Display</Trans>
					</span>
					<ThemeToggle
						className="size-[34px] rounded-[10px] text-market-close-muted hover:bg-market-close-hover hover:text-market-close-fg"
						iconClassName="size-[18px]"
					/>
				</div>
				<div className="flex items-center justify-between rounded-[8px] px-3 py-1 text-[13px] leading-[18px] font-medium text-market-close-fg">
					<span>
						<Trans>Language</Trans>
					</span>
					<LanguageSwitcher className="size-[34px] rounded-[10px] text-market-close-muted hover:bg-market-close-hover hover:text-market-close-fg" />
				</div>
				<Button
					variant="ghost"
					intent="neutral"
					size="sm"
					disabled={settingsDisabled}
					className="h-9 w-full justify-start rounded-[8px] px-3 font-market-close text-[13px] leading-[18px] font-medium text-market-close-fg shadow-none hover:bg-market-close-hover"
					onClick={settingsDisabled ? undefined : handleOpenSettings}
					iconLeft={<SlidersHorizontalIcon className="size-[18px] text-market-close-muted" />}
				>
					<Trans>Settings</Trans>
				</Button>
			</PopoverContent>
		</Popover>
	);
}
