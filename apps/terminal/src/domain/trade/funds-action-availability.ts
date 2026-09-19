import type { AccountModeAvailability } from "./account-abstraction";

export type FundsActionGeoStatus = "allowed" | "restricted" | "unresolved";

export type FundsActionSessionMode = "wallet" | "agent-only" | "disconnected";

export type FundsActionAvailabilityReason =
	| "account-data-unavailable"
	| "account-mode-unresolved"
	| "account-mode-unsupported"
	| "agent-only-session"
	| "funds-actions-unavailable"
	| "geo-restricted"
	| "geo-unresolved"
	| "internal-transfers-unavailable"
	| "wallet-session-required";

export interface FundsActionAvailability {
	available: boolean;
	reason: FundsActionAvailabilityReason | null;
}

interface BaseFundsActionAvailabilityInput {
	accountDataReady: boolean;
	accountModeStatus: AccountModeAvailability;
	geoStatus: FundsActionGeoStatus;
	hasWalletAccess: boolean;
	sessionMode?: FundsActionSessionMode;
}

interface WithdrawalAvailabilityInput extends BaseFundsActionAvailabilityInput {
	fundsActionsEnabled: boolean;
}

interface InternalTransferAvailabilityInput extends BaseFundsActionAvailabilityInput {
	internalTransfersEnabled: boolean;
}

interface FundsActionGeoStatusInput {
	isResolved: boolean;
	proxy: boolean;
	tradeRestricted: boolean;
}

interface FreshGeoRefreshResult {
	data?: {
		country?: unknown;
		proxy?: unknown;
		tradeRestricted?: unknown;
	} | null;
	isError: boolean;
}

interface AssertFreshFundsActionGeoInput {
	refresh: () => Promise<FreshGeoRefreshResult>;
	restrictedMessage: string;
	signal: AbortSignal;
	unavailableMessage: string;
}

export function getFundsActionGeoStatus({
	isResolved,
	proxy,
	tradeRestricted,
}: FundsActionGeoStatusInput): FundsActionGeoStatus {
	if (!isResolved) return "unresolved";
	return tradeRestricted || proxy ? "restricted" : "allowed";
}

export function getWithdrawalAvailability({
	accountDataReady,
	accountModeStatus,
	fundsActionsEnabled,
	geoStatus,
	hasWalletAccess,
	sessionMode,
}: WithdrawalAvailabilityInput): FundsActionAvailability {
	const baseReason = getBaseFundsActionUnavailableReason({
		accountDataReady,
		accountModeStatus,
		geoStatus,
		hasWalletAccess,
		sessionMode,
	});
	if (baseReason) return { available: false, reason: baseReason };
	if (!fundsActionsEnabled) return { available: false, reason: "funds-actions-unavailable" };
	return { available: true, reason: null };
}

export function getInternalTransferAvailability({
	accountDataReady,
	accountModeStatus,
	geoStatus,
	hasWalletAccess,
	internalTransfersEnabled,
	sessionMode,
}: InternalTransferAvailabilityInput): FundsActionAvailability {
	const baseReason = getBaseFundsActionUnavailableReason({
		accountDataReady,
		accountModeStatus,
		geoStatus,
		hasWalletAccess,
		sessionMode,
	});
	if (baseReason) return { available: false, reason: baseReason };
	if (!internalTransfersEnabled) return { available: false, reason: "internal-transfers-unavailable" };
	return { available: true, reason: null };
}

export async function assertFreshFundsActionGeo({
	refresh,
	restrictedMessage,
	signal,
	unavailableMessage,
}: AssertFreshFundsActionGeoInput): Promise<void> {
	signal.throwIfAborted();

	let result: FreshGeoRefreshResult;
	try {
		result = await refresh();
	} catch {
		signal.throwIfAborted();
		throw new Error(unavailableMessage);
	}

	signal.throwIfAborted();
	const verdict = result.data;
	if (
		result.isError ||
		!verdict ||
		typeof verdict.country !== "string" ||
		!/^[A-Z]{2}$/.test(verdict.country) ||
		typeof verdict.tradeRestricted !== "boolean" ||
		typeof verdict.proxy !== "boolean"
	) {
		throw new Error(unavailableMessage);
	}
	if (verdict.tradeRestricted || verdict.proxy) throw new Error(restrictedMessage);
}

function getBaseFundsActionUnavailableReason({
	accountDataReady,
	accountModeStatus,
	geoStatus,
	hasWalletAccess,
	sessionMode,
}: BaseFundsActionAvailabilityInput): FundsActionAvailabilityReason | null {
	if (geoStatus === "restricted") return "geo-restricted";
	if (geoStatus === "unresolved") return "geo-unresolved";
	if (sessionMode === "agent-only") return "agent-only-session";
	if (!hasWalletAccess) return "wallet-session-required";
	if (accountModeStatus === "unsupported") return "account-mode-unsupported";
	if (accountModeStatus !== "supported") return "account-mode-unresolved";
	if (!accountDataReady) return "account-data-unavailable";
	return null;
}
