import { createLazyComponent } from "@/lib/lazy";

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

export type PreloadableGlobalModal = "deposit" | "settings";

const preloaders: Record<PreloadableGlobalModal, () => Promise<unknown>> = {
	deposit: () => Promise.resolve(DepositModal.preload?.()),
	settings: () => Promise.resolve(GlobalSettingsModal.preload?.()),
};

export async function preloadGlobalModal(modal: PreloadableGlobalModal): Promise<void> {
	await preloaders[modal]();
}
