import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { MOBILE_BOTTOM_NAV_HEIGHT_PX } from "@/config/layout";
import { MOBILE_NAV_ITEMS, type MobileTab } from "@/config/nav";
import { cn } from "@/lib/cn";
import { MobileBottomNavView } from "./mobile-bottom-nav-view";

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
		<MobileBottomNavView
			items={MOBILE_NAV_ITEMS.map((item) => ({ ...item, label: _(item.label) }))}
			ariaLabel={_(msg`Primary navigation`)}
			renderItem={(_item, props) => <button {...props} />}
			activeTab={activeTab}
			onTabChange={onTabChange}
			badges={badges}
			className={className}
		/>
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
