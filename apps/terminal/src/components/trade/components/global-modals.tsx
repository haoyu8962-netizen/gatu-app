import { Suspense, useEffect } from "react";
import { createLazyComponent } from "@/lib/lazy";
import { useCommandMenuActions, useGlobalModalType } from "@/stores/use-global-modal-store";

const DepositModal = createLazyComponent(() => import("../tradebox/deposit-modal"), "DepositModal");
const GlobalSettingsModal = createLazyComponent(() => import("./global-settings-modal"), "GlobalSettingsModal");
const SpotSwapModal = createLazyComponent(() => import("./spot-swap-modal"), "SpotSwapModal");
const CommandMenu = createLazyComponent(() => import("./command-menu"), "CommandMenu");

export function GlobalModals() {
	const activeModal = useGlobalModalType();
	const { open: openCommandMenu, close: closeCommandMenu } = useCommandMenuActions();

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key !== "k" || (!e.metaKey && !e.ctrlKey)) return;
			e.preventDefault();
			if (activeModal === "commandMenu") {
				closeCommandMenu();
			} else {
				openCommandMenu();
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [activeModal, closeCommandMenu, openCommandMenu]);

	if (!activeModal) return null;

	return (
		<Suspense fallback={null}>
			{activeModal === "deposit" && <DepositModal />}
			{activeModal === "settings" && <GlobalSettingsModal />}
			{activeModal === "swap" && <SpotSwapModal />}
			{activeModal === "commandMenu" && <CommandMenu />}
		</Suspense>
	);
}
