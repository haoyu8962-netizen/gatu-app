import { type ReactNode, useEffect, useState } from "react";
import { getTradingAccountFundingState } from "@/domain/trade/onboarding";
import { useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useAgentStatus, useHyperliquid } from "@/lib/hyperliquid";
import {
	useDepositModalActions,
	useEstablishConnectionModalActions,
	useGlobalModalType,
} from "@/stores/use-global-modal-store";
import {
	useAgentPromptDismissed,
	useClearAgentPromptDismissal,
	useDismissAgentPrompt,
} from "@/stores/use-trading-onboarding-store";
import { EstablishConnectionModal } from "./establish-connection-modal";

interface Props {
	children: ReactNode;
}

export function TradingOnboardingGate({ children }: Props) {
	const { hasWalletAccess, walletAddress } = useWalletSession();
	const { env } = useHyperliquid();
	const { agentVerificationStatus, isAgentReady } = useAgentStatus();
	const balances = useDefaultDexBalances();
	const activeModal = useGlobalModalType();
	const establishConnection = useEstablishConnectionModalActions();
	const deposit = useDepositModalActions();
	const [pendingDepositIdentity, setPendingDepositIdentity] = useState<string | null>(null);
	const identity = walletAddress?.toLowerCase() ?? null;
	const promptIdentity = identity ? `${env}:${identity}` : null;
	const wasDismissed = useAgentPromptDismissed(promptIdentity);
	const dismissAgentPrompt = useDismissAgentPrompt();
	const clearAgentPromptDismissal = useClearAgentPromptDismissal();
	const fundingState = getTradingAccountFundingState({
		isConnected: hasWalletAccess,
		isLoading: balances.isLoading,
		hasError: balances.hasError,
		hasPerpSnapshot: balances.hasAllDexsSnapshot,
		hasSpotSnapshot: balances.hasSpotStateSnapshot,
		perpAccountValues: [
			balances.marginSummary?.accountValue,
			...balances.allDexClearinghouseStates.map(([, state]) => state.marginSummary.accountValue),
		],
		spotBalances: balances.spotBalances.map((balance) => balance.total),
	});

	useEffect(() => {
		if (activeModal !== "establishConnection" || (hasWalletAccess && !isAgentReady)) return;
		establishConnection.close();
	}, [activeModal, establishConnection, hasWalletAccess, isAgentReady]);

	useEffect(() => {
		if (!promptIdentity || agentVerificationStatus !== "ready") return;
		clearAgentPromptDismissal(promptIdentity);
	}, [agentVerificationStatus, clearAgentPromptDismissal, promptIdentity]);

	useEffect(() => {
		if (!identity || pendingDepositIdentity !== identity || fundingState === "loading") return;
		setPendingDepositIdentity(null);
		if (fundingState === "empty") deposit.open("deposit");
	}, [deposit, fundingState, identity, pendingDepositIdentity]);

	const wasRequested = activeModal === "establishConnection";
	const shouldAutoOpen = activeModal === null && !wasDismissed && agentVerificationStatus === "missing";
	const shouldShowConnection = hasWalletAccess && !!identity && !isAgentReady && (wasRequested || shouldAutoOpen);

	function handleClose() {
		if (promptIdentity) dismissAgentPrompt(promptIdentity);
		if (wasRequested) establishConnection.close();
	}

	function handleConnected() {
		if (identity) {
			if (promptIdentity) dismissAgentPrompt(promptIdentity);
			setPendingDepositIdentity(identity);
		}
		if (wasRequested) establishConnection.close();
	}

	if (shouldShowConnection) {
		return <EstablishConnectionModal onClose={handleClose} onConnected={handleConnected} />;
	}

	return children;
}
