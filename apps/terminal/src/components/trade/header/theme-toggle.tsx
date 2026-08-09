import { ButtonIcon } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { ClientOnly } from "@tanstack/react-router";
import { cn } from "@/lib/cn";
import { useSetTheme, useTheme } from "@/stores/use-global-settings-store";

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
	const theme = useTheme();
	const setTheme = useSetTheme();

	const isDark = theme === "dark";

	return (
		<ButtonIcon
			variant="ghost"
			intent="neutral"
			className={cn(
				"size-8 shrink-0",
				isDark ? "text-warning hover:text-warning/80" : "text-brand hover:text-brand/80",
				className,
			)}
			onClick={() => setTheme(isDark ? "light" : "dark")}
			aria-label={isDark ? t`Switch to light mode` : t`Switch to dark mode`}
		>
			{isDark ? (
				<SunIcon className={cn("size-4", iconClassName)} />
			) : (
				<MoonIcon className={cn("size-4", iconClassName)} />
			)}
		</ButtonIcon>
	);
}
