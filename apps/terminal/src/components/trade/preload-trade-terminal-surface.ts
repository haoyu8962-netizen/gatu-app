import { MOBILE_MEDIA_QUERY } from "@/hooks/use-mobile";
import { preloadDesktopTerminalSurface } from "./layout/desktop-terminal-surface";
import { preloadGlobalModals } from "./trade-terminal-page";

function matchesMobileViewport(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia(MOBILE_MEDIA_QUERY).matches
	);
}

/**
 * Starts resolving every lazy piece of the first terminal render. Lives outside the page chunk so
 * the boot helper does not count against the `trade-terminal-page` surface budget.
 */
export function preloadTradeTerminalSurface(): void {
	preloadGlobalModals();
	if (matchesMobileViewport()) return;
	preloadDesktopTerminalSurface();
}
