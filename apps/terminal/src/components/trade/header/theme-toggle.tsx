import { useLingui } from "@lingui/react/macro";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { ClientOnly } from "@tanstack/react-router";
import { DESKTOP_NAV_LABELS } from "@/config/desktop-nav";
import { cn } from "@/lib/cn";
import { useSetTheme, useTheme } from "@/stores/use-global-settings-store";
import { HeaderIconButtonView } from "./header-icon-button-view";

interface Props {
	className?: string;
	iconClassName?: string;
}

export function ThemeToggle({ className, iconClassName }: Props) {
	return (
		<ClientOnly>
			<ThemeToggleButton className={className} iconClassName={iconClassName} />
		</ClientOnly>
	);
}

function ThemeToggleButton({ className, iconClassName }: Props) {
	const { t } = useLingui();
	const theme = useTheme();
	const setTheme = useSetTheme();

	const isDark = theme === "dark";

	return (
		<HeaderIconButtonView
			className={cn(
				"size-8 shrink-0 active:not-data-disabled:scale-100",
				isDark ? "text-warning hover:text-warning/80" : "text-fg-muted hover:text-fg",
				className,
			)}
			onClick={() => setTheme(isDark ? "light" : "dark")}
			aria-label={isDark ? t(DESKTOP_NAV_LABELS.light) : t(DESKTOP_NAV_LABELS.dark)}
		>
			{isDark ? (
				<SunIcon className={cn("size-4", iconClassName)} />
			) : (
				<MoonIcon className={cn("size-4", iconClassName)} />
			)}
		</HeaderIconButtonView>
	);
}
