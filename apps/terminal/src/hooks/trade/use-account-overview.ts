import { type AccountOverview, deriveAccountOverview } from "@/domain/trade/account-overview";
import { type AccountBalances, useSelectedDexBalances } from "./use-account-balances";
import { useDefaultAccountSnapshot } from "./use-default-account-snapshot";

export type AccountOverviewState = AccountOverview & {
	defaultBalances: AccountBalances;
};

export function useAccountOverview(): AccountOverviewState {
	const { collaterals, defaultBalances, isConnected, tokenUsdPrices, tokenUsdPriceStatus } =
		useDefaultAccountSnapshot();
	const selectedBalances = useSelectedDexBalances();

	return {
		...deriveAccountOverview({
			collaterals,
			defaultBalances,
			isConnected,
			selectedBalances,
			tokenUsdPrices,
			tokenUsdPriceStatus,
		}),
		defaultBalances,
	};
}
