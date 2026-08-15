import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { MOBILE_BOTTOM_NAV_HEIGHT_PX } from "@/config/layout";
import { MOBILE_NAV_ITEMS, type MobileTab } from "@/config/nav";
import { cn } from "@/lib/cn";

const NAV_BADGE_MAX_COUNT = 99;

export type { MobileTab };

interface Props {
	activeTab: MobileTab;
	onTabChange: (tab: MobileTab) => void;
	badges?: Partial<Record<MobileTab, number>>;
	className?: string;
}

export function MobileBottomNav({ activeTab, onTabChange, badges, className }: Props) {
	const { _ } = useLingui();

	return (
		<nav
			className={cn(
				"relative z-50 shrink-0 bg-surface border-t border-trading-panel-stroke-card",
				"[touch-action:pan-x_pinch-zoom]",
				"pb-[env(safe-area-inset-bottom)]",
				className,
			)}
			aria-label={_(msg`Primary navigation`)}
		>
			<div className="flex items-stretch">
				{MOBILE_NAV_ITEMS.map((item) => {
					const isActive = activeTab === item.id;
					const badgeCount = badges?.[item.id];
					const showBadge = typeof badgeCount === "number" && badgeCount > 0;
					const Icon = item.icon;

					return (
						<button
							key={item.id}
							type="button"
							onClick={() => onTabChange(item.id)}
							style={{ minHeight: `${MOBILE_BOTTOM_NAV_HEIGHT_PX}px` }}
							className={cn(
								"flex-1 flex flex-col items-center justify-center gap-[3px] rounded-none px-1",
								isActive ? "text-trading-panel-fg" : "text-trading-panel-subtle",
							)}
							aria-current={isActive ? "page" : undefined}
							aria-label={_(item.label)}
						>
							<span className="relative">
								<Icon className="size-5" />
								{showBadge && (
									<span
										className={cn(
											"absolute -top-1 -right-2 min-w-4 h-4 px-1",
											"flex items-center justify-center",
											"rounded-full text-xs font-medium tabular-nums",
											"bg-brand text-fg-inverse",
										)}
									>
										{badgeCount > NAV_BADGE_MAX_COUNT ? `${NAV_BADGE_MAX_COUNT}+` : badgeCount}
									</span>
								)}
							</span>
							<span className={cn("text-3xs tracking-wide", isActive ? "font-bold" : "font-medium")}>
								{_(item.label)}
							</span>
						</button>
					);
				})}
			</div>
		</nav>
	);
}

export function MobileBottomNavSpacer({ className }: { className?: string }) {
	return (
		<div
			style={{ height: `calc(${MOBILE_BOTTOM_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom))` }}
			className={cn("shrink-0", className)}
			aria-hidden="true"
		/>
	);
}
