import { useMemo } from "react";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import {
	type BalanceRow,
	getMarketQuoteToken,
	getPerpBalanceRows,
	getSpotBalanceRows,
	isQuoteBalanceSharedWithPerps,
} from "@/domain/trade/balances";
import { getDirectionalAvailableToTrade } from "@/domain/trade/order/availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useOrderSide } from "@/stores/use-order-entry-store";
import { isSupportedAccountAbstraction, useSelectedDexBalances } from "./use-account-balances";
import { useActiveAssetData } from "./use-active-asset-data";
import { useSpotTokenUsdPrices } from "./use-spot-token-usd-prices";

interface BalanceRowsState {
	accountModeReady: boolean;
	balances: BalanceRow[];
	hasError: boolean;
	internalTransfersEnabled: boolean;
	isConnected: boolean;
	isLoading: boolean;
	perpFundsActionsEnabled: boolean;
	perpBalances: BalanceRow[];
	spotBalanceRows: BalanceRow[];
}

export function useBalanceRows(): BalanceRowsState {
	const { isConnected } = useWalletSession();
	const side = useOrderSide();
	const { data: activeAssetData, market, status: activeAssetStatus } = useActiveAssetData();
	const {
		dex,
		marginSummary,
		perpSummary,
		spotBalances,
		spotAvailableAfterMaintenance,
		accountAbstraction,
		withdrawable,
		isLoading,
		hasError,
	} = useSelectedDexBalances();
	const mids = useSpotTokenUsdPrices(isConnected);
	const isPerpMarket = market?.kind === "perp" || market?.kind === "builderPerp";
	const isSpotMarket = market?.kind === "spot";
	const perpQuoteToken = isPerpMarket ? getMarketQuoteToken(market) : DEFAULT_QUOTE_TOKEN;
	const tradeAvailable = isSpotMarket
		? undefined
		: isPerpMarket && (activeAssetStatus === "success" || activeAssetStatus === "stale")
			? getDirectionalAvailableToTrade(activeAssetData?.availableToTrade, side)
			: null;
	const accountModeReady = isSupportedAccountAbstraction(accountAbstraction);
	const quoteBalanceShared = isQuoteBalanceSharedWithPerps(accountAbstraction);

	const perpBalances = useMemo(
		() =>
			getPerpBalanceRows(perpSummary, spotBalances, spotAvailableAfterMaintenance, accountAbstraction, withdrawable, {
				marginSummary,
				quoteToken: perpQuoteToken,
				tokenUsdPrices: mids,
				tradeAvailable,
			}),
		[
			accountAbstraction,
			marginSummary,
			mids,
			perpSummary,
			perpQuoteToken,
			spotAvailableAfterMaintenance,
			spotBalances,
			tradeAvailable,
			withdrawable,
		],
	);
	const spotBalanceRows = useMemo(
		() => getSpotBalanceRows(spotBalances, spotAvailableAfterMaintenance, accountAbstraction, mids, perpQuoteToken),
		[accountAbstraction, mids, perpQuoteToken, spotAvailableAfterMaintenance, spotBalances],
	);
	const balances = useMemo(() => [...perpBalances, ...spotBalanceRows], [perpBalances, spotBalanceRows]);

	return {
		accountModeReady,
		balances,
		hasError,
		internalTransfersEnabled: accountModeReady && !quoteBalanceShared,
		isConnected,
		isLoading,
		perpFundsActionsEnabled: accountModeReady && (quoteBalanceShared || dex === ""),
		perpBalances,
		spotBalanceRows,
	};
}
