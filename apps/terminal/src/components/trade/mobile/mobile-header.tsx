import { ButtonIcon } from "@hypeterminal/ui";
import { BellIcon, GearIcon } from "@phosphor-icons/react";
import { UI_TEXT } from "@/config/constants";
import { cn } from "@/lib/cn";
import { useSettingsDialogActions } from "@/stores/use-global-modal-store";
import { ThemeToggle } from "../header/theme-toggle";
import { UserMenu } from "../header/user-menu";
import { MobileNavDrawer } from "./mobile-nav-drawer";

const TOP_NAV_TEXT = UI_TEXT.TOP_NAV;

interface Props {
	className?: string;
}

export function MobileHeader({ className }: Props) {
	const { open: openSettingsDialog } = useSettingsDialogActions();

	return (
		<header
			className={cn(
				"pt-[env(safe-area-inset-top)]",
				"sticky top-0 z-40 bg-bg-raised/95 backdrop-blur-sm",
				"border-b border-stroke-weak/60",
				className,
			)}
		>
			<div className="h-12 px-3 flex items-center justify-between">
				<MobileNavDrawer />

				<div className="flex items-center gap-1">
					<UserMenu />
					<ButtonIcon variant="ghost" intent="neutral" size="md" aria-label={TOP_NAV_TEXT.NOTIFICATIONS_ARIA}>
						<BellIcon className="size-4" />
					</ButtonIcon>
					<ThemeToggle />
					<ButtonIcon
						variant="ghost"
						intent="neutral"
						size="md"
						aria-label={TOP_NAV_TEXT.SETTINGS_ARIA}
						onClick={openSettingsDialog}
					>
						<GearIcon className="size-4" />
					</ButtonIcon>
				</div>
			</div>
		</header>
	);
}
