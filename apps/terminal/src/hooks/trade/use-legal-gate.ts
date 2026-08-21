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
	isSessionPending: boolean;
	hasOwnerIdentity: boolean;
	hasWalletAccess: boolean;
	hasStatusError: boolean;
	isPending: boolean;
	isSubmitting: boolean;
	acceptedTerms: boolean | undefined;
	userAllowed: boolean | undefined;
	canPerformActions: boolean | undefined;
}

export function deriveLegalGateState({
	hasSession,
	isSessionPending,
	hasOwnerIdentity,
	hasWalletAccess,
	hasStatusError,
	isPending,
	isSubmitting,
	acceptedTerms,
	userAllowed,
	canPerformActions,
}: LegalGateInput): LegalGateState {
	if (isSessionPending) return "checking";
	if (!hasSession) return "inactive";
	if (!hasOwnerIdentity) return "wallet_required";
	if (isPending && acceptedTerms === undefined) return "checking";
	if (hasStatusError) return "error";
	if (acceptedTerms === undefined) return "error";
	if (!userAllowed || !canPerformActions) return "blocked";
	if (!acceptedTerms && !hasWalletAccess) return "wallet_required";
	if (isSubmitting) return "submitting";
	return acceptedTerms ? "accepted" : "required";
}

interface LegalGateSessionInput {
	authenticationReady: boolean;
	authenticated: boolean;
	walletDirectoryReady: boolean;
	isConnecting: boolean;
	isReconnecting: boolean;
	isConnected: boolean;
	sessionMode: "wallet" | "agent-only" | "disconnected";
}

export function deriveLegalGateSession({
	authenticationReady,
	authenticated,
	walletDirectoryReady,
	isConnecting,
	isReconnecting,
	isConnected,
	sessionMode,
}: LegalGateSessionInput): Pick<LegalGateInput, "hasSession" | "isSessionPending"> {
	if (!authenticationReady || !walletDirectoryReady) {
		return { hasSession: false, isSessionPending: true };
	}
	if (sessionMode === "agent-only" && isConnected) {
		return { hasSession: true, isSessionPending: false };
	}
	if (!authenticated) {
		return { hasSession: false, isSessionPending: false };
	}
	if (isConnecting || isReconnecting) {
		return { hasSession: false, isSessionPending: true };
	}
	return { hasSession: true, isSessionPending: false };
}

export function useLegalGate() {
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
