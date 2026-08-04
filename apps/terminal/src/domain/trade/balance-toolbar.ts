import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import type { AccountAbstraction, MarginSummary, SpotBalance } from "@/hooks/trade/use-account-balances";
import { toBig } from "@/lib/trade/numbers";
import {
	type BalanceRow,
	getAccountEquityValue,
	getSpotBalance,
	getSpotTransferableValue,
	type PerpSummary,
	type TokenUsdPrices,
} from "./balances";

export interface TradingToolbarBalanceSummary {
	totalAssets: string;
	withdrawable: string;
}

export interface TradingToolbarSpotPnl {
	pnl: string;
	pnlRatio: string;
	tone: "profit" | "loss" | "flat";
}

export function getTradingToolbarBalanceSummary({
	accountAbstraction,
	marginSummary,
	perpSummary,
	spotBalances,
	tokenUsdPrices,
	withdrawable,
}: {
	accountAbstraction: AccountAbstraction | null | undefined;
	marginSummary: MarginSummary | null | undefined;
	perpSummary: PerpSummary | null | undefined;
	spotBalances: SpotBalance[] | null | undefined;
	tokenUsdPrices?: TokenUsdPrices;
	withdrawable: string | number | null | undefined;
}): TradingToolbarBalanceSummary {
	const totalAssets = getAccountEquityValue({
		accountAbstraction,
		marginSummary,
		perpSummary,
		spotBalances,
		tokenUsdPrices,
	});
	const sharedQuoteBalance = accountAbstraction === "unifiedAccount" || accountAbstraction === "portfolioMargin";

	return {
		totalAssets,
		withdrawable: sharedQuoteBalance
			? getSpotTransferableValue(getSpotBalance(spotBalances, DEFAULT_QUOTE_TOKEN))
			: (toBig(withdrawable)?.toString() ?? "0"),
	};
}

export function getTradingToolbarSpotPnl(
	row: BalanceRow,
	midPrice: string | null | undefined,
): TradingToolbarSpotPnl | null {
	if (row.type !== "spot") return null;

	const entryNotional = toBig(row.entryNtl);
	const total = toBig(row.total);
	const mid = toBig(midPrice);
	if (!entryNotional?.gt(0) || !total || !mid?.gt(0)) return null;

	const pnl = total.times(mid).minus(entryNotional);
	return {
		pnl: pnl.toString(),
		pnlRatio: pnl.div(entryNotional).toString(),
		tone: pnl.gt(0) ? "profit" : pnl.lt(0) ? "loss" : "flat",
	};
}

export function isTradingToolbarBalancePositive(value: string | number | null | undefined): boolean {
	return toBig(value)?.gt(0) ?? false;
}
