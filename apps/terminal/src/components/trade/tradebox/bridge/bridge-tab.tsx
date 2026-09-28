import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { LIFI_BRIDGE_FEATURES } from "@/config/lifi-bridge";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { describeActionFailure } from "@/lib/errors/action-error";
import { initLiFi } from "@/lib/lifi/config";
import type { BridgeToken } from "@/lib/lifi/use-balances";
import { useBridgeExecutor } from "@/lib/lifi/use-bridge";
import type { BridgeQuote } from "@/lib/lifi/use-quote";
import { useDepositModalActions } from "@/stores/use-global-modal-store";
import { AmountEntryScreen } from "./amount-entry-screen";
import { AssetSelectionScreen } from "./asset-selection-screen";
import { BridgeErrorScreen } from "./bridge-error-screen";
import { ConfirmationScreen } from "./confirmation-screen";
import { ExecutingScreen } from "./executing-screen";
import { BridgeCreationPaused, BridgeWalletMismatch, BridgeWalletNotConnected } from "./shared-ui";
import { SuccessScreen } from "./success-screen";
import type { BridgeScreen } from "./types";

export function BridgeTab() {
	const { t } = useLingui();
	const { walletAddress, hasWalletAccess } = useWalletSession();
	const [screen, setScreen] = useState<BridgeScreen>("select");
	const [selectedToken, setSelectedToken] = useState<BridgeToken | null>(null);
	const [usdInput, setUsdInput] = useState("");
	const [tokenAmount, setTokenAmount] = useState("");
	const bridge = useBridgeExecutor();
	const { close: closeDepositModal } = useDepositModalActions();
	const { continueInBackground, restoreInForeground } = bridge;

	useEffect(() => {
		initLiFi();
		restoreInForeground();
		return () => {
			continueInBackground();
		};
	}, [continueInBackground, restoreInForeground]);

	function handleTokenSelect(token: BridgeToken) {
		setSelectedToken(token);
		setScreen("amount");
	}

	function handleAmountContinue(amount: string, usd: string) {
		setTokenAmount(amount);
		setUsdInput(usd);
		setScreen("confirm");
	}

	function handleBackFromAmount() {
		setScreen("select");
		setSelectedToken(null);
		setUsdInput("");
		setTokenAmount("");
	}

	function handleBackFromConfirm() {
		setScreen("amount");
	}

	async function runBridge(quote: BridgeQuote) {
		const outcome = await bridge.execute(quote);
		if (outcome === "rejected" || outcome === "disabled") setScreen("confirm");
	}

	function handleConfirm(quote: BridgeQuote) {
		void runBridge(quote);
	}

	function handleRetry() {
		void bridge.retry();
	}

	function handleExecutionClose() {
		bridge.continueInBackground();
		closeDepositModal();
	}

	function resetToSelect() {
		if (!bridge.reset()) return;
		setScreen("select");
		setSelectedToken(null);
		setUsdInput("");
		setTokenAmount("");
	}

	const ownsExistingExecution =
		bridge.status === "idle" ||
		(!!walletAddress && !!bridge.sourceAddress && walletAddress.toLowerCase() === bridge.sourceAddress.toLowerCase());
	if (!ownsExistingExecution) {
		return <BridgeWalletMismatch />;
	}

	if (bridge.status === "error") {
		const retryUnavailableMessage =
			bridge.retryMode === null && !LIFI_BRIDGE_FEATURES.createNewRoute
				? t`Bridge creation is paused. A route without a submitted source transaction cannot be retried.`
				: null;
		return (
			<BridgeErrorScreen
				error={[
					bridge.error ? describeActionFailure(bridge.error, (descriptor) => t(descriptor)) : t`Unknown error`,
					bridge.recoveryWarning ? t(bridge.recoveryWarning) : null,
					retryUnavailableMessage,
				]
					.filter(Boolean)
					.join(" ")}
				onRetry={bridge.retryMode ? handleRetry : undefined}
				retryMode={bridge.retryMode ?? undefined}
				onBack={bridge.canAbandon ? resetToSelect : undefined}
			/>
		);
	}

	if (bridge.status === "success" && bridge.receivedAmount) {
		return (
			<SuccessScreen
				address={bridge.sourceAddress ?? walletAddress ?? ""}
				receivedAmount={bridge.receivedAmount}
				txHash={bridge.txHash}
				startTime={bridge.startTime}
				endTime={bridge.endTime}
				processDetails={bridge.processDetails}
				onDone={resetToSelect}
				onNewDeposit={resetToSelect}
			/>
		);
	}

	if (bridge.status === "executing") {
		return (
			<ExecutingScreen
				address={bridge.sourceAddress ?? walletAddress ?? ""}
				statusText={bridge.statusText ? t(bridge.statusText) : ""}
				txHash={bridge.txHash}
				onDone={handleExecutionClose}
				recoveryWarning={bridge.recoveryWarning ? t(bridge.recoveryWarning) : null}
			/>
		);
	}

	if (!hasWalletAccess || !walletAddress) {
		return <BridgeWalletNotConnected />;
	}

	if (!LIFI_BRIDGE_FEATURES.createNewRoute) {
		return <BridgeCreationPaused />;
	}

	if (screen === "confirm" && selectedToken && tokenAmount) {
		return (
			<ConfirmationScreen
				token={selectedToken}
				tokenAmount={tokenAmount}
				address={walletAddress}
				onBack={handleBackFromConfirm}
				onConfirm={handleConfirm}
			/>
		);
	}

	if (screen === "amount" && selectedToken) {
		return (
			<AmountEntryScreen
				token={selectedToken}
				initialUsd={usdInput}
				onBack={handleBackFromAmount}
				onContinue={handleAmountContinue}
			/>
		);
	}

	return <AssetSelectionScreen address={walletAddress} onSelect={handleTokenSelect} />;
}
