import { ButtonIcon } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { GearIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { GatuLogo } from "@/components/brand/gatu-logo";
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
			className={cn(
				"pt-[env(safe-area-inset-top)]",
				"sticky top-0 z-40 bg-surface",
				"border-b border-trading-panel-stroke-card",
				className,
			)}
		>
			<div
				data-slot="mobile-header-inner"
				className="flex h-14 items-center gap-2 pl-[max(0.625rem,var(--sal))] pr-[max(0.625rem,var(--sar))]"
			>
				<div data-slot="mobile-header-brand" className="flex shrink-0 items-center gap-1.5">
					<MobileNavDrawer />
					<Link
						to={tradeHomePath}
						search={{ scope: "all" }}
						aria-label="GATU"
						className="touch-target grid shrink-0 place-items-center rounded-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus max-[359px]:hidden"
					>
						<GatuLogo variant="mark" micro className="size-[22px]" />
					</Link>
				</div>

				<div
					data-slot="mobile-header-actions"
					className="ms-auto flex min-w-0 flex-1 items-center justify-end gap-1 min-[360px]:gap-2"
				>
					<div
						data-slot="mobile-header-account"
						className="flex min-w-0 flex-1 justify-end [&_button]:h-11 [&_button]:min-h-11 [&_button]:min-w-0 [&_button]:rounded-8 [&_button]:border-trading-panel-stroke-card [&_button]:px-2.5 [&_button]:text-xs"
					>
						<UserMenu />
					</div>
					<ThemeToggle
						className="size-11 min-h-11 text-trading-panel-muted hover:text-trading-panel-fg"
						iconClassName="size-4.5"
					/>
					<LanguageSwitcher
						sideOffset={14}
						alignOffset={-36}
						className="size-11 min-h-11 text-market-close-muted hover:text-market-close-fg"
					/>
					<ButtonIcon
						variant="ghost"
						intent="neutral"
						className="size-11 min-h-11 shrink-0 text-trading-panel-muted hover:text-trading-panel-fg"
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
