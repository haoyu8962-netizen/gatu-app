import { type ReactNode, useEffect, useState } from "react";
import { getTradingAccountFundingState } from "@/domain/trade/onboarding";
import { useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useAgentStatus } from "@/lib/hyperliquid";
import {
	useDepositModalActions,
	useEstablishConnectionModalActions,
	useGlobalModalType,
} from "@/stores/use-global-modal-store";
import { EstablishConnectionModal } from "./establish-connection-modal";

interface Props {
	children: ReactNode;
}

export function TradingOnboardingGate({ children }: Props) {
	const { hasWalletAccess, walletAddress } = useWalletSession();
	const { isAgentLoading, isAgentReady } = useAgentStatus();
	const balances = useDefaultDexBalances();
	const activeModal = useGlobalModalType();
	const establishConnection = useEstablishConnectionModalActions();
	const deposit = useDepositModalActions();
	const [dismissedIdentity, setDismissedIdentity] = useState<string | null>(null);
	const [pendingDepositIdentity, setPendingDepositIdentity] = useState<string | null>(null);
	const identity = walletAddress?.toLowerCase() ?? null;
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
		if (!identity || pendingDepositIdentity !== identity || fundingState === "loading") return;
		setPendingDepositIdentity(null);
		if (fundingState === "empty") deposit.open("deposit");
	}, [deposit, fundingState, identity, pendingDepositIdentity]);

	const wasDismissed = !!identity && dismissedIdentity === identity;
	const wasRequested = activeModal === "establishConnection";
	const shouldAutoOpen = activeModal === null && !wasDismissed;
	const shouldShowConnection =
		hasWalletAccess && !!identity && !isAgentLoading && !isAgentReady && (wasRequested || shouldAutoOpen);

	function handleClose() {
		if (identity) setDismissedIdentity(identity);
		if (wasRequested) establishConnection.close();
	}

	function handleConnected() {
		if (identity) {
			setDismissedIdentity(identity);
			setPendingDepositIdentity(identity);
		}
		if (wasRequested) establishConnection.close();
	}

	if (shouldShowConnection) {
		return <EstablishConnectionModal onClose={handleClose} onConnected={handleConnected} />;
	}

	return children;
}
