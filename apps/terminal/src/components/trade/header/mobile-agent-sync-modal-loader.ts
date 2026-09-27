import { createLazyComponent } from "@/lib/lazy";
import { loadUserMenuModalModule } from "./user-menu-modal-load";

function createMobileAgentSyncModalComponent() {
	return createLazyComponent(
		() => loadUserMenuModalModule(() => import("../components/mobile-agent-sync-modal")),
		"MobileAgentSyncModal",
	);
}

// Kept across UserMenu remounts; replaced only after a tagged import failure so a retry re-fetches.
let MobileAgentSyncModal = createMobileAgentSyncModalComponent();

export function getMobileAgentSyncModalComponent() {
	return MobileAgentSyncModal;
}

export function resetMobileAgentSyncModalComponent() {
	MobileAgentSyncModal = createMobileAgentSyncModalComponent();
	return MobileAgentSyncModal;
}

/**
 * Warms the dialog chunk on intent (pointer or focus reaching the header icon) and gates the
 * click on it, so opening Link mobile device never shows a loading shell.
 */
export function preloadMobileAgentSyncModal(): Promise<void> {
	return MobileAgentSyncModal.preload?.() ?? Promise.resolve();
}
