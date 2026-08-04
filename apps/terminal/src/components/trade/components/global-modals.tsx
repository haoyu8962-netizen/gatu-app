import { Suspense, useEffect } from "react";
import { type Hip3DisclaimerRequirement, useHip3DisclaimerRequirement } from "@/hooks/trade/use-hip3-disclaimer";
import { useLegalGate } from "@/hooks/trade/use-legal-gate";
import { createLazyComponent } from "@/lib/lazy";
import {
	discardPositionMarketCloseModal,
	useCommandMenuActions,
	useGlobalModalType,
	usePositionMarketCloseSession,
	useSendModalAccountType,
	useSendModalActions,
	useSendModalAsset,
	useTransferModalActions,
	useTransferModalDirection,
} from "@/stores/use-global-modal-store";
import { Hip3DeployerDisclaimer } from "./hip3-deployer-disclaimer";
import { LegalAcceptanceModal } from "./legal-acceptance-modal";
import { TradingOnboardingGate } from "./trading-onboarding-gate";

const DepositModal = createLazyComponent(() => import("../tradebox/deposit-modal"), "DepositModal");
const GlobalSettingsModal = createLazyComponent(() => import("./global-settings-modal"), "GlobalSettingsModal");
const SpotSwapModal = createLazyComponent(() => import("./spot-swap-modal"), "SpotSwapModal");
const CommandMenu = createLazyComponent(() => import("./command-menu"), "CommandMenu");
const TransferModal = createLazyComponent(() => import("../positions/transfer-modal"), "TransferModal");
const SendModal = createLazyComponent(() => import("../positions/send-modal"), "SendModal");
const PositionMarketCloseModal = createLazyComponent(
	() => import("../positions/position-market-close-modal"),
	"PositionMarketCloseModal",
);

interface Props {
	enableHip3Disclaimer?: boolean;
	enableLegalGate?: boolean;
	enablePositionMarketClose?: boolean;
	enableSelectedMarketHip3Disclaimer?: boolean;
	enableTradingOnboarding?: boolean;
}

export function GlobalModals({
	enableHip3Disclaimer = false,
	enableLegalGate = false,
	enablePositionMarketClose = false,
	enableSelectedMarketHip3Disclaimer = true,
	enableTradingOnboarding = false,
}: Props) {
	if (enableLegalGate) {
		return (
			<LegalAwareGlobalModals
				enableHip3Disclaimer={enableHip3Disclaimer}
				enablePositionMarketClose={enablePositionMarketClose}
				enableSelectedMarketHip3Disclaimer={enableSelectedMarketHip3Disclaimer}
				enableTradingOnboarding={enableTradingOnboarding}
			/>
		);
	}

	const content = enableHip3Disclaimer ? (
		<Hip3AwareGlobalModals
			enablePositionMarketClose={enablePositionMarketClose}
			enableSelectedMarketHip3Disclaimer={enableSelectedMarketHip3Disclaimer}
		/>
	) : (
		<SharedGlobalModals enablePositionMarketClose={enablePositionMarketClose} />
	);
	return enableTradingOnboarding ? <TradingOnboardingGate>{content}</TradingOnboardingGate> : content;
}

function LegalAwareGlobalModals({
	enableHip3Disclaimer,
	enablePositionMarketClose,
	enableSelectedMarketHip3Disclaimer,
	enableTradingOnboarding,
}: {
	enableHip3Disclaimer: boolean;
	enablePositionMarketClose: boolean;
	enableSelectedMarketHip3Disclaimer: boolean;
	enableTradingOnboarding: boolean;
}) {
	const legalGate = useLegalGate();

	if (legalGate.state === "checking") return null;
	if (legalGate.state !== "inactive" && legalGate.state !== "accepted") {
		return (
			<LegalAcceptanceModal
				key={legalGate.identity}
				state={legalGate.state}
				acceptanceError={legalGate.acceptanceError}
				onAccept={legalGate.accept}
				onRetryStatus={legalGate.retryStatus}
				onResetAcceptance={legalGate.resetAcceptance}
			/>
		);
	}

	const content = enableHip3Disclaimer ? (
		<Hip3AwareGlobalModals
			enablePositionMarketClose={enablePositionMarketClose}
			enableSelectedMarketHip3Disclaimer={enableSelectedMarketHip3Disclaimer}
		/>
	) : (
		<SharedGlobalModals enablePositionMarketClose={enablePositionMarketClose} />
	);
	return enableTradingOnboarding ? <TradingOnboardingGate>{content}</TradingOnboardingGate> : content;
}

function Hip3AwareGlobalModals({
	enablePositionMarketClose,
	enableSelectedMarketHip3Disclaimer,
}: {
	enablePositionMarketClose: boolean;
	enableSelectedMarketHip3Disclaimer: boolean;
}) {
	const marketCloseSession = usePositionMarketCloseSession();
	const targetMarketName = marketCloseSession
		? marketCloseSession.position.coin
		: enableSelectedMarketHip3Disclaimer
			? undefined
			: null;
	const hip3Disclaimer = useHip3DisclaimerRequirement(targetMarketName);
	return (
		<SharedGlobalModals
			hip3Disclaimer={hip3Disclaimer}
			onHip3DisclaimerCancel={marketCloseSession ? discardPositionMarketCloseModal : undefined}
			enablePositionMarketClose={enablePositionMarketClose}
		/>
	);
}

function SharedGlobalModals({
	hip3Disclaimer,
	onHip3DisclaimerCancel,
	enablePositionMarketClose,
}: {
	hip3Disclaimer?: Hip3DisclaimerRequirement;
	onHip3DisclaimerCancel?: () => void;
	enablePositionMarketClose: boolean;
}) {
	const activeModal = useGlobalModalType();
	const isHip3DisclaimerRequired = hip3Disclaimer?.isRequired === true;
	const { open: openCommandMenu, close: closeCommandMenu } = useCommandMenuActions();
	const transferDirection = useTransferModalDirection();
	const { close: closeTransferModal } = useTransferModalActions();
	const sendModalAsset = useSendModalAsset();
	const sendAccountType = useSendModalAccountType();
	const { close: closeSendModal } = useSendModalActions();

	useEffect(() => {
		if (!enablePositionMarketClose && activeModal === "positionMarketClose") {
			discardPositionMarketCloseModal();
		}
	}, [activeModal, enablePositionMarketClose]);

	useEffect(() => () => discardPositionMarketCloseModal(), []);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key !== "k" || (!e.metaKey && !e.ctrlKey)) return;
			e.preventDefault();
			if (isHip3DisclaimerRequired || activeModal === "positionMarketClose") return;
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
		return (
			<Hip3DeployerDisclaimer
				key={hip3Disclaimer.dex}
				documentationUrl={hip3Disclaimer.documentationUrl}
				onCancel={onHip3DisclaimerCancel}
			/>
		);
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
			{activeModal === "send" && (
				<SendModal
					open
					onOpenChange={(open) => !open && closeSendModal()}
					initialAsset={sendModalAsset}
					initialAccountType={sendAccountType}
				/>
			)}
			{activeModal === "settings" && <GlobalSettingsModal />}
			{activeModal === "swap" && <SpotSwapModal />}
			{activeModal === "commandMenu" && <CommandMenu />}
			{activeModal === "positionMarketClose" && enablePositionMarketClose && <PositionMarketCloseModal />}
		</Suspense>
	);
}
