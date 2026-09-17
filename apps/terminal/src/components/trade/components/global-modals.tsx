import { Trans } from "@lingui/react/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { Suspense, useEffect } from "react";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { type Hip3DisclaimerRequirement, useHip3DisclaimerRequirement } from "@/hooks/trade/use-hip3-disclaimer";
import { useLegalGate } from "@/hooks/trade/use-legal-gate";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useHyperliquid } from "@/lib/hyperliquid";
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
import { DepositModalLoadingFallback } from "./deposit-modal-loading-fallback";
import { Hip3DeployerDisclaimer } from "./hip3-deployer-disclaimer";
import {
	CommandMenu,
	DepositModal,
	GlobalSettingsModal,
	PositionMarketCloseModal,
	SendModal,
	SpotSwapModal,
	TransferModal,
} from "./lazy-global-modals";
import { LegalAcceptanceModal } from "./legal-acceptance-modal";
import { TradingOnboardingGate } from "./trading-onboarding-gate";

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
	const marketCloseSession = usePositionMarketCloseSession();
	const isHip3DisclaimerRequired = hip3Disclaimer?.isRequired === true;
	const { open: openCommandMenu, close: closeCommandMenu } = useCommandMenuActions();
	const transferDirection = useTransferModalDirection();
	const { close: closeTransferModal } = useTransferModalActions();
	const sendModalAsset = useSendModalAsset();
	const sendAccountType = useSendModalAccountType();
	const { close: closeSendModal } = useSendModalActions();
	const { clientKey, env, sessionMode } = useHyperliquid();
	const { walletAddress, walletIntent } = useWalletSession();
	const fundsSessionKey = `${env}:${clientKey.toLowerCase()}:${sessionMode}:${walletAddress?.toLowerCase() ?? "disconnected"}:${walletIntent}`;

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
			} else if (activeModal === null) {
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
		<Suspense fallback={activeModal === "deposit" ? <DepositModalSuspenseFallback /> : <GlobalModalLoadingFallback />}>
			{activeModal === "deposit" && <DepositModal key={`deposit:${fundsSessionKey}`} />}
			{activeModal === "internalTransfer" && (
				<TransferModal
					key={`transfer:${fundsSessionKey}`}
					open
					onOpenChange={(open) => !open && closeTransferModal()}
					initialDirection={transferDirection}
				/>
			)}
			{activeModal === "send" && (
				<SendModal
					key={`send:${fundsSessionKey}`}
					open
					onOpenChange={(open) => !open && closeSendModal()}
					initialAsset={sendModalAsset}
					initialAccountType={sendAccountType}
				/>
			)}
			{activeModal === "settings" && <GlobalSettingsModal />}
			{activeModal === "swap" && <SpotSwapModal key={`swap:${fundsSessionKey}`} />}
			{activeModal === "commandMenu" && <CommandMenu />}
			{activeModal === "positionMarketClose" &&
				enablePositionMarketClose &&
				marketCloseSession &&
				marketCloseSession.presentation !== "direct" && <PositionMarketCloseModal key={marketCloseSession.sessionId} />}
		</Suspense>
	);
}

function DepositModalSuspenseFallback() {
	const { path } = useDepositAvailability();
	return path === "sponsored" ? <DepositModalLoadingFallback /> : <GlobalModalLoadingFallback />;
}

function GlobalModalLoadingFallback() {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-scrim"
			data-testid="global-modal-loading-fallback"
			aria-busy="true"
		>
			<output className="flex items-center gap-2 rounded-12 border border-stroke-weak bg-modal px-4 py-3 text-sm text-fg shadow-overlay">
				<SpinnerGapIcon className="size-4 animate-spin text-signal motion-reduce:animate-none" aria-hidden="true" />
				<Trans>Loading...</Trans>
			</output>
		</div>
	);
}
