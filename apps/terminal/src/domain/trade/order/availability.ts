import type { AccountModeSetupKind } from "@/domain/trade/account-mode-setup";
import { toBig } from "@/lib/trade/numbers";
import type { Side } from "@/lib/trade/types";

export type AssetAvailabilityStatus = "idle" | "loading" | "success" | "stale" | "error";

type SubscriptionStatus = "idle" | "subscribing" | "active" | "error";

interface ActiveAssetIdentity {
	coin: string;
	user: string;
}

interface GetAssetAvailabilityStatusInput {
	isConnected: boolean;
	isPerpMarket: boolean;
	coin: string | undefined;
	user: string | undefined;
	data: ActiveAssetIdentity | undefined;
	subscriptionStatus: SubscriptionStatus;
	isStale: boolean;
}

interface GetStreamAvailabilityStatusInput {
	isConnected: boolean;
	hasData: boolean;
	subscriptionStatus: SubscriptionStatus;
	isStale: boolean;
}

interface GetOrderAvailabilityStatusInput {
	isConnected: boolean;
	marketKind: "spot" | "perp" | "builderPerp" | undefined;
	spotStatus: AssetAvailabilityStatus;
	perpStatus: AssetAvailabilityStatus;
}

export interface OrderAvailabilityFlags {
	isLoading: boolean;
	isStale: boolean;
	hasError: boolean;
	isBlocked: boolean;
}

export function getDirectionalAvailableToTrade(
	availableToTrade: readonly [string, string] | null | undefined,
	side: Side,
): string | null {
	const value = availableToTrade?.[side === "buy" ? 0 : 1];
	const amount = toBig(value);
	return amount?.gte(0) ? (value ?? null) : null;
}

export function getStreamAvailabilityStatus({
	isConnected,
	hasData,
	subscriptionStatus,
	isStale,
}: GetStreamAvailabilityStatusInput): AssetAvailabilityStatus {
	if (!isConnected) return "idle";
	if (subscriptionStatus === "error") return "error";
	if (subscriptionStatus !== "active" || !hasData) return "loading";
	return isStale ? "stale" : "success";
}

export function getAssetAvailabilityStatus({
	isConnected,
	isPerpMarket,
	coin,
	user,
	data,
	subscriptionStatus,
	isStale,
}: GetAssetAvailabilityStatusInput): AssetAvailabilityStatus {
	if (!isConnected || !isPerpMarket || !coin || !user) return "idle";
	if (subscriptionStatus === "error") return "error";
	if (subscriptionStatus !== "active" || !data) return "loading";

	const matchesCoin = data.coin === coin;
	const matchesUser = data.user.toLowerCase() === user.toLowerCase();
	if (!matchesCoin || !matchesUser) return "loading";
	return isStale ? "stale" : "success";
}

export function getOrderAvailabilityStatus({
	isConnected,
	marketKind,
	spotStatus,
	perpStatus,
}: GetOrderAvailabilityStatusInput): AssetAvailabilityStatus {
	if (!isConnected) return "idle";
	if (!marketKind) return "loading";
	const status = marketKind === "spot" ? spotStatus : perpStatus;
	return status === "idle" ? "loading" : status;
}

interface GetAccountModeAvailabilityStatusInput {
	isConnected: boolean;
	isModeSupported: boolean;
	areBalancesLoading: boolean;
	accountModeSetup: AccountModeSetupKind;
	streamStatus: AssetAvailabilityStatus;
}

/**
 * Order availability for an account mode this terminal does not trade in: never `success`, so the
 * submit path stays closed whatever the trade-size stream reports. A mode that is being set up
 * automatically reads as loading (ADR 0041); the Deposit action of a new empty account is a
 * presentation decision made by the order action stage, not by this status.
 */
export function getAccountModeAvailabilityStatus({
	isConnected,
	isModeSupported,
	areBalancesLoading,
	accountModeSetup,
	streamStatus,
}: GetAccountModeAvailabilityStatusInput): AssetAvailabilityStatus {
	if (!isConnected || isModeSupported) return streamStatus;
	if (areBalancesLoading || accountModeSetup === "pending") return "loading";
	return "error";
}

export function getOrderAvailabilityFlags(
	isConnected: boolean,
	status: AssetAvailabilityStatus,
): OrderAvailabilityFlags {
	const hasUsableSnapshot = status === "success";

	return {
		isLoading: status === "loading",
		isStale: status === "stale",
		hasError: status === "error",
		isBlocked: isConnected && !hasUsableSnapshot,
	};
}
