import Big from "big.js";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { isSupportedAccountAbstraction } from "@/domain/trade/account-abstraction";
import {
	getSpotAccountValueUsdValue,
	isQuoteBalanceSharedWithPerps,
	type TokenUsdPrices,
} from "@/domain/trade/balances";
import type { AssetAvailabilityStatus } from "@/domain/trade/order/availability";
import type { AccountBalances } from "@/hooks/trade/use-account-balances";
import type { InfoResponse } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";

export type PortfolioPeriod = "day" | "week" | "month" | "allTime";
export type PortfolioScope = "combined" | "perps";

export type PortfolioSnapshot = InfoResponse<"portfolio">[number][1];
type DailyUserVolume = InfoResponse<"userFees">["dailyUserVlm"];
type BorrowLendUserState = InfoResponse<"borrowLendUserState">;
type BorrowLendReserveStates = InfoResponse<"allBorrowLendReserveStates">;
type UserVaultEquities = InfoResponse<"userVaultEquities">;

interface PerpDexAccountValue {
	dex: string;
	accountValue: string | number | null | undefined;
}

interface PerpDexCollateral {
	dex: string;
	collateralToken: string | undefined;
}

const PORTFOLIO_PERIOD_KEYS: Record<PortfolioScope, Record<PortfolioPeriod, InfoResponse<"portfolio">[number][0]>> = {
	combined: {
		day: "day",
		week: "week",
		month: "month",
		allTime: "allTime",
	},
	perps: {
		day: "perpDay",
		week: "perpWeek",
		month: "perpMonth",
		allTime: "perpAllTime",
	},
};

export function getPortfolioSnapshot(
	portfolio: InfoResponse<"portfolio"> | null | undefined,
	scope: PortfolioScope,
	period: PortfolioPeriod,
): PortfolioSnapshot | null {
	const periodKey = PORTFOLIO_PERIOD_KEYS[scope][period];
	return portfolio?.find(([key]) => key === periodKey)?.[1] ?? null;
}

export function getLatestHistoryValue(history: PortfolioSnapshot["accountValueHistory"] | undefined): string | null {
	return toBig(history?.at(-1)?.[1])?.toString() ?? null;
}

/**
 * The exchange's daily volume list ends with the current, unfinished day; like the official
 * terminal, the 14-day volume leaves it out and sums the 14 completed days before it.
 */
export function calculateFourteenDayVolume(dailyVolume: DailyUserVolume | null | undefined): string | null {
	if (dailyVolume == null) return null;
	let total = Big(0);
	const completedDays = [...dailyVolume].sort((a, b) => a.date.localeCompare(b.date)).slice(0, -1);
	for (const day of completedDays.slice(-14)) {
		const cross = toBig(day.userCross);
		const add = toBig(day.userAdd);
		if (!cross || !add || cross.lt(0) || add.lt(0)) return null;
		total = total.plus(cross).plus(add);
	}
	return total.toString();
}

export function calculateVaultEquity(vaults: UserVaultEquities | null | undefined): string | null {
	if (!vaults) return null;
	let total = Big(0);
	for (const vault of vaults) {
		const equity = toBig(vault.equity);
		if (!equity) return null;
		total = total.plus(equity);
	}
	return total.toString();
}

export function hasBorrowLendExposure(userState: BorrowLendUserState | null | undefined): boolean | null {
	if (!userState || !Array.isArray(userState.tokenToState)) return null;
	let hasExposure = false;
	for (const [, state] of userState.tokenToState) {
		const supply = toBig(state.supply?.value);
		const borrow = toBig(state.borrow?.value);
		if (!supply || !borrow || supply.lt(0) || borrow.lt(0)) return null;
		hasExposure ||= supply.gt(0) || borrow.gt(0);
	}
	return hasExposure;
}

export function calculateEarnBalance(
	userState: BorrowLendUserState | null | undefined,
	reserveStates: BorrowLendReserveStates | null | undefined,
): string | null {
	const exposure = hasBorrowLendExposure(userState);
	if (exposure === null || !userState) return null;
	if (!exposure) return "0";
	const oraclePrices = new Map((reserveStates ?? []).map(([tokenId, state]) => [tokenId, toBig(state.oraclePx)]));
	let total = Big(0);
	for (const [tokenId, state] of userState.tokenToState) {
		const supply = toBig(state.supply?.value);
		const borrow = toBig(state.borrow?.value);
		if (!supply || !borrow) return null;
		if (supply.eq(0) && borrow.eq(0)) continue;
		const price = oraclePrices.get(tokenId);
		if (!price?.gt(0)) return null;
		total = total.plus(supply.minus(borrow).times(price));
	}
	return total.toString();
}

export function calculateCoreAccountEquity({
	spotEquity,
	perpEquity,
	usesSharedQuoteBalance,
}: {
	spotEquity: string | null;
	perpEquity: string | null;
	usesSharedQuoteBalance: boolean;
}): string | null {
	const spot = toBig(spotEquity);
	const perps = usesSharedQuoteBalance ? Big(0) : toBig(perpEquity);
	return spot && perps ? spot.plus(perps).toString() : null;
}

export function calculateAllDexPerpEquityUsd({
	accounts,
	collaterals,
	tokenUsdPrices,
}: {
	accounts: readonly PerpDexAccountValue[];
	collaterals: readonly PerpDexCollateral[];
	tokenUsdPrices: TokenUsdPrices;
}): string | null {
	const collateralByDex = new Map<string, string>([["", DEFAULT_QUOTE_TOKEN]]);
	for (const { dex, collateralToken } of collaterals) {
		if (collateralToken && !collateralByDex.has(dex)) collateralByDex.set(dex, collateralToken);
	}

	let total = Big(0);
	for (const { dex, accountValue } of accounts) {
		const value = toBig(accountValue);
		if (!value) return null;
		if (value.eq(0)) continue;

		const collateralToken = collateralByDex.get(dex);
		if (!collateralToken) return null;

		const collateralUsdPrice =
			collateralToken === DEFAULT_QUOTE_TOKEN ? Big(1) : toBig(tokenUsdPrices?.[collateralToken]);
		if (!collateralUsdPrice?.gt(0)) return null;

		total = total.plus(value.times(collateralUsdPrice));
	}

	return total.toString();
}

export function resolveCurrentTotalEquity({
	coreEquity,
	vaultEquity,
	earnBalance,
	currentSourcesAvailable,
}: {
	coreEquity: string | null;
	vaultEquity: string | null;
	earnBalance: string | null;
	currentSourcesAvailable: boolean;
}): string | null {
	if (!currentSourcesAvailable) return null;
	const core = toBig(coreEquity);
	const vault = toBig(vaultEquity);
	const earn = toBig(earnBalance);
	return core && vault && earn ? core.plus(vault).plus(earn).toString() : null;
}

export const PORTFOLIO_REFRESH_INTERVAL_MS = 60_000;
export const PORTFOLIO_MAX_AGE_MS = 120_000;
/**
 * `refreshing`: the data is past the age limit or its last request failed, and a new request is on its
 * way. Like the official terminal, which keeps its previous portfolio until the next answer arrives,
 * the last successful data stays on screen until that request settles; a failure then reports `error`.
 * It never covers data received before this mount or stamped in the future by a clock that was set back:
 * those stay withheld as before.
 */
export type PortfolioSourceStatus = "loading" | "error" | "stale" | "unavailable" | "refreshing" | "ready";

export function getPortfolioQueryStatus(
	query: {
		data: unknown;
		dataUpdatedAt: number;
		fetchStatus: "fetching" | "paused" | "idle";
		isError: boolean;
		isPending: boolean;
		isPlaceholderData: boolean;
		isFetchedAfterMount: boolean;
	},
	enabled: boolean,
	now: number,
): PortfolioSourceStatus {
	if (!enabled) return "unavailable";
	const hasSuccessfulData = query.data !== undefined && Number.isFinite(query.dataUpdatedAt) && query.dataUpdatedAt > 0;
	const refreshing =
		query.fetchStatus === "fetching" &&
		hasSuccessfulData &&
		!query.isPlaceholderData &&
		query.isFetchedAfterMount &&
		query.dataUpdatedAt <= now;
	if (query.isError) return refreshing ? "refreshing" : "error";
	if (query.isPending || query.isPlaceholderData || !query.isFetchedAfterMount) return "loading";
	if (!hasSuccessfulData) return "unavailable";
	const age = now - query.dataUpdatedAt;
	if (age < 0 || age >= PORTFOLIO_MAX_AGE_MS) return refreshing ? "refreshing" : "stale";
	return "ready";
}

export function isPortfolioSourceShown(status: PortfolioSourceStatus): boolean {
	return status === "ready" || status === "refreshing";
}

export function derivePortfolioAccountEquity({
	balances,
	collaterals,
	tokenUsdPrices,
	tokenUsdPriceStatus,
	isConnected,
	borrowLendState,
}: {
	balances: AccountBalances;
	collaterals: readonly PerpDexCollateral[];
	tokenUsdPrices: TokenUsdPrices;
	tokenUsdPriceStatus: AssetAvailabilityStatus;
	isConnected: boolean;
	borrowLendState: BorrowLendUserState | undefined;
}) {
	const modeReady = isConnected && isSupportedAccountAbstraction(balances.accountAbstraction);
	const usesSharedQuoteBalance = isQuoteBalanceSharedWithPerps(balances.accountAbstraction);
	const prices = tokenUsdPriceStatus === "success" ? tokenUsdPrices : undefined;
	const spotReady = modeReady && balances.hasSpotStateSnapshot && balances.spotStateStatus === "success";
	const perpsReady = modeReady && balances.hasAllDexsSnapshot && balances.perpStateStatus === "success";
	const spotEquity = spotReady ? getSpotAccountValueUsdValue(balances.spotBalances, prices) : null;
	const perpEquity =
		perpsReady && !usesSharedQuoteBalance
			? calculateAllDexPerpEquityUsd({
					accounts: balances.allDexClearinghouseStates.map(([dex, state]) => ({
						dex,
						accountValue: state.marginSummary.accountValue,
					})),
					collaterals,
					tokenUsdPrices: prices,
				})
			: null;
	const exposure = hasBorrowLendExposure(borrowLendState);
	const hasSpotLending = balances.spotBalances.some((balance) => {
		const amounts = [
			"supplied" in balance ? balance.supplied : undefined,
			"borrowed" in balance ? balance.borrowed : undefined,
		];
		return amounts.some((amount) => amount !== undefined && toBig(amount)?.eq(0) !== true);
	});
	const hasUnresolvedLendingOverlap = hasSpotLending || (usesSharedQuoteBalance && exposure === true);
	const coreEquity = calculateCoreAccountEquity({ spotEquity, perpEquity, usesSharedQuoteBalance });
	return { spotEquity, perpEquity, coreEquity, usesSharedQuoteBalance, hasUnresolvedLendingOverlap };
}
