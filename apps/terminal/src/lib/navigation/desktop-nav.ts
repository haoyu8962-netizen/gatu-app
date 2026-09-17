import { DESKTOP_NAV_ITEMS, type DesktopNavItem } from "@/config/desktop-nav";
import { isTradeRoutePath } from "@/config/nav";

export interface DesktopNavLayoutInput {
	compact: boolean;
	narrow: boolean;
	connected: boolean;
}

export interface DesktopNavLayout {
	topLevel: readonly DesktopNavItem[];
	more: readonly DesktopNavItem[];
}

/**
 * Splits the desktop navigation into top-level entries and the More menu (ADR 0013). Lower-priority
 * entries collapse when the header is narrow, or when it is compact and a wallet is connected; Soon
 * placeholders leave the top level whenever the header is compact; `more` entries never surface.
 */
export function resolveDesktopNavLayout({ compact, narrow, connected }: DesktopNavLayoutInput): DesktopNavLayout {
	const lowerCollapsed = narrow || (compact && connected);
	const topLevel: DesktopNavItem[] = [];
	const more: DesktopNavItem[] = [];
	for (const item of DESKTOP_NAV_ITEMS) {
		if (isCollapsed(item, compact, lowerCollapsed)) more.push(item);
		else topLevel.push(item);
	}
	return { topLevel, more };
}

function isCollapsed(item: DesktopNavItem, compact: boolean, lowerCollapsed: boolean): boolean {
	if (item.placement === "more") return true;
	if (item.placement === "lower") return lowerCollapsed;
	return "soon" in item && item.soon === true && compact;
}

export function isDesktopNavItemActive(item: DesktopNavItem, pathname: string): boolean {
	if (item.id === "trade") return isTradeRoutePath(pathname);
	if (!("path" in item) || !item.path) return false;
	if (pathname === item.path) return true;
	return "matchPrefix" in item && item.matchPrefix === true && pathname.startsWith(`${item.path}/`);
}
