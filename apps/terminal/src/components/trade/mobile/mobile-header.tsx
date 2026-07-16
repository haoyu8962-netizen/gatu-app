import { ButtonIcon } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { GearIcon } from "@phosphor-icons/react";
import { APP_HEADER_HEIGHT_CLASS } from "@/config/layout";
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
	const { open: openSettingsDialog } = useSettingsDialogActions();

	return (
		<header
			className={cn(
				"pt-[env(safe-area-inset-top)]",
				"sticky top-0 z-40 bg-surface/95 backdrop-blur-sm",
				"border-b border-stroke-weak/60",
				className,
			)}
		>
			<div className={cn(APP_HEADER_HEIGHT_CLASS, "px-2 flex items-center justify-between")}>
				<div className="flex items-center gap-1">
					<MobileNavDrawer />
					<img src="/icon.svg" alt="gatu" className="size-6 rounded-8" />
				</div>

				<div className="flex items-center gap-0.5">
					<UserMenu />
					<ThemeToggle />
					<LanguageSwitcher />
					<ButtonIcon
						variant="ghost"
						intent="neutral"
						size="md"
						className="touch-target"
						aria-label={t`Settings`}
						onClick={openSettingsDialog}
					>
						<GearIcon className="size-4" />
					</ButtonIcon>
				</div>
			</div>
		</header>
	);
}
