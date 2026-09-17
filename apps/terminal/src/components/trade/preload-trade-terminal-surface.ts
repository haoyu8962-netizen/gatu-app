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
 * Resolves every lazy piece of the first terminal render and settles once they are all loaded.
 * Lives outside the page chunk so the boot helper does not count against the `trade-terminal-page`
 * surface budget.
 */
export function preloadTradeTerminalSurface(): Promise<void> {
	const modals = preloadGlobalModals();
	if (matchesMobileViewport()) return modals;
	return Promise.all([modals, preloadDesktopTerminalSurface()]).then(() => undefined);
}
