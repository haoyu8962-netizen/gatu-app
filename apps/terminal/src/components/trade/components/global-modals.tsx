import { Suspense, useEffect } from "react";
import { type Hip3DisclaimerRequirement, useHip3DisclaimerRequirement } from "@/hooks/trade/use-hip3-disclaimer";
import { createLazyComponent } from "@/lib/lazy";
import {
	useCommandMenuActions,
	useGlobalModalType,
	useTransferModalActions,
	useTransferModalDirection,
} from "@/stores/use-global-modal-store";
import { Hip3DeployerDisclaimer } from "./hip3-deployer-disclaimer";

const DepositModal = createLazyComponent(() => import("../tradebox/deposit-modal"), "DepositModal");
const GlobalSettingsModal = createLazyComponent(() => import("./global-settings-modal"), "GlobalSettingsModal");
const SpotSwapModal = createLazyComponent(() => import("./spot-swap-modal"), "SpotSwapModal");
const CommandMenu = createLazyComponent(() => import("./command-menu"), "CommandMenu");
const TransferModal = createLazyComponent(() => import("../positions/transfer-modal"), "TransferModal");

interface Props {
	enableHip3Disclaimer?: boolean;
}

export function GlobalModals({ enableHip3Disclaimer = false }: Props) {
	if (enableHip3Disclaimer) return <Hip3AwareGlobalModals />;
	return <SharedGlobalModals />;
}

function Hip3AwareGlobalModals() {
	const hip3Disclaimer = useHip3DisclaimerRequirement();
	return <SharedGlobalModals hip3Disclaimer={hip3Disclaimer} />;
}

function SharedGlobalModals({ hip3Disclaimer }: { hip3Disclaimer?: Hip3DisclaimerRequirement }) {
	const activeModal = useGlobalModalType();
	const isHip3DisclaimerRequired = hip3Disclaimer?.isRequired === true;
	const { open: openCommandMenu, close: closeCommandMenu } = useCommandMenuActions();
	const transferDirection = useTransferModalDirection();
	const { close: closeTransferModal } = useTransferModalActions();

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key !== "k" || (!e.metaKey && !e.ctrlKey)) return;
			e.preventDefault();
			if (isHip3DisclaimerRequired) return;
			if (activeModal === "commandMenu") {
				closeCommandMenu();
			} else {
				openCommandMenu();
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [activeModal, closeCommandMenu, isHip3DisclaimerRequired, openCommandMenu]);

	if (isHip3DisclaimerRequired && hip3Disclaimer.dex) {
		return <Hip3DeployerDisclaimer key={hip3Disclaimer.dex} documentationUrl={hip3Disclaimer.documentationUrl} />;
	}

	if (!activeModal) return null;

	return (
		<Suspense fallback={null}>
			{activeModal === "deposit" && <DepositModal />}
			{activeModal === "internalTransfer" && (
				<TransferModal
					open
					onOpenChange={(open) => !open && closeTransferModal()}
					initialDirection={transferDirection}
				/>
			)}
			{activeModal === "settings" && <GlobalSettingsModal />}
			{activeModal === "swap" && <SpotSwapModal />}
			{activeModal === "commandMenu" && <CommandMenu />}
		</Suspense>
	);
}
