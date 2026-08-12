import { deriveLegalGateState } from "@/hooks/trade/use-legal-gate";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useLegalStatus, useTermsAcceptance } from "@/lib/hyperliquid";

export function useReferralLegalGate() {
	const { hasWalletAccess, walletAddress } = useWalletSession();
	const legalStatus = useLegalStatus();
	const acceptance = useTermsAcceptance();

	const state = deriveLegalGateState({
		hasWalletAccess,
		isPending: legalStatus.isPending,
		isError: legalStatus.isError,
		isSubmitting: acceptance.isPending,
		acceptedTerms: legalStatus.data?.acceptedTerms,
		userAllowed: legalStatus.data?.userAllowed,
		canPerformActions: legalStatus.data?.canUseReferrals,
	});

	return {
		accept: acceptance.mutateAsync,
		acceptanceError: acceptance.error,
		identity: walletAddress?.toLowerCase() ?? "disconnected",
		resetAcceptance: acceptance.reset,
		retryStatus: legalStatus.refetch,
		state,
	};
}
