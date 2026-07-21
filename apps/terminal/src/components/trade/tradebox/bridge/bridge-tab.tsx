import { useEffect, useState } from "react";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { initLiFi } from "@/lib/lifi/config";
import type { BridgeToken } from "@/lib/lifi/use-balances";
import { continueBridgeInBackground, useBridgeExecutor } from "@/lib/lifi/use-bridge";
import type { BridgeQuote } from "@/lib/lifi/use-quote";
import { useDepositModalActions } from "@/stores/use-global-modal-store";
import { AmountEntryScreen } from "./amount-entry-screen";
import { AssetSelectionScreen } from "./asset-selection-screen";
import { BridgeErrorScreen } from "./bridge-error-screen";
import { ConfirmationScreen } from "./confirmation-screen";
import { ExecutingScreen } from "./executing-screen";
import { BridgeWalletNotConnected } from "./shared-ui";
import { SuccessScreen } from "./success-screen";
import type { BridgeScreen } from "./types";

export function BridgeTab() {
	const { walletAddress, hasWalletAccess } = useWalletSession();
	const [screen, setScreen] = useState<BridgeScreen>("select");
	const [selectedToken, setSelectedToken] = useState<BridgeToken | null>(null);
	const [usdInput, setUsdInput] = useState("");
	const [tokenAmount, setTokenAmount] = useState("");
	const bridge = useBridgeExecutor();
	const { close: closeDepositModal } = useDepositModalActions();

	useEffect(() => {
		initLiFi();
		return () => {
			continueBridgeInBackground();
		};
	}, []);

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
		setScreen("executing");
		const outcome = await bridge.execute(quote);
		if (outcome === "rejected") setScreen("confirm");
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

	if (bridge.status === "error") {
		return (
			<BridgeErrorScreen
				error={bridge.error ?? "Unknown error"}
				onRetry={handleRetry}
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
				statusText={bridge.statusText}
				txHash={bridge.txHash}
				onDone={handleExecutionClose}
			/>
		);
	}

	if (!hasWalletAccess || !walletAddress) {
		return <BridgeWalletNotConnected />;
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
