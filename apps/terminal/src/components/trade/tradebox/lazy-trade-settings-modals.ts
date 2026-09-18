import { createRetryableLazyComponent, preloadLazyComponents } from "@/lib/lazy";

export const MarginModeModal = createRetryableLazyComponent(() => import("./margin-mode-modal"), "MarginModeModal");
export const LeverageModal = createRetryableLazyComponent(() => import("./leverage-modal"), "LeverageModal");
export const AccountModeModal = createRetryableLazyComponent(() => import("./account-mode-modal"), "AccountModeModal");

const MOBILE_MODALS = [MarginModeModal];
const DESKTOP_MODALS = [MarginModeModal, LeverageModal, AccountModeModal];
const warmedSurfaces = new Set<"desktop" | "mobile">();

/**
 * The margin, leverage and account-mode dialogs only render after their first open, so their code
 * stays out of the trade startup chunks. They are warmed on intent, when the pointer or focus first
 * reaches the order form, not on a timer: a download that every load performs would still be startup
 * weight. They never reload the page on a failed import because the order form keeps an unsent draft.
 * The mobile order form reaches leverage and account mode through the margin dialog.
 */
export function warmTradeSettingsModals(surface: "desktop" | "mobile"): void {
	if (warmedSurfaces.has(surface)) return;
	warmedSurfaces.add(surface);
	void preloadLazyComponents(surface === "desktop" ? DESKTOP_MODALS : MOBILE_MODALS);
}
