import type { SpotMarket, UnifiedMarket } from "@sairn/hl-react";
import Big from "big.js";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { isSupportedAccountAbstraction } from "@/domain/trade/account-abstraction";
import type {
	AccountAbstraction,
	MarginSummary,
	PerpPosition,
	SpotAvailableAfterMaintenance,
	SpotBalance,
} from "@/hooks/trade/use-account-balances";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import { toBig, toSafeBig } from "@/lib/trade/numbers";
import type { Side } from "@/lib/trade/types";

export type { AccountAbstraction, SpotAvailableAfterMaintenance };

export function getMarketQuoteToken(market: UnifiedMarket | undefined): string {
	if (!market) return DEFAULT_QUOTE_TOKEN;

	if (market.kind === "spot") {
		return market.tokensInfo?.[1]?.name ?? DEFAULT_QUOTE_TOKEN;
	}

	if (market.kind === "builderPerp") {
		return market.quoteToken?.name ?? DEFAULT_QUOTE_TOKEN;
	}

	return DEFAULT_QUOTE_TOKEN;
}

export interface SpotBalanceData {
	baseAvailable: number;
	quoteAvailable: number;
	baseName: string;
	quoteName: string;
}

export interface BalanceRow {
	asset: string;
	type: "perp" | "spot";
	available: string;
	transferable: string;
	tradeAvailable?: string | null;
	inOrder: string;
	total: string;
	usdValue: string;
	entryNtl: string;
}

export interface PerpSummary {
	accountValue?: string | number | null;
	totalMarginUsed?: string | number | null;
	totalNtlPos?: string | number | null;
}

export interface PerpBalanceRowOptions {
	marginSummary?: MarginSummary | null;
	quoteToken?: string;
	tokenUsdPrices?: TokenUsdPrices;
	tradeAvailable?: string | null;
}

export function getSpotBalance(balances: SpotBalance[] | null | undefined, coin: string): SpotBalance | null {
	if (!balances?.length) return null;
	return balances.find((balance) => balance.coin === coin) ?? null;
}

/** Mid prices keyed by coin, as delivered by the allMids subscription. */
export type TokenUsdPrices = Record<string, string> | null | undefined;

export function addSpotMarketPriceAliases(
	tokenUsdPrices: TokenUsdPrices,
	spotMarkets: readonly SpotMarket[],
): TokenUsdPrices {
	if (!tokenUsdPrices) return tokenUsdPrices;

	const result = { ...tokenUsdPrices };
	const resolvedTokenPrices = new Map<string, { price: Big; hops: number }>([
		[DEFAULT_QUOTE_TOKEN, { price: Big(1), hops: 0 }],
	]);
	const pairs: Array<{ base: string; quote: string; mid: Big }> = [];

	// `allMids` shares one object namespace between perp coin names and spot
	// market identifiers such as `@107`. A raw coin-name entry can therefore be
	// the mid of a same-named perp, not a USD price for the spot token. Remove
	// every spot-token alias first and only add it back after resolving a spot
	// route to USDC.
	for (const market of spotMarkets) {
		for (const token of market.tokensInfo) {
			if (token.name !== DEFAULT_QUOTE_TOKEN) delete result[token.name];
		}
	}

	for (const market of spotMarkets) {
		const baseToken = market.tokensInfo[0];
		const quoteToken = market.tokensInfo[1];
		const mid = toBig(tokenUsdPrices[market.name]);
		if (!baseToken || !quoteToken || !mid?.gt(0)) continue;
		pairs.push({ base: baseToken.name, quote: quoteToken.name, mid });
	}

	for (let pass = 0; pass < pairs.length; pass++) {
		let changed = false;
		for (const pair of pairs) {
			const quotePrice = resolvedTokenPrices.get(pair.quote);
			if (!quotePrice) continue;

			const hops = quotePrice.hops + 1;
			const current = resolvedTokenPrices.get(pair.base);
			if (current && current.hops <= hops) continue;

			const price = pair.mid.times(quotePrice.price);
			resolvedTokenPrices.set(pair.base, { price, hops });
			result[pair.base] = price.toString();
			changed = true;
		}
		if (!changed) break;
	}

	return result;
}

function getSpotUsdValue(balance: SpotBalance, tokenUsdPrices?: TokenUsdPrices): string {
	if (balance.coin === DEFAULT_QUOTE_TOKEN) return balance.total ?? "0";

	const price = toBig(tokenUsdPrices?.[balance.coin]);
	if (price?.gt(0)) {
		return toSafeBig(balance.total).times(price).toString();
	}

	return balance.entryNtl ?? "0";
}

function getTokenUsdPrice(token: string | null | undefined, tokenUsdPrices?: TokenUsdPrices): Big | null {
	if (token === DEFAULT_QUOTE_TOKEN) return Big(1);
	const price = token ? toBig(tokenUsdPrices?.[token]) : null;
	return price?.gt(0) ? price : null;
}

/** Converts a collateral-denominated amount to USD without inventing a price. */
export function getTokenAmountUsdValue(
	value: string | number | null | undefined,
	token: string | null | undefined,
	tokenUsdPrices?: TokenUsdPrices,
): string | null {
	const amount = toBig(value);
	if (!amount) return null;
	if (amount.eq(0)) return "0";
	const price = getTokenUsdPrice(token, tokenUsdPrices);
	return price ? amount.times(price).toString() : null;
}

/** Returns the current USD value only when every non-zero spot balance has a current price. */
export function getSpotAccountValueUsdValue(
	spotBalances: SpotBalance[] | null | undefined,
	tokenUsdPrices?: TokenUsdPrices,
): string | null {
	let totalUsd = Big(0);
	for (const balance of spotBalances ?? []) {
		const total = toBig(balance.total);
		if (!total) return null;
		if (total.eq(0)) continue;
		const price = getTokenUsdPrice(balance.coin, tokenUsdPrices);
		if (!price) return null;
		totalUsd = totalUsd.plus(total.times(price));
	}
	return totalUsd.toString();
}

export function isQuoteBalanceSharedWithPerps(accountAbstraction: AccountAbstraction | null | undefined): boolean {
	return accountAbstraction === "unifiedAccount" || accountAbstraction === "portfolioMargin";
}

export type BalanceAccountMode = "unified" | "portfolioMargin" | "separate" | "unavailable";

export interface AccountBalanceSummary {
	mode: BalanceAccountMode;
	isAvailable: boolean;
	usesSpotStateForPerps: boolean;
	accountEquity: number;
	balance: number;
	available: number;
	withdrawable: number;
	spotUsdcWithdrawable: number;
	spotUsdcTotal: number;
	spotUsdcAvailable: number;
	spotUsdcHold: number;
	spotAccountValue: number;
	perpAccountValue: number;
	perpWithdrawable: number;
	perpMarginUsed: number;
	perpTotalRawUsd: number;
	hasSpotFundsWhenPerpWithdrawableZero: boolean;
}

export interface PerpRiskSummary {
	totalNtlPos: number;
	totalMarginUsed: number;
	crossMaintenanceMarginUsed: number;
	unrealizedPnl: number;
}

export interface PerpRiskSummaryValue {
	totalNtlPos: string;
	totalMarginUsed: string;
	crossMaintenanceMarginUsed: string;
	unrealizedPnl: string;
}

interface PerpRiskState {
	marginSummary?: MarginSummary | null;
	crossMaintenanceMarginUsed?: string | number | null;
	assetPositions?: PerpPosition[] | null;
}

export interface PerpRiskUsdState extends PerpRiskState {
	collateralToken: string | null | undefined;
}

export function accountOverviewNeedsTokenUsdPrices({
	accountValues = [],
	spotBalances = [],
	perpRiskStates = [],
}: {
	accountValues?: readonly { token: string | null | undefined; value: string | number | null | undefined }[];
	spotBalances?: readonly SpotBalance[];
	perpRiskStates?: readonly PerpRiskUsdState[];
}): boolean {
	for (const { token, value } of accountValues) {
		if (token && token !== DEFAULT_QUOTE_TOKEN && toBig(value)?.eq(0) === false) return true;
	}

	for (const balance of spotBalances) {
		if (balance.coin !== DEFAULT_QUOTE_TOKEN && toBig(balance.total)?.eq(0) === false) return true;
	}

	for (const state of perpRiskStates) {
		if (!state.collateralToken || state.collateralToken === DEFAULT_QUOTE_TOKEN) continue;
		if (
			[
				state.marginSummary?.totalNtlPos,
				state.marginSummary?.totalMarginUsed,
				state.crossMaintenanceMarginUsed,
				...(state.assetPositions ?? []).map((position) => position.position.unrealizedPnl),
			].some((value) => toBig(value)?.eq(0) === false)
		)
			return true;
	}

	return false;
}

interface PerpDexRiskState extends PerpRiskState {
	dex: string;
}

interface PerpDexCollateralToken {
	dex: string;
	token: number;
}

function getBalanceMode(accountAbstraction: AccountAbstraction | null | undefined): BalanceAccountMode {
	if (accountAbstraction === "unifiedAccount") return "unified";
	if (accountAbstraction === "portfolioMargin") return "portfolioMargin";
	if (accountAbstraction === "disabled") return "separate";
	return "unavailable";
}

export function getPerpRiskSummaryValue(states: PerpRiskState[]): PerpRiskSummaryValue {
	let totalNtlPos = Big(0);
	let totalMarginUsed = Big(0);
	let crossMaintenanceMarginUsed = Big(0);
	let unrealizedPnl = Big(0);

	for (const state of states) {
		totalNtlPos = totalNtlPos.plus(toSafeBig(state.marginSummary?.totalNtlPos));
		totalMarginUsed = totalMarginUsed.plus(toSafeBig(state.marginSummary?.totalMarginUsed));
		crossMaintenanceMarginUsed = crossMaintenanceMarginUsed.plus(toSafeBig(state.crossMaintenanceMarginUsed));
		for (const pos of state.assetPositions ?? []) {
			unrealizedPnl = unrealizedPnl.plus(toSafeBig(pos.position.unrealizedPnl));
		}
	}

	return {
		totalNtlPos: totalNtlPos.toString(),
		totalMarginUsed: totalMarginUsed.toString(),
		crossMaintenanceMarginUsed: crossMaintenanceMarginUsed.toString(),
		unrealizedPnl: unrealizedPnl.toString(),
	};
}

/** Aggregates perp risk after converting each DEX from its collateral token into USD. */
export function getPerpRiskSummaryUsdValue(
	states: readonly PerpRiskUsdState[],
	tokenUsdPrices?: TokenUsdPrices,
): PerpRiskSummaryValue | null {
	let totalNtlPos = Big(0);
	let totalMarginUsed = Big(0);
	let crossMaintenanceMarginUsed = Big(0);
	let unrealizedPnl = Big(0);

	for (const state of states) {
		const stateTotalNtlPos = toBig(state.marginSummary?.totalNtlPos);
		const stateTotalMarginUsed = toBig(state.marginSummary?.totalMarginUsed);
		const stateCrossMaintenance = toBig(state.crossMaintenanceMarginUsed);
		if (!stateTotalNtlPos || !stateTotalMarginUsed || !stateCrossMaintenance) return null;

		let stateUnrealizedPnl = Big(0);
		for (const position of state.assetPositions ?? []) {
			const positionPnl = toBig(position.position.unrealizedPnl);
			if (!positionPnl) return null;
			stateUnrealizedPnl = stateUnrealizedPnl.plus(positionPnl);
		}

		const hasValue =
			!stateTotalNtlPos.eq(0) ||
			!stateTotalMarginUsed.eq(0) ||
			!stateCrossMaintenance.eq(0) ||
			!stateUnrealizedPnl.eq(0);
		if (!hasValue) continue;

		const price = getTokenUsdPrice(state.collateralToken, tokenUsdPrices);
		if (!price) return null;
		totalNtlPos = totalNtlPos.plus(stateTotalNtlPos.times(price));
		totalMarginUsed = totalMarginUsed.plus(stateTotalMarginUsed.times(price));
		crossMaintenanceMarginUsed = crossMaintenanceMarginUsed.plus(stateCrossMaintenance.times(price));
		unrealizedPnl = unrealizedPnl.plus(stateUnrealizedPnl.times(price));
	}

	return {
		totalNtlPos: totalNtlPos.toString(),
		totalMarginUsed: totalMarginUsed.toString(),
		crossMaintenanceMarginUsed: crossMaintenanceMarginUsed.toString(),
		unrealizedPnl: unrealizedPnl.toString(),
	};
}

export function getPerpRiskSummary(states: PerpRiskState[]): PerpRiskSummary {
	const summary = getPerpRiskSummaryValue(states);
	return {
		totalNtlPos: Number(summary.totalNtlPos),
		totalMarginUsed: Number(summary.totalMarginUsed),
		crossMaintenanceMarginUsed: Number(summary.crossMaintenanceMarginUsed),
		unrealizedPnl: Number(summary.unrealizedPnl),
	};
}

export function getUnifiedAccountMarginRatioValue({
	states,
	collaterals,
	spotBalances,
}: {
	states: readonly PerpDexRiskState[];
	collaterals: readonly PerpDexCollateralToken[];
	spotBalances: SpotBalance[] | null | undefined;
}): string | null {
	const collateralTokenByDex = new Map(collaterals.map(({ dex, token }) => [dex, token]));
	const crossMaintenanceByToken = new Map<number, Big>();
	const isolatedMarginByToken = new Map<number, Big>();

	for (const state of states) {
		const token = collateralTokenByDex.get(state.dex);
		const crossMaintenance = toBig(state.crossMaintenanceMarginUsed);
		if (!crossMaintenance || crossMaintenance.lt(0)) return null;
		if (token === undefined) {
			if (!crossMaintenance.eq(0) || (state.assetPositions?.length ?? 0) > 0) return null;
			continue;
		}

		crossMaintenanceByToken.set(token, (crossMaintenanceByToken.get(token) ?? Big(0)).plus(crossMaintenance));
		for (const position of state.assetPositions ?? []) {
			if (position.position.leverage.type !== "isolated") continue;
			const marginUsed = toBig(position.position.marginUsed);
			if (!marginUsed || marginUsed.lt(0)) return null;
			isolatedMarginByToken.set(token, (isolatedMarginByToken.get(token) ?? Big(0)).plus(marginUsed));
		}
	}

	const spotTotalByToken = new Map<number, Big>();
	for (const balance of spotBalances ?? []) {
		if (!("token" in balance) || typeof balance.token !== "number") continue;
		const total = toBig(balance.total);
		if (!total) return null;
		spotTotalByToken.set(balance.token, total);
	}

	let maxRatio = Big(0);
	for (const [token, crossMaintenance] of crossMaintenanceByToken) {
		if (crossMaintenance.eq(0)) continue;
		const spotTotal = spotTotalByToken.get(token);
		if (!spotTotal) return null;
		const available = spotTotal.minus(isolatedMarginByToken.get(token) ?? Big(0));
		if (available.lte(0)) return null;
		const ratio = crossMaintenance.div(available);
		if (ratio.gt(maxRatio)) maxRatio = ratio;
	}

	return maxRatio.toString();
}

export function getSpotAccountValueValue(
	spotBalances: SpotBalance[] | null | undefined,
	tokenUsdPrices?: TokenUsdPrices,
): string {
	return (spotBalances ?? [])
		.reduce((sum, balance) => sum.plus(toSafeBig(getSpotUsdValue(balance, tokenUsdPrices))), Big(0))
		.toString();
}

export function getSpotAccountValue(
	spotBalances: SpotBalance[] | null | undefined,
	tokenUsdPrices?: TokenUsdPrices,
): number {
	return Number(getSpotAccountValueValue(spotBalances, tokenUsdPrices));
}

export function getAccountEquityValue({
	accountAbstraction,
	marginSummary,
	perpSummary,
	spotBalances,
	tokenUsdPrices,
}: {
	accountAbstraction: AccountAbstraction | null | undefined;
	marginSummary: MarginSummary | null | undefined;
	perpSummary: PerpSummary | null | undefined;
	spotBalances: SpotBalance[] | null | undefined;
	tokenUsdPrices?: TokenUsdPrices;
}): string {
	if (!isSupportedAccountAbstraction(accountAbstraction)) return "0";
	if (isQuoteBalanceSharedWithPerps(accountAbstraction)) {
		return getSpotAccountValueValue(spotBalances, tokenUsdPrices);
	}

	return toSafeBig(marginSummary?.accountValue ?? perpSummary?.accountValue).toString();
}

export function getAccountBalanceSummary({
	accountAbstraction,
	marginSummary,
	perpSummary,
	withdrawable,
	spotBalances,
	spotAvailableAfterMaintenance,
	tokenUsdPrices,
	allowSpotStateForPerps,
}: {
	accountAbstraction: AccountAbstraction | null | undefined;
	marginSummary: MarginSummary | null | undefined;
	perpSummary: PerpSummary | null | undefined;
	withdrawable: string | number | null | undefined;
	spotBalances: SpotBalance[] | null | undefined;
	spotAvailableAfterMaintenance?: SpotAvailableAfterMaintenance | null;
	tokenUsdPrices?: TokenUsdPrices;
	allowSpotStateForPerps?: boolean;
}): AccountBalanceSummary {
	const mode = getBalanceMode(accountAbstraction);
	const usesSpotStateForPerps = (allowSpotStateForPerps ?? true) && isQuoteBalanceSharedWithPerps(accountAbstraction);
	const usdcBalance = getSpotBalance(spotBalances, DEFAULT_QUOTE_TOKEN);
	const spotUsdcTotal = toSafeBig(usdcBalance?.total).toNumber();
	const spotUsdcHold = toSafeBig(usdcBalance?.hold).toNumber();
	const spotUsdcAvailable = getSpotAvailable(usdcBalance, spotAvailableAfterMaintenance);
	// Withdrawable is initial-margin constrained: the L1 locks unified-margin USDC via `hold`,
	// so total - hold matches the official app. The maintenance-adjusted value
	// (tokenToAvailableAfterMaintenance) is the distance to liquidation, not what can leave.
	const spotUsdcWithdrawable = getSpotTransferable(usdcBalance);
	const spotAccountValue = getSpotAccountValue(spotBalances, tokenUsdPrices);

	const perpAccountValue = toSafeBig(marginSummary?.accountValue ?? perpSummary?.accountValue).toNumber();
	const perpWithdrawable = toSafeBig(withdrawable).toNumber();
	const perpMarginUsed = toSafeBig(marginSummary?.totalMarginUsed ?? perpSummary?.totalMarginUsed).toNumber();
	const perpTotalRawUsd = toSafeBig(marginSummary?.totalRawUsd).toNumber();
	if (mode === "unavailable") {
		return {
			mode,
			isAvailable: false,
			usesSpotStateForPerps: false,
			accountEquity: 0,
			balance: 0,
			available: 0,
			withdrawable: 0,
			spotUsdcWithdrawable: 0,
			spotUsdcTotal: 0,
			spotUsdcAvailable: 0,
			spotUsdcHold: 0,
			spotAccountValue: 0,
			perpAccountValue: 0,
			perpWithdrawable: 0,
			perpMarginUsed: 0,
			perpTotalRawUsd: 0,
			hasSpotFundsWhenPerpWithdrawableZero: false,
		};
	}

	return {
		mode,
		isAvailable: true,
		usesSpotStateForPerps,
		accountEquity: usesSpotStateForPerps ? spotAccountValue : perpAccountValue,
		balance: usesSpotStateForPerps ? spotAccountValue : perpTotalRawUsd,
		available: usesSpotStateForPerps ? spotUsdcAvailable : perpWithdrawable,
		withdrawable: usesSpotStateForPerps ? spotUsdcWithdrawable : perpWithdrawable,
		spotUsdcWithdrawable,
		spotUsdcTotal,
		spotUsdcAvailable,
		spotUsdcHold,
		spotAccountValue,
		perpAccountValue,
		perpWithdrawable,
		perpMarginUsed,
		perpTotalRawUsd,
		hasSpotFundsWhenPerpWithdrawableZero: perpWithdrawable <= 0 && spotUsdcAvailable > 0,
	};
}

export function getPerpAvailable(
	accountValue: string | number | null | undefined,
	marginUsed: string | number | null | undefined,
): number {
	const av = toSafeBig(accountValue);
	const mu = toSafeBig(marginUsed);
	return Math.max(0, av.minus(mu).toNumber());
}

export function getAvailableFromTotals(
	total: string | number | null | undefined,
	hold: string | number | null | undefined,
): number {
	return toSafeBig(getAvailableFromTotalsValue(total, hold)).toNumber();
}

export function getAvailableFromTotalsValue(
	total: string | number | null | undefined,
	hold: string | number | null | undefined,
): string {
	const available = toSafeBig(total).minus(toSafeBig(hold));
	return available.gt(0) ? available.toString() : "0";
}

/** Settled spot balance that can leave the account. Trading buying power uses a different maintenance-adjusted value. */
export function getSpotTransferableValue(balance: SpotBalance | null | undefined): string {
	return getAvailableFromTotalsValue(balance?.total, balance?.hold);
}

export function getSpotTransferable(balance: SpotBalance | null | undefined): number {
	return toSafeBig(getSpotTransferableValue(balance)).toNumber();
}

function getAvailableAfterMaintenanceValue(
	token: number | string | null | undefined,
	spotAvailableAfterMaintenance: SpotAvailableAfterMaintenance | null | undefined,
): string | null {
	if (token == null) return null;
	const tokenKey = String(token);
	const match = spotAvailableAfterMaintenance?.find(([availableToken]) => String(availableToken) === tokenKey);
	return match?.[1] ?? null;
}

export function getSpotAvailableValue(
	balance: SpotBalance | null | undefined,
	spotAvailableAfterMaintenance?: SpotAvailableAfterMaintenance | null,
): string {
	const token = balance && "token" in balance ? balance.token : undefined;
	const availableAfterMaintenance = getAvailableAfterMaintenanceValue(token, spotAvailableAfterMaintenance);
	if (availableAfterMaintenance != null) {
		const available = toSafeBig(availableAfterMaintenance);
		return available.gt(0) ? available.toString() : "0";
	}

	const available = toSafeBig(balance?.total).minus(toSafeBig(balance?.hold));
	return available.gt(0) ? available.toString() : "0";
}

export function getSpotAvailable(
	balance: SpotBalance | null | undefined,
	spotAvailableAfterMaintenance?: SpotAvailableAfterMaintenance | null,
): number {
	return toSafeBig(getSpotAvailableValue(balance, spotAvailableAfterMaintenance)).toNumber();
}

export function getSpotBalanceData(
	spotBalances: SpotBalance[] | null | undefined,
	market: UnifiedMarketInfo | undefined,
	spotAvailableAfterMaintenance?: SpotAvailableAfterMaintenance | null,
): SpotBalanceData {
	const quoteName = getMarketQuoteToken(market);

	if (!market) {
		return { baseAvailable: 0, quoteAvailable: 0, baseName: "", quoteName };
	}

	if (market.kind === "spot") {
		const baseName = market.tokensInfo?.[0]?.name ?? "";
		const baseBalance = getSpotBalance(spotBalances, baseName);
		const quoteBalance = getSpotBalance(spotBalances, quoteName);

		return {
			baseAvailable: getSpotAvailable(baseBalance, spotAvailableAfterMaintenance),
			quoteAvailable: getSpotAvailable(quoteBalance, spotAvailableAfterMaintenance),
			baseName,
			quoteName,
		};
	}

	if (market.kind === "perp" || market.kind === "builderPerp") {
		const quoteBalance = getSpotBalance(spotBalances, quoteName);
		return {
			baseAvailable: 0,
			quoteAvailable: getSpotAvailable(quoteBalance, spotAvailableAfterMaintenance),
			baseName: "",
			quoteName,
		};
	}

	return { baseAvailable: 0, quoteAvailable: 0, baseName: "", quoteName };
}

export function getAvailableBalanceToken(market: UnifiedMarketInfo | undefined, side: Side): string {
	if (market?.kind === "spot") {
		const token = side === "sell" ? market.tokensInfo?.[0] : market.tokensInfo?.[1];
		return token?.displayName ?? token?.name ?? "";
	}
	if (market?.kind === "builderPerp") {
		return market.quoteToken?.displayName ?? market.quoteToken?.name ?? DEFAULT_QUOTE_TOKEN;
	}
	return DEFAULT_QUOTE_TOKEN;
}

export function getPerpBalanceRows(
	perpSummary: PerpSummary | null | undefined,
	spotBalances: SpotBalance[] | null | undefined,
	spotAvailableAfterMaintenance: SpotAvailableAfterMaintenance | null | undefined,
	accountAbstraction: AccountAbstraction | null,
	withdrawable?: string | number | null,
	options?: PerpBalanceRowOptions,
): BalanceRow[] {
	if (!isSupportedAccountAbstraction(accountAbstraction)) return [];
	const quoteToken = options?.quoteToken ?? DEFAULT_QUOTE_TOKEN;
	const tradeAvailable = options?.tradeAvailable;
	const hasTradeCapacity = toBig(tradeAvailable)?.gt(0) ?? false;
	if (isQuoteBalanceSharedWithPerps(accountAbstraction)) {
		const quoteBalance = getSpotBalance(spotBalances, quoteToken);
		const quoteTotal = toBig(quoteBalance?.total);
		if ((quoteBalance && quoteTotal?.gt(0)) || hasTradeCapacity) {
			return [
				{
					asset: quoteToken,
					type: "perp",
					available: getSpotAvailableValue(quoteBalance, spotAvailableAfterMaintenance),
					transferable: getSpotTransferableValue(quoteBalance),
					tradeAvailable,
					inOrder: quoteBalance?.hold ?? "0",
					total: quoteBalance?.total ?? "0",
					usdValue: quoteBalance ? getSpotUsdValue(quoteBalance, options?.tokenUsdPrices) : "0",
					entryNtl: quoteBalance?.entryNtl ?? "0",
				},
			];
		}
		return [];
	}

	const total =
		options?.marginSummary?.accountValue ?? perpSummary?.accountValue ?? options?.marginSummary?.totalRawUsd ?? "0";
	const totalValue = toBig(total);
	if ((!totalValue || totalValue.eq(0)) && !hasTradeCapacity) return [];
	const perpAccountValue = toSafeBig(perpSummary?.accountValue);

	// The API's withdrawable already accounts for margin held by open orders, which
	// totalMarginUsed (position margin only) does not. Transfers are additionally floored
	// at 10% of open notional (transfer_margin_required = max(initial_margin, 0.1 * ntl),
	// see trading/margining), so subtract that floor too or the remainder shows up as a
	// phantom order hold for >10x-leverage positions.
	const availableValue =
		withdrawable == null
			? Big(getPerpAvailable(perpSummary?.accountValue, perpSummary?.totalMarginUsed))
			: toSafeBig(withdrawable);
	const available = availableValue.gt(0) ? availableValue.toString() : "0";
	const positionMargin = toSafeBig(perpSummary?.totalMarginUsed);
	const transferFloor = toSafeBig(perpSummary?.totalNtlPos).abs().times("0.1");
	const transferMarginRequired = transferFloor.gt(positionMargin) ? transferFloor : positionMargin;
	const orderHold = perpAccountValue.minus(transferMarginRequired).minus(availableValue);
	const inOrder = withdrawable == null || orderHold.lt(0) ? "0" : orderHold.toString();

	return [
		{
			asset: quoteToken,
			type: "perp",
			available,
			transferable: available,
			tradeAvailable,
			inOrder,
			total: total.toString(),
			usdValue: total.toString(),
			entryNtl: total.toString(),
		},
	];
}

export function getSpotBalanceRows(
	spotBalances: SpotBalance[] | null | undefined,
	spotAvailableAfterMaintenance: SpotAvailableAfterMaintenance | null | undefined,
	accountAbstraction: AccountAbstraction | null,
	tokenUsdPrices?: TokenUsdPrices,
	sharedQuoteToken = DEFAULT_QUOTE_TOKEN,
): BalanceRow[] {
	if (!isSupportedAccountAbstraction(accountAbstraction)) return [];
	const rows: BalanceRow[] = [];
	const shouldHideSharedQuote = isQuoteBalanceSharedWithPerps(accountAbstraction);

	for (const balance of spotBalances ?? []) {
		if (shouldHideSharedQuote && balance.coin === sharedQuoteToken) continue;

		const total = toBig(balance.total);
		if (!total || total.eq(0)) continue;

		rows.push({
			asset: balance.coin,
			type: "spot",
			available: getSpotAvailableValue(balance, spotAvailableAfterMaintenance),
			transferable: getSpotTransferableValue(balance),
			inOrder: balance.hold ?? "0",
			total: balance.total ?? "0",
			usdValue: getSpotUsdValue(balance, tokenUsdPrices),
			entryNtl: balance.entryNtl ?? "0",
		});
	}

	rows.sort((a, b) => toSafeBig(b.usdValue).cmp(toSafeBig(a.usdValue)));
	return rows;
}

export function getBalanceRowDisplayAvailable(row: BalanceRow): string | null {
	return row.tradeAvailable === undefined ? row.available : row.tradeAvailable;
}

export function getBalanceRows(
	perpSummary: PerpSummary | null | undefined,
	spotBalances: SpotBalance[] | null | undefined,
	spotAvailableAfterMaintenance: SpotAvailableAfterMaintenance | null | undefined,
	accountAbstraction: AccountAbstraction | null,
	withdrawable?: string | number | null,
	tokenUsdPrices?: TokenUsdPrices,
): BalanceRow[] {
	return [
		...getPerpBalanceRows(perpSummary, spotBalances, spotAvailableAfterMaintenance, accountAbstraction, withdrawable),
		...getSpotBalanceRows(spotBalances, spotAvailableAfterMaintenance, accountAbstraction, tokenUsdPrices),
	];
}

export function getTotalUsdValue(rows: BalanceRow[]): number {
	return rows.reduce((sum, row) => Big(sum).plus(toSafeBig(row.usdValue)).toNumber(), 0);
}

export function filterBalanceRowsByUsdValue(rows: BalanceRow[], minUsd: number): BalanceRow[] {
	return rows.filter((row) => toSafeBig(row.usdValue).gte(minUsd));
}
