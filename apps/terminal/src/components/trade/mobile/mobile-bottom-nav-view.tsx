import type { Icon } from "@phosphor-icons/react";
import { type ComponentProps, Fragment, type ReactNode } from "react";
import { MOBILE_BOTTOM_NAV_HEIGHT_PX } from "@/config/layout";
import type { MobileTab } from "@/config/nav";
import { cn } from "@/lib/cn";

export const nav = "relative z-50 shrink-0 bg-surface border-t border-trading-panel-stroke-card";
export const navSafeArea = "pb-[env(safe-area-inset-bottom)]";
export const navInner = "flex items-stretch pl-[var(--sal)] pr-[var(--sar)]";
export const navItem = "flex-1 flex flex-col items-center justify-center gap-[3px] rounded-none px-1";
export const navLabel = "text-3xs tracking-wide";

const NAV_BADGE_MAX_COUNT = 99;
interface Item {
	id: MobileTab;
	label: string;
	icon: Icon;
}
interface Props {
	items: readonly Item[];
	ariaLabel: string;
	activeTab: MobileTab;
	onTabChange?: (tab: MobileTab) => void;
	badges?: Partial<Record<MobileTab, number>>;
	className?: string;
	renderItem?: (item: Item, props: ComponentProps<"button">) => ReactNode;
}
export function MobileBottomNavView({
	items,
	ariaLabel,
	activeTab,
	onTabChange,
	badges,
	className,
	renderItem,
}: Props) {
	return (
		<nav className={cn(nav, "[touch-action:pan-x_pinch-zoom]", navSafeArea, className)} aria-label={ariaLabel}>
			<div className={navInner}>
				{items.map((item) => {
					const isActive = activeTab === item.id;
					const badgeCount = badges?.[item.id];
					const showBadge = typeof badgeCount === "number" && badgeCount > 0;
					const Icon = item.icon;

					const props = {
						type: "button" as const,
						onClick: () => onTabChange?.(item.id),
						style: { minHeight: `${MOBILE_BOTTOM_NAV_HEIGHT_PX}px` },
						className: cn(navItem, isActive ? "text-trading-panel-fg" : "text-trading-panel-subtle"),
						"aria-current": isActive ? ("page" as const) : undefined,
						"aria-label": item.label,
						children: (
							<>
								<span className="relative">
									<Icon className="size-5" />
									{showBadge && (
										<span
											className={cn(
												"absolute -top-1 -right-2 min-w-4 h-4 px-1",
												"flex items-center justify-center",
												"rounded-full text-xs font-medium tabular-nums",
												"bg-action text-on-action",
											)}
										>
											{badgeCount > NAV_BADGE_MAX_COUNT ? `${NAV_BADGE_MAX_COUNT}+` : badgeCount}
										</span>
									)}
								</span>
								<span className={cn(navLabel, isActive ? "font-bold" : "font-medium")}>{item.label}</span>
							</>
						),
					};
					return <Fragment key={item.id}>{renderItem ? renderItem(item, props) : <button {...props} />}</Fragment>;
				})}
			</div>
		</nav>
	);
}
