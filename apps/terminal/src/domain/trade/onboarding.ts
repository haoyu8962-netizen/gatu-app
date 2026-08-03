import Big from "big.js";

export type TradingAccountFundingState = "loading" | "funded" | "empty" | "error";

interface TradingAccountFundingInput {
	isConnected: boolean;
	isLoading: boolean;
	hasError: boolean;
	hasPerpSnapshot: boolean;
	hasSpotSnapshot: boolean;
	perpAccountValues: readonly (string | null | undefined)[];
	spotBalances: readonly (string | null | undefined)[];
}

function isPositive(value: string | null | undefined): boolean {
	if (!value) return false;
	try {
		return Big(value).gt(0);
	} catch {
		return false;
	}
}

export function getTradingAccountFundingState({
	isConnected,
	isLoading,
	hasError,
	hasPerpSnapshot,
	hasSpotSnapshot,
	perpAccountValues,
	spotBalances,
}: TradingAccountFundingInput): TradingAccountFundingState {
	if (!isConnected) return "loading";
	if (perpAccountValues.some(isPositive) || spotBalances.some(isPositive)) return "funded";
	if (isLoading || !hasPerpSnapshot || !hasSpotSnapshot) return "loading";
	if (hasError) return "error";
	return "empty";
}
