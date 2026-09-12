import { type AccountOverview, deriveAccountOverview } from "@/domain/trade/account-overview";
import { useInfo } from "@/lib/hyperliquid";
import { type AccountBalances, useSelectedDexBalances } from "./use-account-balances";
import { useDefaultAccountSnapshot } from "./use-default-account-snapshot";

export type AccountOverviewState = AccountOverview & {
	defaultBalances: AccountBalances;
};

export function useAccountOverview(): AccountOverviewState {
	const { collaterals, defaultBalances, isConnected, tokenUsdPrices, tokenUsdPriceStatus } =
		useDefaultAccountSnapshot();
	const selectedBalances = useSelectedDexBalances();
	const needsReserves = isConnected && selectedBalances.accountAbstraction === "portfolioMargin";
	const reserves = useInfo("allBorrowLendReserveStates", undefined, {
		enabled: needsReserves,
		staleTime: 30_000,
		refetchInterval: needsReserves ? 30_000 : false,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: "always",
		refetchOnMount: "always",
		retry: 1,
	});
	const reserveAge = Date.now() - reserves.dataUpdatedAt;
	const leverageReserves =
		needsReserves &&
		reserves.isSuccess &&
		!reserves.isPlaceholderData &&
		reserves.isFetchedAfterMount &&
		reserveAge >= 0 &&
		reserveAge < 60_000
			? reserves.data
			: undefined;

	return {
		...deriveAccountOverview({
			collaterals,
			defaultBalances,
			isConnected,
			selectedBalances,
			tokenUsdPrices,
			tokenUsdPriceStatus,
			leverageReserves,
		}),
		defaultBalances,
	};
}
