import Big from "big.js";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import type { TokenUsdPrices } from "@/domain/trade/balances";
import type { InfoResponse } from "@/lib/hyperliquid";
import { toBig, toSafeBig } from "@/lib/trade/numbers";

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
	return history?.at(-1)?.[1] ?? null;
}

export function calculateMaxDrawdown(history: PortfolioSnapshot["accountValueHistory"] | undefined): string | null {
	if (!history?.length) return null;

	let peak = Big(0);
	let largestDrawdown = Big(0);

	for (const [, value] of history) {
		const current = toSafeBig(value);
		if (current.gt(peak)) {
			peak = current;
			continue;
		}
		if (peak.lte(0)) continue;

		const drawdown = peak.minus(current).div(peak);
		if (drawdown.gt(largestDrawdown)) largestDrawdown = drawdown;
	}

	return largestDrawdown.times(-1).toString();
}

export function calculateFourteenDayVolume(dailyVolume: DailyUserVolume | null | undefined): string | null {
	if (dailyVolume == null) return null;
	if (!dailyVolume.length) return "0";

	return [...dailyVolume]
		.sort((a, b) => a.date.localeCompare(b.date))
		.slice(-14)
		.reduce((total, day) => total.plus(toSafeBig(day.userCross)).plus(toSafeBig(day.userAdd)), Big(0))
		.toString();
}

export function calculateVaultEquity(vaults: UserVaultEquities | null | undefined): string {
	return (vaults ?? []).reduce((total, vault) => total.plus(toSafeBig(vault.equity)), Big(0)).toString();
}

export function calculateEarnBalance(
	userState: BorrowLendUserState | null | undefined,
	reserveStates: BorrowLendReserveStates | null | undefined,
): string {
	if (!userState?.tokenToState.length || !reserveStates?.length) return "0";

	const oraclePrices = new Map(reserveStates.map(([tokenId, state]) => [tokenId, toSafeBig(state.oraclePx)]));

	return userState.tokenToState
		.reduce((total, [tokenId, state]) => {
			const oraclePrice = oraclePrices.get(tokenId);
			if (!oraclePrice) return total;

			const netTokenValue = toSafeBig(state.supply.value).minus(toSafeBig(state.borrow.value));
			return total.plus(netTokenValue.times(oraclePrice));
		}, Big(0))
		.toString();
}

export function calculateCoreAccountEquity({
	spotEquity,
	perpEquity,
	usesSharedQuoteBalance,
}: {
	spotEquity: string | number;
	perpEquity: string | number;
	usesSharedQuoteBalance: boolean;
}): string {
	const spotValue = toSafeBig(spotEquity);
	return (usesSharedQuoteBalance ? spotValue : spotValue.plus(toSafeBig(perpEquity))).toString();
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
		const value = toSafeBig(accountValue);
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
	portfolioValue,
	coreEquity,
	vaultEquity,
	earnBalance,
	currentSourcesAvailable,
}: {
	portfolioValue: string | null | undefined;
	coreEquity: string | number;
	vaultEquity: string | number;
	earnBalance: string | number;
	currentSourcesAvailable: boolean;
}): string | null {
	if (!currentSourcesAvailable) return portfolioValue == null ? null : toSafeBig(portfolioValue).toString();

	return toSafeBig(coreEquity).plus(toSafeBig(vaultEquity)).plus(toSafeBig(earnBalance)).toString();
}
