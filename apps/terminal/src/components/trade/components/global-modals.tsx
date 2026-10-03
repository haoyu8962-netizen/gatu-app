import { Trans } from "@lingui/react/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { Suspense, useEffect } from "react";
import { DEFAULT_MARKET_NAME } from "@/config/app";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { type Hip3DisclaimerRequirement, useHip3DisclaimerRequirement } from "@/hooks/trade/use-hip3-disclaimer";
import {
	type Hip3DisclaimerExit,
	type Hip3DisclaimerPresentation,
	useHip3DisclaimerPresentation,
} from "@/hooks/trade/use-hip3-disclaimer-presentation";
import { useLegalGate } from "@/hooks/trade/use-legal-gate";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useLingeringValue } from "@/hooks/use-lingering-value";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useHyperliquid } from "@/lib/hyperliquid";
import {
	discardIdlePositionMarketCloseModal,
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
	useIdleGlobalModalPreload,
} from "./lazy-global-modals";
import { LegalAcceptanceModal } from "./legal-acceptance-modal";
import { PositionDialogHostGate } from "./position-dialog-host-gate";
import { PositionMarketCloseSubmitHostGate } from "./position-market-close-submit-host-gate";
import { TradingOnboardingGate } from "./trading-onboarding-gate";

const GLOBAL_MODAL_EXIT_MS = 250;
const NO_HIP3_DISCLAIMER: Hip3DisclaimerRequirement = {
	isRequired: false,
	dex: undefined,
	documentationUrl: undefined,
};
type GlobalModalScope = "all" | "preferences";

interface Hip3DisclaimerGate {
	requirement: Hip3DisclaimerRequirement;
	exit: Hip3DisclaimerExit;
}

interface Props {
	enableHip3Disclaimer?: boolean;
	enableLegalGate?: boolean;
	enablePositionMarketClose?: boolean;
	enableSelectedMarketHip3Disclaimer?: boolean;
	enableTradingOnboarding?: boolean;
}

export function GlobalModals(props: Props) {
	return (
		<>
			<PrioritizedGlobalModals {...props} />
			{props.enablePositionMarketClose && <PositionMarketCloseSubmitHostGate />}
			{props.enablePositionMarketClose && <PositionDialogHostGate />}
		</>
	);
}

function PrioritizedGlobalModals({
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

	if (legalGate.state === "checking") {
		return <SharedGlobalModals enablePositionMarketClose={false} scope="preferences" />;
	}
	if (legalGate.state !== "inactive" && legalGate.state !== "accepted") {
		return (
			<LegalAcceptanceModal
				key={legalGate.identity}
				state={legalGate.state}
				acceptanceError={legalGate.acceptanceError}
				onAccept={legalGate.accept}
				onRetryStatus={legalGate.retryStatus}
				onRetryWalletSetup={legalGate.retryWalletSetup}
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
	const requirement = useHip3DisclaimerRequirement(targetMarketName);
	return (
		<SharedGlobalModals
			hip3Disclaimer={{ requirement, exit: marketCloseSession ? "cancel" : "leave-market" }}
			enablePositionMarketClose={enablePositionMarketClose}
		/>
	);
}

function SharedGlobalModals({
	hip3Disclaimer,
	enablePositionMarketClose,
	scope = "all",
}: {
	hip3Disclaimer?: Hip3DisclaimerGate;
	enablePositionMarketClose: boolean;
	scope?: GlobalModalScope;
}) {
	const activeModal = useGlobalModalType();
	const visibleActiveModal =
		scope === "preferences" && activeModal !== "settings" && activeModal !== "commandMenu" ? null : activeModal;
	const lingeringModal = useLingeringValue(visibleActiveModal, GLOBAL_MODAL_EXIT_MS);
	const displayedModal =
		scope === "preferences" && lingeringModal !== "settings" && lingeringModal !== "commandMenu"
			? null
			: lingeringModal;
	const marketCloseSession = usePositionMarketCloseSession();
	const isHip3DisclaimerRequired = hip3Disclaimer?.requirement.isRequired === true;
	const hip3Presentation = useHip3DisclaimerPresentation(
		hip3Disclaimer?.requirement ?? NO_HIP3_DISCLAIMER,
		hip3Disclaimer?.exit ?? "cancel",
		GLOBAL_MODAL_EXIT_MS,
	);
	const { open: openCommandMenu, close: closeCommandMenu } = useCommandMenuActions();
	const transferDirection = useTransferModalDirection();
	const { close: closeTransferModal } = useTransferModalActions();
	const sendModalAsset = useSendModalAsset();
	const sendAccountType = useSendModalAccountType();
	const { close: closeSendModal } = useSendModalActions();
	const { clientKey, env, sessionMode } = useHyperliquid();
	const { walletAddress, walletIntent } = useWalletSession();
	const fundsSessionKey = `${env}:${clientKey.toLowerCase()}:${sessionMode}:${walletAddress?.toLowerCase() ?? "disconnected"}:${walletIntent}`;
	useIdleGlobalModalPreload(enablePositionMarketClose);

	useEffect(() => {
		if (!enablePositionMarketClose && activeModal === "positionMarketClose") {
			discardIdlePositionMarketCloseModal();
		}
	}, [activeModal, enablePositionMarketClose]);

	useEffect(() => () => discardIdlePositionMarketCloseModal(), []);

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

	if (hip3Presentation) {
		return hip3Presentation.exit === "leave-market" ? (
			<SelectedMarketHip3Disclaimer key={hip3Presentation.dex} presentation={hip3Presentation} />
		) : (
			<Hip3DeployerDisclaimer
				key={hip3Presentation.dex}
				open={hip3Presentation.open}
				documentationUrl={hip3Presentation.documentationUrl}
				exit="cancel"
				onExit={discardIdlePositionMarketCloseModal}
			/>
		);
	}

	if (!displayedModal) return null;

	return (
		<Suspense
			fallback={displayedModal === "deposit" ? <DepositModalSuspenseFallback /> : <GlobalModalLoadingFallback />}
		>
			{displayedModal === "deposit" && <DepositModal key={`deposit:${fundsSessionKey}`} />}
			{displayedModal === "internalTransfer" && (
				<TransferModal
					key={`transfer:${fundsSessionKey}`}
					open={activeModal === "internalTransfer"}
					onOpenChange={(open) => !open && closeTransferModal()}
					initialDirection={transferDirection}
				/>
			)}
			{displayedModal === "send" && (
				<SendModal
					key={`send:${fundsSessionKey}`}
					open={activeModal === "send"}
					onOpenChange={(open) => !open && closeSendModal()}
					initialAsset={sendModalAsset}
					initialAccountType={sendAccountType}
				/>
			)}
			{displayedModal === "settings" && <GlobalSettingsModal />}
			{displayedModal === "swap" && <SpotSwapModal key={`swap:${fundsSessionKey}`} />}
			{displayedModal === "commandMenu" && <CommandMenu />}
			{displayedModal === "positionMarketClose" &&
				enablePositionMarketClose &&
				marketCloseSession &&
				marketCloseSession.presentation !== "direct" && <PositionMarketCloseModal key={marketCloseSession.sessionId} />}
		</Suspense>
	);
}

function SelectedMarketHip3Disclaimer({ presentation }: { presentation: Hip3DisclaimerPresentation }) {
	const navigateToMarket = useMarketNavigation();
	return (
		<Hip3DeployerDisclaimer
			open={presentation.open}
			documentationUrl={presentation.documentationUrl}
			exit="leave-market"
			onExit={() => navigateToMarket(DEFAULT_MARKET_NAME)}
		/>
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
				<SpinnerGapIcon className="size-4 animate-spin text-fg-muted motion-reduce:animate-none" aria-hidden="true" />
				<Trans>Loading...</Trans>
			</output>
		</div>
	);
}
