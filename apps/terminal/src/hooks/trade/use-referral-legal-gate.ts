import { useEffect } from "react";
import { deriveLegalGateState, useLegalGateSession } from "@/hooks/trade/use-legal-gate";
import { useExplicitTermsAcceptance } from "@/hooks/wallet/use-explicit-terms-acceptance";
import { reportClientError } from "@/lib/error-reporting/client";
import { classifyLegalStatusError, useLegalStatus } from "@/lib/hyperliquid";

export function useReferralLegalGate() {
	const {
		address,
		authenticationModalOpen,
		hasSession,
		hasWalletAccess,
		isSessionPending,
		ownerSetup,
		retryWalletSetup,
	} = useLegalGateSession();
	const legalStatus = useLegalStatus();
	const acceptance = useExplicitTermsAcceptance();
	const legalErrorReason = legalStatus.error ? classifyLegalStatusError(legalStatus.error) : undefined;

	useEffect(() => {
		if (!legalStatus.error || !legalErrorReason || legalErrorReason === "aborted") return;
		reportClientError(legalStatus.error, { kind: "legal_status_check", legalReason: legalErrorReason });
	}, [legalErrorReason, legalStatus.error]);

	const state = deriveLegalGateState({
		hasSession,
		isSessionPending,
		authenticationModalOpen,
		hasOwnerIdentity: !!address,
		ownerSetup,
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
		retryWalletSetup,
		state,
	};
}
