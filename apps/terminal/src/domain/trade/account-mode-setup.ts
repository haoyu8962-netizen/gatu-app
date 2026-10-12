import type { TradingAccountFundingState } from "@/domain/trade/onboarding";

export const ACCOUNT_MODE_SETUP_MAX_ATTEMPTS = 3;
export const ACCOUNT_MODE_SETUP_RETRY_DELAY_MS = 5_000;
// Longer than the 30-second refetch of the account mode: a settled attempt whose account still
// reads `default` after this is handed back to the manual selection instead of loading forever.
export const ACCOUNT_MODE_SETUP_SETTLED_GRACE_MS = 45_000;

/**
 * How a session whose protocol account mode is still `default` is presented and handled
 * (docs/adr/0041-automatic-unified-account-for-new-accounts.md).
 */
export type AccountModeSetupKind = "not-applicable" | "awaiting-funds" | "pending" | "manual";

/** `unconfirmed`: current snapshots show an empty account while a cached summary shows funds. */
export type AccountModeSetupFundingState = TradingAccountFundingState | "unconfirmed";
export type AccountModeSetupLegalStatus = "loading" | "allowed" | "blocked";
export type AccountModeSetupSignerStatus = "loading" | "ready" | "action-required";
export type AccountModeSetupOrderHistory = "loading" | "empty" | "present" | "error";
export type AccountModeSetupAttemptStatus = "idle" | "in-flight" | "waiting" | "settled" | "exhausted" | "rejected";
export type AccountModeSetupFailure = "skipped" | "rejected" | "failed";

export interface AccountModeSetupInput {
	accountAbstraction: unknown;
	isAgentOnlySession: boolean;
	isBuilderAccount: boolean;
	fundingState: AccountModeSetupFundingState;
	legal: AccountModeSetupLegalStatus;
	signer: AccountModeSetupSignerStatus;
	orderHistory: AccountModeSetupOrderHistory;
	attempt: AccountModeSetupAttemptStatus;
}

export interface AccountModeSetupDecision {
	kind: AccountModeSetupKind;
	/** Every condition for the automatic signature holds right now, whatever the attempt status. */
	conditionsHold: boolean;
	canAttempt: boolean;
}

export interface AccountModeSetupFundingInput {
	/** Funding classified from the all-DEX and spot WebSocket snapshots alone. */
	snapshots: TradingAccountFundingState;
	/** The same classification with the selected DEX summary, which may come from a cached request. */
	withCachedSummary: TradingAccountFundingState;
	snapshotsCurrent: boolean;
}

/**
 * A funded or an empty conclusion counts only when it comes from complete, current, successful
 * snapshots. A cached summary never makes an account funded; when it contradicts an empty
 * conclusion the account is neither, and it is left to the manual selection.
 */
export function getAccountModeSetupFundingState({
	snapshots,
	withCachedSummary,
	snapshotsCurrent,
}: AccountModeSetupFundingInput): AccountModeSetupFundingState {
	if (snapshots === "error") return "error";
	if (!snapshotsCurrent) return "loading";
	return snapshots === "empty" && withCachedSummary === "funded" ? "unconfirmed" : snapshots;
}

const TERMINAL_REJECTIONS: readonly RegExp[] = [
	/^Abstraction transition not allowed\.?$/i,
	/^Cannot set abstraction for deployer or fee recipient\.?$/i,
];

function decide(kind: AccountModeSetupKind): AccountModeSetupDecision {
	return { kind, conditionsHold: false, canAttempt: false };
}

export function getAccountModeSetupDecision(input: AccountModeSetupInput): AccountModeSetupDecision {
	if (input.accountAbstraction !== "default") return decide("not-applicable");
	if (input.isAgentOnlySession || input.isBuilderAccount) return decide("manual");
	if (input.attempt === "rejected" || input.attempt === "exhausted") return decide("manual");
	if (input.orderHistory === "present") return decide("manual");
	if (input.fundingState === "empty") return decide("awaiting-funds");
	if (input.fundingState === "unconfirmed") return decide("manual");
	if (input.fundingState !== "funded") return decide("pending");
	if (input.legal === "blocked" || input.signer === "action-required") return decide("manual");
	if (input.orderHistory === "error") return decide("manual");
	if (input.legal !== "allowed" || input.signer !== "ready" || input.orderHistory !== "empty") {
		return decide("pending");
	}
	return { kind: "pending", conditionsHold: true, canAttempt: input.attempt === "idle" };
}

/**
 * The exchange's own text for a rejected request, read straight from the SDK error. The automatic
 * setup shows no message, so it does not load the application's error catalog at startup.
 */
export function getExchangeRejectionText(error: unknown): string | null {
	if (typeof error !== "object" || error === null) return null;
	const { name, response } = error as { name?: unknown; response?: unknown };
	if (name !== "ApiRequestError" || typeof response !== "object" || response === null) return null;
	const text = (response as { response?: unknown }).response;
	return typeof text === "string" ? text : null;
}

export function isTerminalAccountModeSetupRejection(text: string): boolean {
	const trimmed = text.trim();
	return TERMINAL_REJECTIONS.some((pattern) => pattern.test(trimmed));
}

export function getAccountModeSetupAttemptStatusAfterFailure(
	failure: AccountModeSetupFailure,
	attempts: number,
): AccountModeSetupAttemptStatus {
	if (failure === "skipped") return "settled";
	if (failure === "rejected") return "rejected";
	return attempts >= ACCOUNT_MODE_SETUP_MAX_ATTEMPTS ? "exhausted" : "waiting";
}
