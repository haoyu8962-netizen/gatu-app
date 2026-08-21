import { useEffect } from "react";
import { useExplicitTermsAcceptance } from "@/hooks/wallet/use-explicit-terms-acceptance";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { reportClientError } from "@/lib/error-reporting/client";
import { classifyLegalStatusError, useLegalStatus } from "@/lib/hyperliquid";

export type LegalGateState =
	| "inactive"
	| "checking"
	| "required"
	| "submitting"
	| "blocked"
	| "wallet_required"
	| "error"
	| "accepted";

interface LegalGateInput {
	hasSession: boolean;
	hasOwnerIdentity: boolean;
	hasWalletAccess: boolean;
	isPending: boolean;
	isSubmitting: boolean;
	acceptedTerms: boolean | undefined;
	userAllowed: boolean | undefined;
	canPerformActions: boolean | undefined;
}

export function deriveLegalGateState({
	hasSession,
	hasOwnerIdentity,
	hasWalletAccess,
	isPending,
	isSubmitting,
	acceptedTerms,
	userAllowed,
	canPerformActions,
}: LegalGateInput): LegalGateState {
	if (!hasSession) return "inactive";
	if (!hasOwnerIdentity) return "wallet_required";
	if (isPending && acceptedTerms === undefined) return "checking";
	if (acceptedTerms === undefined) return "error";
	if (!userAllowed || !canPerformActions) return "blocked";
	if (!acceptedTerms && !hasWalletAccess) return "wallet_required";
	if (isSubmitting) return "submitting";
	return acceptedTerms ? "accepted" : "required";
}

export function useLegalGate() {
	const { address, authenticated, hasWalletAccess, isConnected, ready } = useWalletSession();
	const legalStatus = useLegalStatus();
	const acceptance = useExplicitTermsAcceptance();
	const legalErrorReason = legalStatus.error ? classifyLegalStatusError(legalStatus.error) : undefined;

	useEffect(() => {
		if (!legalStatus.error || !legalErrorReason || legalErrorReason === "aborted") return;
		reportClientError(legalStatus.error, { kind: "legal_status_check", legalReason: legalErrorReason });
	}, [legalErrorReason, legalStatus.error]);

	const state = deriveLegalGateState({
		hasSession: isConnected || (ready && authenticated),
		hasOwnerIdentity: !!address,
		hasWalletAccess,
		isPending: legalStatus.isPending,
		isSubmitting: acceptance.isPending,
		acceptedTerms: legalStatus.data?.acceptedTerms,
		userAllowed: legalStatus.data?.userAllowed,
		canPerformActions: legalStatus.data?.canPerformActions,
	});

	return {
		state,
		identity: address?.toLowerCase() ?? "disconnected",
		statusErrorReason: legalErrorReason,
		accept: acceptance.mutateAsync,
		acceptanceError: acceptance.error,
		resetAcceptance: acceptance.reset,
		retryStatus: legalStatus.refetch,
	};
}
