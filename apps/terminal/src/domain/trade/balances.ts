import type { SpotMarket } from "@gatu/hl-react";
import Big from "big.js";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
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

export function getMarketQuoteToken(market: UnifiedMarketInfo | undefined): string {
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
	const aliasPriority = new Map<string, number>();

	for (const market of spotMarkets) {
		const baseToken = market.tokensInfo[0];
		const quoteToken = market.tokensInfo[1];
		const price = tokenUsdPrices[market.name];
		if (!baseToken || !quoteToken || !price) continue;

		const priority = quoteToken.name === DEFAULT_QUOTE_TOKEN ? 2 : 1;
		if (priority < (aliasPriority.get(baseToken.name) ?? 0)) continue;

		result[baseToken.name] = price;
		aliasPriority.set(baseToken.name, priority);
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

export function isQuoteBalanceSharedWithPerps(accountAbstraction: AccountAbstraction | null | undefined): boolean {
	return accountAbstraction === "unifiedAccount" || accountAbstraction === "portfolioMargin";
}

export type BalanceAccountMode = "unified" | "portfolioMargin" | "separate";

export interface AccountBalanceSummary {
	mode: BalanceAccountMode;
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
	return "separate";
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

	return {
		mode,
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

function getAvailableFromTotalsValue(
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
	spotBalances?: SpotBalance[] | null,
	spotAvailableAfterMaintenance?: SpotAvailableAfterMaintenance | null,
	accountAbstraction?: AccountAbstraction | null,
	withdrawable?: string | number | null,
): BalanceRow[] {
	if (isQuoteBalanceSharedWithPerps(accountAbstraction)) {
		const quoteBalance = getSpotBalance(spotBalances, DEFAULT_QUOTE_TOKEN);
		const quoteTotal = toBig(quoteBalance?.total);
		if (quoteBalance && quoteTotal?.gt(0)) {
			return [
				{
					asset: DEFAULT_QUOTE_TOKEN,
					type: "perp",
					available: getSpotAvailableValue(quoteBalance, spotAvailableAfterMaintenance),
					inOrder: quoteBalance.hold ?? "0",
					total: quoteBalance.total ?? "0",
					usdValue: quoteBalance.total ?? "0",
					entryNtl: quoteBalance.entryNtl ?? "0",
				},
			];
		}
	}

	const perpAccountValue = toBig(perpSummary?.accountValue);
	if (!perpAccountValue?.gt(0)) return [];

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
			asset: DEFAULT_QUOTE_TOKEN,
			type: "perp",
			available,
			inOrder,
			total: perpSummary?.accountValue?.toString() ?? "0",
			usdValue: perpSummary?.accountValue?.toString() ?? "0",
			entryNtl: perpSummary?.accountValue?.toString() ?? "0",
		},
	];
}

export function getSpotBalanceRows(
	spotBalances: SpotBalance[] | null | undefined,
	spotAvailableAfterMaintenance?: SpotAvailableAfterMaintenance | null,
	accountAbstraction?: AccountAbstraction | null,
	tokenUsdPrices?: TokenUsdPrices,
): BalanceRow[] {
	const rows: BalanceRow[] = [];
	const shouldHideSharedQuote = isQuoteBalanceSharedWithPerps(accountAbstraction);

	for (const balance of spotBalances ?? []) {
		if (shouldHideSharedQuote && balance.coin === DEFAULT_QUOTE_TOKEN) continue;

		const total = toBig(balance.total);
		if (!total || total.eq(0)) continue;

		rows.push({
			asset: balance.coin,
			type: "spot",
			available: getSpotAvailableValue(balance, spotAvailableAfterMaintenance),
			inOrder: balance.hold ?? "0",
			total: balance.total ?? "0",
			usdValue: getSpotUsdValue(balance, tokenUsdPrices),
			entryNtl: balance.entryNtl ?? "0",
		});
	}

	rows.sort((a, b) => toSafeBig(b.usdValue).cmp(toSafeBig(a.usdValue)));
	return rows;
}

export function getBalanceRows(
	perpSummary: PerpSummary | null | undefined,
	spotBalances: SpotBalance[] | null | undefined,
	spotAvailableAfterMaintenance?: SpotAvailableAfterMaintenance | null,
	accountAbstraction?: AccountAbstraction | null,
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
