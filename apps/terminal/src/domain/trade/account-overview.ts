import {
	accountOverviewNeedsTokenUsdPrices,
	getPerpRiskSummaryUsdValue,
	getSpotAccountValueUsdValue,
	getTokenAmountUsdValue,
	getUnifiedAccountMarginRatioValue,
	isQuoteBalanceSharedWithPerps,
	type PerpRiskSummaryValue,
	type TokenUsdPrices,
} from "@/domain/trade/balances";
import type { AssetAvailabilityStatus } from "@/domain/trade/order/availability";
import {
	getToolbarAccountLeverage,
	getToolbarAccountMarginRatio,
	getToolbarAccountRiskPresentation,
	getToolbarSignedValueTone,
} from "@/domain/trade/trading-toolbar-metrics";
import {
	type AccountAbstraction,
	type AccountBalances,
	isSupportedAccountAbstraction,
} from "@/hooks/trade/use-account-balances";
import { toBig } from "@/lib/trade/numbers";

export type AccountOverviewStatus = "loading" | "error" | "stale" | "unavailable" | "ready";
export type AccountOverviewMode = "unified" | "portfolioMargin" | "separate" | "unavailable";

export interface AccountOverviewCollateral {
	dex: string;
	tokenIndex: number | null;
	tokenName: string;
}

interface AccountOverviewBase {
	accountAbstraction: AccountAbstraction;
	accountEquityValue: string | null;
	accountMode: AccountOverviewMode;
	accountModeReady: boolean;
	accountRisk: ReturnType<typeof getToolbarAccountRiskPresentation>;
	crossAccountEquityValue: string | null;
	crossLeverage: string | null;
	fundsActionsReady: boolean;
	maintenanceMarginRatio: string | null;
	marginRatioReady: boolean;
	requiresUsdPrices: boolean;
	riskSummary: PerpRiskSummaryValue | null;
	snapshotReady: boolean;
	summaryReady: boolean;
	unrealizedPnlTone: ReturnType<typeof getToolbarSignedValueTone>;
	usesSharedQuoteBalance: boolean;
	valuationUnavailable: boolean;
}

export type AccountOverview = AccountOverviewBase &
	({ status: "loading" } | { status: "error" } | { status: "stale" } | { status: "unavailable" } | { status: "ready" });

export interface DeriveAccountOverviewInput {
	collaterals: readonly AccountOverviewCollateral[];
	defaultBalances: AccountBalances;
	isConnected: boolean;
	selectedBalances: AccountBalances;
	tokenUsdPrices: TokenUsdPrices;
	tokenUsdPriceStatus: AssetAvailabilityStatus;
}

function getAccountOverviewMode(accountAbstraction: AccountAbstraction): AccountOverviewMode {
	if (accountAbstraction === "unifiedAccount") return "unified";
	if (accountAbstraction === "portfolioMargin") return "portfolioMargin";
	if (accountAbstraction === "disabled") return "separate";
	return "unavailable";
}

export function deriveAccountOverview({
	collaterals,
	defaultBalances,
	isConnected,
	selectedBalances,
	tokenUsdPrices,
	tokenUsdPriceStatus,
}: DeriveAccountOverviewInput): AccountOverview {
	const accountAbstraction = selectedBalances.accountAbstraction;
	const accountMode = getAccountOverviewMode(accountAbstraction);
	const accountModeReady = isSupportedAccountAbstraction(accountAbstraction);
	const usesSharedQuoteBalance = isQuoteBalanceSharedWithPerps(accountAbstraction);
	const summaryBalances = usesSharedQuoteBalance ? defaultBalances : selectedBalances;
	const collateralTokenByDex = new Map(collaterals.map(({ dex, tokenName }) => [dex, tokenName]));
	const selectedCollateralToken = collateralTokenByDex.get(summaryBalances.dex) ?? null;
	const perpRiskStates = usesSharedQuoteBalance
		? selectedBalances.allDexClearinghouseStates.map(([dex, state]) => ({
				collateralToken: collateralTokenByDex.get(dex) ?? null,
				marginSummary: state.crossMarginSummary,
				crossMaintenanceMarginUsed: state.crossMaintenanceMarginUsed,
				assetPositions: state.assetPositions,
			}))
		: [
				{
					collateralToken: selectedCollateralToken,
					marginSummary: summaryBalances.perpSummary,
					crossMaintenanceMarginUsed: summaryBalances.crossMaintenanceMarginUsed,
					assetPositions: summaryBalances.perpPositions,
				},
			];
	const requiresUsdPrices = accountOverviewNeedsTokenUsdPrices({
		accountValues: usesSharedQuoteBalance
			? []
			: [
					{ token: selectedCollateralToken, value: summaryBalances.marginSummary?.accountValue },
					{ token: selectedCollateralToken, value: summaryBalances.perpSummary?.accountValue },
				],
		spotBalances: usesSharedQuoteBalance ? summaryBalances.spotBalances : [],
		perpRiskStates,
	});
	const metricsAreLoading =
		accountAbstraction === null ||
		summaryBalances.perpStateStatus === "loading" ||
		(usesSharedQuoteBalance && summaryBalances.spotStateStatus === "loading") ||
		(requiresUsdPrices && tokenUsdPriceStatus === "loading");
	const metricsHaveError =
		(!accountModeReady && summaryBalances.hasError) ||
		summaryBalances.perpStateStatus === "error" ||
		(usesSharedQuoteBalance && summaryBalances.spotStateStatus === "error") ||
		(requiresUsdPrices && tokenUsdPriceStatus === "error");
	const metricsAreStale =
		summaryBalances.isPerpStateStale ||
		(usesSharedQuoteBalance && summaryBalances.isSpotStateStale) ||
		(requiresUsdPrices && tokenUsdPriceStatus === "stale");
	const snapshotReady =
		isConnected &&
		accountModeReady &&
		summaryBalances.perpStateStatus === "success" &&
		!summaryBalances.isPerpStateStale &&
		(!requiresUsdPrices || tokenUsdPriceStatus === "success") &&
		(!usesSharedQuoteBalance ||
			(!summaryBalances.hasError &&
				!summaryBalances.isDataStale &&
				summaryBalances.hasAllDexsSnapshot &&
				summaryBalances.spotStateStatus === "success" &&
				summaryBalances.hasSpotStateSnapshot));
	const accountEquityValue = snapshotReady
		? usesSharedQuoteBalance
			? getSpotAccountValueUsdValue(summaryBalances.spotBalances, tokenUsdPrices)
			: getTokenAmountUsdValue(summaryBalances.marginSummary?.accountValue, selectedCollateralToken, tokenUsdPrices)
		: null;
	const crossAccountEquityValue = snapshotReady
		? usesSharedQuoteBalance
			? accountEquityValue
			: getTokenAmountUsdValue(summaryBalances.perpSummary?.accountValue, selectedCollateralToken, tokenUsdPrices)
		: null;
	const riskSummary = snapshotReady ? getPerpRiskSummaryUsdValue(perpRiskStates, tokenUsdPrices) : null;
	const rawMaintenanceMarginRatio = snapshotReady
		? accountAbstraction === "unifiedAccount"
			? getUnifiedAccountMarginRatioValue({
					states: selectedBalances.allDexClearinghouseStates.map(([dex, state]) => ({ dex, ...state })),
					collaterals: collaterals.flatMap(({ dex, tokenIndex }) =>
						tokenIndex === null ? [] : [{ dex, token: tokenIndex }],
					),
					spotBalances: summaryBalances.spotBalances,
				})
			: accountAbstraction === "portfolioMargin"
				? summaryBalances.portfolioMarginRatio
				: getToolbarAccountMarginRatio({
						crossMaintenanceMarginUsed: summaryBalances.crossMaintenanceMarginUsed,
						accountEquity: summaryBalances.perpSummary?.accountValue ?? "0",
					})
		: null;
	const parsedMaintenanceMarginRatio = toBig(rawMaintenanceMarginRatio);
	const maintenanceMarginRatio =
		parsedMaintenanceMarginRatio?.gte(0) === true ? parsedMaintenanceMarginRatio.toString() : null;
	const marginRatioReady = snapshotReady && maintenanceMarginRatio !== null;
	const accountRisk = getToolbarAccountRiskPresentation(marginRatioReady ? maintenanceMarginRatio : null);
	const crossLeverage =
		snapshotReady && riskSummary && crossAccountEquityValue !== null
			? getToolbarAccountLeverage({
					totalNtlPos: riskSummary.totalNtlPos,
					accountEquity: crossAccountEquityValue,
				})
			: null;
	const unrealizedPnlTone =
		snapshotReady && riskSummary ? getToolbarSignedValueTone(riskSummary.unrealizedPnl) : "neutral";
	const summaryReady = snapshotReady && accountEquityValue !== null && riskSummary !== null;
	const valuationUnavailable = snapshotReady && !summaryReady;
	const fundsActionsReady =
		accountModeReady &&
		!defaultBalances.hasError &&
		!defaultBalances.isDataStale &&
		defaultBalances.perpStateStatus === "success" &&
		defaultBalances.spotStateStatus === "success";

	let status: AccountOverviewStatus = "unavailable";
	if (isConnected) {
		if (metricsHaveError) status = "error";
		else if (metricsAreStale) status = "stale";
		else if (metricsAreLoading) status = "loading";
		else if (snapshotReady && !valuationUnavailable) status = "ready";
	}

	return {
		accountAbstraction,
		accountEquityValue,
		accountMode,
		accountModeReady,
		accountRisk,
		crossAccountEquityValue,
		crossLeverage,
		fundsActionsReady,
		maintenanceMarginRatio,
		marginRatioReady,
		requiresUsdPrices,
		riskSummary,
		snapshotReady,
		status,
		summaryReady,
		unrealizedPnlTone,
		usesSharedQuoteBalance,
		valuationUnavailable,
	};
}
