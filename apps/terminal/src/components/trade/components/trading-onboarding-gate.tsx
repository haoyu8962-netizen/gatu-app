import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { getTradingAccountFundingState } from "@/domain/trade/onboarding";
import { useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useAgentStatus, useHyperliquid } from "@/lib/hyperliquid";
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
	const { env } = useHyperliquid();
	const { isAgentReady } = useAgentStatus();
	const balances = useDefaultDexBalances();
	const {
		available: depositAvailable,
		geoResolutionStatus,
		reason: depositAvailabilityReason,
		unavailableReason: depositUnavailableReason,
	} = useDepositAvailability();
	const activeModal = useGlobalModalType();
	const establishConnection = useEstablishConnectionModalActions();
	const deposit = useDepositModalActions();
	const [pendingDepositIdentity, setPendingDepositIdentity] = useState<string | null>(null);
	const identity = walletAddress ? `${env}:${walletAddress.toLowerCase()}` : null;
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
		if (!pendingDepositIdentity) return;
		if (!identity || pendingDepositIdentity !== identity) {
			setPendingDepositIdentity(null);
			return;
		}
		if (fundingState === "loading" || fundingState === "error") {
			return;
		}
		if (fundingState !== "empty") {
			setPendingDepositIdentity(null);
			return;
		}
		if (!depositAvailable && depositAvailabilityReason === "geo-unresolved" && geoResolutionStatus === "loading") {
			return;
		}
		setPendingDepositIdentity(null);
		if (depositAvailable) {
			deposit.open("deposit");
			return;
		}
		if (depositUnavailableReason) toast.error(depositUnavailableReason);
	}, [
		deposit,
		depositAvailabilityReason,
		depositAvailable,
		depositUnavailableReason,
		fundingState,
		geoResolutionStatus,
		identity,
		pendingDepositIdentity,
	]);

	const shouldShowConnection = activeModal === "establishConnection" && hasWalletAccess && !!identity && !isAgentReady;

	function handleClose() {
		establishConnection.close();
	}

	function handleConnected() {
		if (identity) {
			setPendingDepositIdentity(identity);
		}
		establishConnection.close();
	}

	if (shouldShowConnection) {
		return <EstablishConnectionModal onClose={handleClose} onConnected={handleConnected} />;
	}

	return children;
}
