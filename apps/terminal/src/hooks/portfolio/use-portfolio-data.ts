import { useEffect, useReducer } from "react";
import {
	calculateEarnBalance,
	calculateVaultEquity,
	derivePortfolioAccountEquity,
	getPortfolioQueryStatus,
	resolveCurrentTotalEquity,
} from "@/domain/portfolio";
import { useDefaultAccountSnapshot } from "@/hooks/trade/use-default-account-snapshot";
import { usePortfolioInfo } from "./use-portfolio-info";

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export function usePortfolioData() {
	const {
		address,
		collaterals,
		defaultBalances: balances,
		isConnected,
		tokenUsdPrices,
		tokenUsdPriceStatus,
	} = useDefaultAccountSnapshot();
	const enabled = isConnected && !!address;
	const [, refreshClock] = useReducer((revision: number) => revision + 1, 0);
	useEffect(() => {
		if (!enabled) return;
		const timer = window.setInterval(refreshClock, 5_000);
		window.addEventListener("focus", refreshClock);
		document.addEventListener("visibilitychange", refreshClock);
		return () => {
			window.clearInterval(timer);
			window.removeEventListener("focus", refreshClock);
			document.removeEventListener("visibilitychange", refreshClock);
		};
	}, [enabled]);
	const now = Date.now();
	const user = address ?? EMPTY_ADDRESS;
	const mode = balances.accountAbstraction;
	const portfolioQuery = usePortfolioInfo("portfolio", { user }, mode, enabled);
	const feesQuery = usePortfolioInfo("userFees", { user }, mode, enabled);
	const vaultsQuery = usePortfolioInfo("userVaultEquities", { user }, mode, enabled);
	const borrowLendQuery = usePortfolioInfo("borrowLendUserState", { user }, mode, enabled);
	const reserveStatesQuery = usePortfolioInfo("allBorrowLendReserveStates", undefined, null, enabled);
	const portfolioStatus = getPortfolioQueryStatus(portfolioQuery, enabled, now);
	const feesStatus = getPortfolioQueryStatus(feesQuery, enabled, now);
	const vaultStatus = getPortfolioQueryStatus(vaultsQuery, enabled, now);
	const borrowLendStatus = getPortfolioQueryStatus(borrowLendQuery, enabled, now);
	const reserveStatus = getPortfolioQueryStatus(reserveStatesQuery, enabled, now);
	const borrowLendState = borrowLendStatus === "ready" ? borrowLendQuery.data : undefined;
	const earnBalance = calculateEarnBalance(
		borrowLendState,
		reserveStatus === "ready" ? reserveStatesQuery.data : undefined,
	);
	const account = derivePortfolioAccountEquity({
		balances,
		collaterals: collaterals.map(({ dex, tokenName }) => ({ dex, collateralToken: tokenName })),
		tokenUsdPrices,
		tokenUsdPriceStatus,
		isConnected: enabled,
		borrowLendState,
	});
	const vaultEquity = calculateVaultEquity(vaultStatus === "ready" ? vaultsQuery.data : undefined);
	const totalEquity = resolveCurrentTotalEquity({
		coreEquity: account.coreEquity,
		vaultEquity,
		earnBalance,
		currentSourcesAvailable: enabled && !account.hasUnresolvedLendingOverlap,
	});

	return {
		...account,
		isConnected: enabled,
		portfolio: portfolioStatus === "ready" ? portfolioQuery.data : undefined,
		fees: feesStatus === "ready" ? feesQuery.data : undefined,
		portfolioStatus,
		feesStatus,
		earnBalance,
		totalEquity,
		retry: () => {
			void portfolioQuery.refetch();
			void feesQuery.refetch();
			void vaultsQuery.refetch();
			void borrowLendQuery.refetch();
			void reserveStatesQuery.refetch();
		},
	};
}
