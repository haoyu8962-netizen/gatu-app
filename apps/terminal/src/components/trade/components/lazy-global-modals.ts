import { useEffect } from "react";
import { createLazyComponent, preloadLazyComponents } from "@/lib/lazy";

export const DepositModal = createLazyComponent(() => import("../tradebox/deposit-modal"), "DepositModal");
export const GlobalSettingsModal = createLazyComponent(() => import("./global-settings-modal"), "GlobalSettingsModal");
export const SpotSwapModal = createLazyComponent(() => import("./spot-swap-modal"), "SpotSwapModal");
export const CommandMenu = createLazyComponent(() => import("./command-menu"), "CommandMenu");
export const TransferModal = createLazyComponent(() => import("../positions/transfer-modal"), "TransferModal");
export const SendModal = createLazyComponent(() => import("../positions/send-modal"), "SendModal");
export const PositionMarketCloseModal = createLazyComponent(
	() => import("../positions/position-market-close-modal"),
	"PositionMarketCloseModal",
);

export const PositionDialogHost = createLazyComponent(
	() => import("../positions/position-dialog-host"),
	"PositionDialogHost",
);

export type PreloadableGlobalModal = "deposit" | "settings";

const preloaders: Record<PreloadableGlobalModal, () => Promise<unknown>> = {
	deposit: () => Promise.resolve(DepositModal.preload?.()),
	settings: () => Promise.resolve(GlobalSettingsModal.preload?.()),
};

export async function preloadGlobalModal(modal: PreloadableGlobalModal): Promise<void> {
	await preloaders[modal]();
}

/**
 * Warms the lazy modal chunks after the surface has settled, so the first open of a global modal
 * mounts its content directly instead of showing the shared Suspense fallback for React's minimum
 * 300 ms. Deposit keeps its dedicated fallback and is not warmed here.
 */
export function useIdleGlobalModalPreload(includePositionMarketClose: boolean): void {
	useEffect(() => {
		if (typeof window === "undefined") return;

		const browserWindow = window;
		function preload() {
			void preloadLazyComponents([
				GlobalSettingsModal,
				SpotSwapModal,
				CommandMenu,
				TransferModal,
				SendModal,
				...(includePositionMarketClose ? [PositionMarketCloseModal, PositionDialogHost] : []),
			]);
		}
		if (browserWindow.requestIdleCallback) {
			const idleId = browserWindow.requestIdleCallback(preload, { timeout: 2_000 });
			return () => browserWindow.cancelIdleCallback(idleId);
		}

		const timeoutId = browserWindow.setTimeout(preload, 1_000);
		return () => browserWindow.clearTimeout(timeoutId);
	}, [includePositionMarketClose]);
}
