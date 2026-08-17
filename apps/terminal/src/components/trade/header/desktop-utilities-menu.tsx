import { Button, ButtonIcon } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { DotsThreeVerticalIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";

interface Props {
	className?: string;
	onOpenSettings: () => void;
}

export function DesktopUtilitiesMenu({ className, onOpenSettings }: Props) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);

	function handleOpenSettings() {
		setOpen(false);
		onOpenSettings();
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<ButtonIcon
					variant="ghost"
					intent="neutral"
					className={cn(
						"size-[34px] rounded-[10px] text-market-close-muted hover:bg-market-close-hover hover:text-market-close-fg",
						className,
					)}
					aria-label={t`More`}
				>
					<DotsThreeVerticalIcon className="size-[18px]" weight="bold" />
				</ButtonIcon>
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
					className="h-9 w-full justify-start rounded-[8px] px-3 font-market-close text-[13px] leading-[18px] font-medium text-market-close-fg shadow-none hover:bg-market-close-hover"
					onClick={handleOpenSettings}
					iconLeft={<SlidersHorizontalIcon className="size-[18px] text-market-close-muted" />}
				>
					<Trans>Settings</Trans>
				</Button>
			</PopoverContent>
		</Popover>
	);
}
