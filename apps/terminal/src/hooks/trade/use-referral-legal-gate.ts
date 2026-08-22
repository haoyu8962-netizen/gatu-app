import { useEffect } from "react";
import { deriveLegalGateSession, deriveLegalGateState } from "@/hooks/trade/use-legal-gate";
import { useExplicitTermsAcceptance } from "@/hooks/wallet/use-explicit-terms-acceptance";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { reportClientError } from "@/lib/error-reporting/client";
import { classifyLegalStatusError, useLegalStatus } from "@/lib/hyperliquid";

export function useReferralLegalGate() {
	const {
		address,
		authenticated,
		authenticationReady,
		hasWalletAccess,
		isConnected,
		isConnecting,
		isReconnecting,
		sessionMode,
		walletDirectoryReady,
	} = useWalletSession();
	const legalStatus = useLegalStatus();
	const acceptance = useExplicitTermsAcceptance();
	const legalErrorReason = legalStatus.error ? classifyLegalStatusError(legalStatus.error) : undefined;
	const session = deriveLegalGateSession({
		authenticationReady,
		authenticated,
		walletDirectoryReady,
		isConnecting,
		isReconnecting,
		isConnected,
		sessionMode,
	});

	useEffect(() => {
		if (!legalStatus.error || !legalErrorReason || legalErrorReason === "aborted") return;
		reportClientError(legalStatus.error, { kind: "legal_status_check", legalReason: legalErrorReason });
	}, [legalErrorReason, legalStatus.error]);

	const state = deriveLegalGateState({
		...session,
		hasOwnerIdentity: !!address,
		hasWalletAccess,
		hasStatusError: legalStatus.isError,
		isPending: legalStatus.isPending,
		isSubmitting: acceptance.isPending,
		acceptedTerms: legalStatus.data?.acceptedTerms,
		userAllowed: legalStatus.data?.userAllowed,
		canPerformActions: legalStatus.data?.canUseReferrals,
	});

	return {
		accept: acceptance.mutateAsync,
		acceptanceError: acceptance.error,
		identity: address?.toLowerCase() ?? "disconnected",
		resetAcceptance: acceptance.reset,
		retryStatus: legalStatus.refetch,
		state,
	};
}
