import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { getTradingAccountFundingState } from "@/domain/trade/onboarding";
import { useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useHyperliquid, useTradingStatus } from "@/lib/hyperliquid";
import {
	consumeEmailOnboardingIntent,
	reconcileEmailOnboardingIntent,
	useEmailOnboardingIntent,
} from "@/lib/wallet/email-onboarding-intent";
import { hasSameWalletAddress } from "@/lib/wallet/privy-wagmi";
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
	const { authenticated, embeddedWalletAddress, hasWalletAccess, ready, user, walletAddress, walletIntent } =
		useWalletSession();
	const { env } = useHyperliquid();
	const { isSignerReady, signerMode } = useTradingStatus();
	const emailIntent = useEmailOnboardingIntent();
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
		if (activeModal !== "establishConnection" || (signerMode === "agent" && hasWalletAccess && !isSignerReady)) return;
		establishConnection.close();
	}, [activeModal, establishConnection, hasWalletAccess, isSignerReady, signerMode]);

	useEffect(() => {
		reconcileEmailOnboardingIntent({
			authenticated,
			embeddedWalletAddress,
			env,
			ready,
			userId: user?.id,
			walletIntent,
		});
	}, [authenticated, embeddedWalletAddress, env, ready, user?.id, walletIntent]);

	useEffect(() => {
		if (!emailIntent || emailIntent.env !== env || emailIntent.userId !== user?.id || walletIntent !== "embedded") {
			return;
		}
		if (activeModal === "deposit") {
			consumeEmailOnboardingIntent(emailIntent);
			return;
		}
		if (
			!emailIntent.ownerAddress ||
			!hasWalletAccess ||
			!isSignerReady ||
			!hasSameWalletAddress(emailIntent.ownerAddress, walletAddress) ||
			!hasSameWalletAddress(emailIntent.ownerAddress, embeddedWalletAddress)
		) {
			return;
		}
		if (activeModal || fundingState === "loading" || fundingState === "error") return;
		if (fundingState === "empty" && geoResolutionStatus === "loading") return;
		if (!consumeEmailOnboardingIntent(emailIntent)) return;
		if (fundingState === "empty" && depositAvailable) deposit.open("deposit");
	}, [
		activeModal,
		deposit,
		depositAvailable,
		emailIntent,
		embeddedWalletAddress,
		env,
		fundingState,
		geoResolutionStatus,
		hasWalletAccess,
		isSignerReady,
		user?.id,
		walletAddress,
		walletIntent,
	]);

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
		if (activeModal !== null && activeModal !== "establishConnection") return;
		setPendingDepositIdentity(null);
		if (depositAvailable) {
			deposit.open("deposit");
			return;
		}
		if (depositUnavailableReason) toast.error(depositUnavailableReason);
	}, [
		activeModal,
		deposit,
		depositAvailabilityReason,
		depositAvailable,
		depositUnavailableReason,
		fundingState,
		geoResolutionStatus,
		identity,
		pendingDepositIdentity,
	]);

	const shouldShowConnection =
		signerMode === "agent" && activeModal === "establishConnection" && hasWalletAccess && !!identity && !isSignerReady;

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
