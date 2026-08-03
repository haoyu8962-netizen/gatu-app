import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useLegalStatus, useTermsAcceptance } from "@/lib/hyperliquid";

export type LegalGateState = "inactive" | "checking" | "required" | "submitting" | "blocked" | "error" | "accepted";

interface LegalGateInput {
	hasWalletAccess: boolean;
	isPending: boolean;
	isError: boolean;
	isSubmitting: boolean;
	acceptedTerms: boolean | undefined;
	userAllowed: boolean | undefined;
	canPerformActions: boolean | undefined;
}

export function deriveLegalGateState({
	hasWalletAccess,
	isPending,
	isError,
	isSubmitting,
	acceptedTerms,
	userAllowed,
	canPerformActions,
}: LegalGateInput): LegalGateState {
	if (!hasWalletAccess) return "inactive";
	if (isPending) return "checking";
	if (isError || acceptedTerms === undefined) return "error";
	if (!userAllowed || !canPerformActions) return "blocked";
	if (isSubmitting) return "submitting";
	return acceptedTerms ? "accepted" : "required";
}

export function useLegalGate() {
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
		canPerformActions: legalStatus.data?.canPerformActions,
	});

	return {
		state,
		identity: walletAddress?.toLowerCase() ?? "disconnected",
		accept: acceptance.mutateAsync,
		acceptanceError: acceptance.error,
		resetAcceptance: acceptance.reset,
		retryStatus: legalStatus.refetch,
	};
}
