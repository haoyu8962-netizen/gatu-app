import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import {
	type AccountOverview,
	type AccountOverviewCollateral,
	deriveAccountOverview,
} from "@/domain/trade/account-overview";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useMarkets } from "@/lib/hyperliquid";
import { useDefaultDexBalances, useSelectedDexBalances } from "./use-account-balances";
import { useSpotTokenUsdPriceState } from "./use-spot-token-usd-prices";

export type AccountOverviewState = AccountOverview & {
	defaultBalances: ReturnType<typeof useDefaultDexBalances>;
};

export function useAccountOverview(): AccountOverviewState {
	const { isConnected } = useWalletSession();
	const markets = useMarkets();
	const defaultBalances = useDefaultDexBalances();
	const selectedBalances = useSelectedDexBalances();
	const tokenUsdPriceState = useSpotTokenUsdPriceState(isConnected);
	const defaultCollateralToken = markets.getToken(DEFAULT_QUOTE_TOKEN);
	const collaterals: AccountOverviewCollateral[] = [
		{
			dex: "",
			tokenIndex: defaultCollateralToken?.index ?? null,
			tokenName: DEFAULT_QUOTE_TOKEN,
		},
		...markets.builderPerp.flatMap((market) =>
			market.quoteToken
				? [
						{
							dex: market.dex,
							tokenIndex: market.quoteToken.index,
							tokenName: market.quoteToken.name,
						},
					]
				: [],
		),
	];

	return {
		...deriveAccountOverview({
			collaterals,
			defaultBalances,
			isConnected,
			selectedBalances,
			tokenUsdPrices: tokenUsdPriceState.prices,
			tokenUsdPriceStatus: tokenUsdPriceState.status,
		}),
		defaultBalances,
	};
}
