import Big from "big.js";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import type {
	AccountAbstraction,
	MarginSummary,
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
}

export function getSpotBalance(balances: SpotBalance[] | null | undefined, coin: string): SpotBalance | null {
	if (!balances?.length) return null;
	return balances.find((balance) => balance.coin === coin) ?? null;
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

function getBalanceMode(accountAbstraction: AccountAbstraction | null | undefined): BalanceAccountMode {
	if (accountAbstraction === "unifiedAccount") return "unified";
	if (accountAbstraction === "portfolioMargin") return "portfolioMargin";
	return "separate";
}

export function getSpotAccountValue(spotBalances: SpotBalance[] | null | undefined): number {
	return (spotBalances ?? [])
		.reduce((sum, balance) => {
			const usdValue = balance.coin === DEFAULT_QUOTE_TOKEN ? balance.total : balance.entryNtl;
			return sum.plus(toSafeBig(usdValue));
		}, Big(0))
		.toNumber();
}

export function getAccountBalanceSummary({
	accountAbstraction,
	marginSummary,
	perpSummary,
	withdrawable,
	spotBalances,
	spotAvailableAfterMaintenance,
}: {
	accountAbstraction: AccountAbstraction | null | undefined;
	marginSummary: MarginSummary | null | undefined;
	perpSummary: PerpSummary | null | undefined;
	withdrawable: string | number | null | undefined;
	spotBalances: SpotBalance[] | null | undefined;
	spotAvailableAfterMaintenance?: SpotAvailableAfterMaintenance | null;
}): AccountBalanceSummary {
	const mode = getBalanceMode(accountAbstraction);
	const usesSpotStateForPerps = isQuoteBalanceSharedWithPerps(accountAbstraction);
	const usdcBalance = getSpotBalance(spotBalances, DEFAULT_QUOTE_TOKEN);
	const spotUsdcTotal = toSafeBig(usdcBalance?.total).toNumber();
	const spotUsdcHold = toSafeBig(usdcBalance?.hold).toNumber();
	const spotUsdcAvailable = getSpotAvailable(usdcBalance, spotAvailableAfterMaintenance);
	const spotUsdcWithdrawable = toSafeBig(
		getSpotWithdrawableValue(usdcBalance, spotAvailableAfterMaintenance),
	).toNumber();
	const spotAccountValue = getSpotAccountValue(spotBalances);

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
	const t = toSafeBig(total);
	const h = toSafeBig(hold);
	return Math.max(0, t.minus(h).toNumber());
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

function getSpotWithdrawableValue(
	balance: SpotBalance | null | undefined,
	spotAvailableAfterMaintenance?: SpotAvailableAfterMaintenance | null,
): string {
	const availableAfterMaintenance = getAvailableAfterMaintenanceValue(balance?.token, spotAvailableAfterMaintenance);
	if (availableAfterMaintenance == null) return "0";

	const available = toSafeBig(availableAfterMaintenance);
	return available.gt(0) ? available.toString() : "0";
}

export function getSpotAvailableValue(
	balance: SpotBalance | null | undefined,
	spotAvailableAfterMaintenance?: SpotAvailableAfterMaintenance | null,
): string {
	const availableAfterMaintenance = getAvailableAfterMaintenanceValue(balance?.token, spotAvailableAfterMaintenance);
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

	return [
		{
			asset: DEFAULT_QUOTE_TOKEN,
			type: "perp",
			available: String(getPerpAvailable(perpSummary?.accountValue, perpSummary?.totalMarginUsed)),
			inOrder: perpSummary?.totalMarginUsed?.toString() ?? "0",
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
): BalanceRow[] {
	const rows: BalanceRow[] = [];
	const shouldHideSharedQuote = isQuoteBalanceSharedWithPerps(accountAbstraction);

	for (const balance of spotBalances ?? []) {
		if (shouldHideSharedQuote && balance.coin === DEFAULT_QUOTE_TOKEN) continue;

		const total = toBig(balance.total);
		if (!total || total.eq(0)) continue;

		const available = getSpotAvailableValue(balance, spotAvailableAfterMaintenance);
		const entryNtl = balance.entryNtl ?? "0";
		const usdValue = balance.coin === DEFAULT_QUOTE_TOKEN ? balance.total : entryNtl;

		rows.push({
			asset: balance.coin,
			type: "spot",
			available,
			inOrder: balance.hold ?? "0",
			total: balance.total ?? "0",
			usdValue,
			entryNtl,
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
): BalanceRow[] {
	return [
		...getPerpBalanceRows(perpSummary, spotBalances, spotAvailableAfterMaintenance, accountAbstraction),
		...getSpotBalanceRows(spotBalances, spotAvailableAfterMaintenance, accountAbstraction),
	];
}

export function getTotalUsdValue(rows: BalanceRow[]): number {
	return rows.reduce((sum, row) => Big(sum).plus(toSafeBig(row.usdValue)).toNumber(), 0);
}

export function filterBalanceRowsByUsdValue(rows: BalanceRow[], minUsd: number): BalanceRow[] {
	return rows.filter((row) => toSafeBig(row.usdValue).gte(minUsd));
}
