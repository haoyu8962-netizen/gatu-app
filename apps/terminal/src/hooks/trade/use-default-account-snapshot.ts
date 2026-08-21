import { useMemo } from "react";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import type { AccountOverviewCollateral } from "@/domain/trade/account-overview";
import type { TokenUsdPrices } from "@/domain/trade/balances";
import type { AssetAvailabilityStatus } from "@/domain/trade/order/availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useMarkets } from "@/lib/hyperliquid";
import { type AccountBalances, useDefaultDexBalances } from "./use-account-balances";
import { useSpotTokenUsdPriceState } from "./use-spot-token-usd-prices";

export interface DefaultAccountSnapshot {
	address: ReturnType<typeof useWalletSession>["address"];
	collaterals: readonly AccountOverviewCollateral[];
	defaultBalances: AccountBalances;
	isConnected: boolean;
	tokenUsdPrices: TokenUsdPrices;
	tokenUsdPriceStatus: AssetAvailabilityStatus;
}

export function useDefaultAccountSnapshot(): DefaultAccountSnapshot {
	const { address, isConnected } = useWalletSession();
	const markets = useMarkets();
	const defaultBalances = useDefaultDexBalances();
	const tokenUsdPriceState = useSpotTokenUsdPriceState(isConnected);
	const defaultCollateralTokenIndex = markets.getToken(DEFAULT_QUOTE_TOKEN)?.index ?? null;
	const collaterals = useMemo<AccountOverviewCollateral[]>(
		() => [
			{
				dex: "",
				tokenIndex: defaultCollateralTokenIndex,
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
		],
		[defaultCollateralTokenIndex, markets.builderPerp],
	);

	return {
		address,
		collaterals,
		defaultBalances,
		isConnected,
		tokenUsdPrices: tokenUsdPriceState.prices,
		tokenUsdPriceStatus: tokenUsdPriceState.status,
	};
}
