import { useEffect } from "react";
import { createLazyComponent, preloadLazyComponents } from "@/lib/lazy";
import { registerDepositModalWarmUp } from "./deposit-modal-intent";

function importDepositModal() {
	return import("../tradebox/deposit-modal");
}

export const DepositModal = createLazyComponent(importDepositModal, "DepositModal");
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

let depositModalWarmed = false;

/**
 * The deposit dialog is the largest global modal chunk, so it is not downloaded on a timer. It is
 * warmed on intent instead, when the pointer, a press or focus first reaches a control that opens it,
 * so the click normally mounts the dialog directly and the chunk fallback stays a rare case.
 *
 * The warm-up imports the module itself and hands it to the lazy component only once it has loaded.
 * `createLazyComponent` keeps a failed load and answers the next render with an error or a page
 * reload, so a failed warm-up must not reach it: it is forgotten, the next intent tries again, and a
 * click behaves as if nothing had been warmed.
 */
export function warmDepositModal(): void {
	if (depositModalWarmed) return;
	depositModalWarmed = true;
	void importDepositModal().then(
		() => DepositModal.preload?.(),
		() => {
			depositModalWarmed = false;
		},
	);
}

registerDepositModalWarmUp(warmDepositModal);

/**
 * Warms the lazy modal chunks after the surface has settled, so the first open of a global modal
 * mounts its content directly instead of showing the shared Suspense fallback for React's minimum
 * 300 ms. Deposit is warmed on intent by `warmDepositModal` instead.
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
