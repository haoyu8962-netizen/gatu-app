import { useEffect, useState } from "react";
import { useEmailEmbeddedWallet } from "@/hooks/wallet/use-email-embedded-wallet";
import { useExplicitTermsAcceptance } from "@/hooks/wallet/use-explicit-terms-acceptance";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { reportClientError } from "@/lib/error-reporting/client";
import { classifyLegalStatusError, useLegalStatus } from "@/lib/hyperliquid";
import type { PrivyWalletIntent } from "@/lib/wallet/privy-wagmi";

export type LegalGateState =
	| "inactive"
	| "checking"
	| "required"
	| "submitting"
	| "blocked"
	| "wallet_required"
	| "wallet_setup_failed"
	| "error"
	| "accepted";

/** Whether an email session's embedded owner wallet is still being created or activated. */
export type LegalGateOwnerSetup = "settled" | "pending" | "failed";

const EMAIL_OWNER_ACTIVATION_GRACE_MS = 10_000;
const DIALOG_STATES_HELD_BEHIND_PRIVY_MODAL: ReadonlySet<LegalGateState> = new Set([
	"required",
	"blocked",
	"wallet_required",
	"wallet_setup_failed",
	"error",
]);

interface LegalGateInput {
	hasSession: boolean;
	isSessionPending: boolean;
	authenticationModalOpen: boolean;
	hasOwnerIdentity: boolean;
	ownerSetup: LegalGateOwnerSetup;
	hasWalletAccess: boolean;
	hasStatusError: boolean;
	isPending: boolean;
	isSubmitting: boolean;
	acceptedTerms: boolean | undefined;
	userAllowed: boolean | undefined;
	canPerformActions: boolean | undefined;
}

export function deriveLegalGateState(input: LegalGateInput): LegalGateState {
	const state = deriveOwnerLegalGateState(input);
	return input.authenticationModalOpen && DIALOG_STATES_HELD_BEHIND_PRIVY_MODAL.has(state) ? "checking" : state;
}

function deriveOwnerLegalGateState({
	hasSession,
	isSessionPending,
	hasOwnerIdentity,
	ownerSetup,
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
	if (!hasOwnerIdentity) return deriveMissingOwnerState(ownerSetup);
	if (isPending && acceptedTerms === undefined) return "checking";
	if (hasStatusError) return "error";
	if (acceptedTerms === undefined) return "error";
	if (!userAllowed || !canPerformActions) return "blocked";
	if (!acceptedTerms && !hasWalletAccess) return "wallet_required";
	if (isSubmitting) return "submitting";
	return acceptedTerms ? "accepted" : "required";
}

function deriveMissingOwnerState(ownerSetup: LegalGateOwnerSetup): LegalGateState {
	if (ownerSetup === "pending") return "checking";
	return ownerSetup === "failed" ? "wallet_setup_failed" : "wallet_required";
}

interface EmailOwnerSetupInput {
	walletIntent: PrivyWalletIntent;
	hasOwnerIdentity: boolean;
	needsEmbeddedWallet: boolean;
	isCreatingEmbeddedWallet: boolean;
	hasEmbeddedWalletError: boolean;
	withinActivationGrace: boolean;
}

export function deriveEmailOwnerSetup({
	walletIntent,
	hasOwnerIdentity,
	needsEmbeddedWallet,
	isCreatingEmbeddedWallet,
	hasEmbeddedWalletError,
	withinActivationGrace,
}: EmailOwnerSetupInput): LegalGateOwnerSetup {
	if (walletIntent !== "embedded" || hasOwnerIdentity) return "settled";
	if (isCreatingEmbeddedWallet) return "pending";
	if (hasEmbeddedWalletError) return "failed";
	if (needsEmbeddedWallet) return "pending";
	return withinActivationGrace ? "pending" : "settled";
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

function useWithinGrace(key: string | null, durationMs: number): boolean {
	const [expiredKey, setExpiredKey] = useState<string | null>(null);

	useEffect(() => {
		if (key === null) {
			setExpiredKey(null);
			return;
		}
		const timeoutId = setTimeout(() => setExpiredKey(key), durationMs);
		return () => clearTimeout(timeoutId);
	}, [durationMs, key]);

	return key !== null && expiredKey !== key;
}

/**
 * Session facts shared by every legal gate. An email session's owner wallet is created silently
 * after login, so its absence is a pending setup rather than a wallet mismatch until creation fails
 * or the activation grace ends.
 */
export function useLegalGateSession() {
	const {
		address,
		authenticated,
		authenticationModalOpen,
		authenticationReady,
		hasWalletAccess,
		isConnected,
		isConnecting,
		isReconnecting,
		sessionMode,
		walletDirectoryReady,
		walletIntent,
	} = useWalletSession();
	const {
		embeddedWalletAddress,
		needsEmbeddedWallet,
		isCreatingEmbeddedWallet,
		embeddedWalletError,
		ensureEmailEmbeddedWallet,
	} = useEmailEmbeddedWallet();
	const activationKey =
		walletIntent === "embedded" && !address && embeddedWalletAddress ? embeddedWalletAddress.toLowerCase() : null;
	const withinActivationGrace = useWithinGrace(activationKey, EMAIL_OWNER_ACTIVATION_GRACE_MS);
	const ownerSetup = deriveEmailOwnerSetup({
		walletIntent,
		hasOwnerIdentity: !!address,
		needsEmbeddedWallet,
		isCreatingEmbeddedWallet,
		hasEmbeddedWalletError: !!embeddedWalletError,
		withinActivationGrace,
	});
	const session = deriveLegalGateSession({
		authenticationReady,
		authenticated,
		walletDirectoryReady,
		isConnecting,
		isReconnecting,
		isConnected,
		sessionMode,
	});

	function retryWalletSetup() {
		void ensureEmailEmbeddedWallet().catch(() => undefined);
	}

	return {
		...session,
		address,
		authenticationModalOpen,
		hasWalletAccess,
		ownerSetup,
		retryWalletSetup,
	};
}

export function useLegalGate() {
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
		retryWalletSetup,
	};
}
