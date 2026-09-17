import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const headerSafeArea = "pt-[env(safe-area-inset-top)]";
export const headerSurface = "sticky top-0 z-40 bg-surface";
export const headerBorder = "border-b border-trading-panel-stroke-card";
export const headerInner = "flex h-14 items-center gap-2 pl-[max(0.625rem,var(--sal))] pr-[max(0.625rem,var(--sar))]";
export const headerBrand = "flex shrink-0 items-center gap-1.5";
export const headerLogo =
	"touch-target grid shrink-0 place-items-center rounded-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus max-[359px]:hidden";
export const headerActions = "ms-auto flex min-w-0 flex-1 items-center justify-end gap-1 min-[360px]:gap-2";
export const headerAccount =
	"flex min-w-0 flex-1 justify-end [&_button]:h-11 [&_button]:min-h-11 [&_button]:min-w-0 [&_button]:rounded-8 [&_button]:border-trading-panel-stroke-card [&_button]:px-2.5 [&_button]:text-xs";
export const headerTheme = "size-11 min-h-11 text-trading-panel-muted hover:text-trading-panel-fg";
export const headerLanguage = "size-11 min-h-11 text-market-close-muted hover:text-market-close-fg";
export const headerSettings = "size-11 min-h-11 shrink-0 text-trading-panel-muted hover:text-trading-panel-fg";
export const buttonOutlineNeutralSm =
	"inline-flex items-center justify-center gap-1.5 font-semibold select-none rounded-8 border bg-transparent shadow-raised py-1.5 text-xs text-fg";
export const buttonIconGhostNeutralSm =
	"inline-flex items-center justify-center shrink-0 select-none rounded-8 bg-transparent text-fg";
export const headerWalletFrame =
	"h-11 min-h-11 min-w-0 max-w-full rounded-8 border-trading-panel-stroke-card px-2.5 text-xs";

interface Props {
	className?: string;
	drawer: ReactNode;
	logo: ReactNode;
	account: ReactNode;
	theme: ReactNode;
	language: ReactNode;
	settings: ReactNode;
}
export function MobileHeaderView({ className, drawer, logo, account, theme, language, settings }: Props) {
	return (
		<header className={cn(headerSafeArea, headerSurface, headerBorder, className)}>
			<div data-slot="mobile-header-inner" className={headerInner}>
				<div data-slot="mobile-header-brand" className={headerBrand}>
					{drawer}
					{logo}
				</div>
				<div data-slot="mobile-header-actions" className={headerActions}>
					<div data-slot="mobile-header-account" className={headerAccount}>
						{account}
					</div>
					{theme}
					{language}
					{settings}
				</div>
			</div>
		</header>
	);
}
