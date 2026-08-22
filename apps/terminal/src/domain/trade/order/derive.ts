import { getSizeModeLabel } from "@/config/ui-text";
import { getBaseQuoteFromPairName } from "@/domain/market";
import {
	getAvailableBalanceToken,
	getSpotBalanceData,
	type SpotAvailableAfterMaintenance,
	type SpotBalanceData,
} from "@/domain/trade/balances";
import { getExecutedPrice } from "@/domain/trade/order/price";
import { getMaxSizeForOrderEntry, getOrderValue, getSizeValueFromInput } from "@/domain/trade/order/size";
import { formatPriceForOrder } from "@/domain/trade/orders";
import type { SpotBalance } from "@/hooks/trade/use-account-balances";
import { getMarketCapabilities, type MarketCapabilities } from "@/lib/hyperliquid";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import type { Side, SizeMode } from "@/lib/trade/types";

export interface MarketOrderSizingInput {
	referencePx: number;
	slippageBps: number;
}

export interface OrderEntryInputs {
	isConnected: boolean;
	market: UnifiedMarketInfo | undefined;
	side: Side;
	conversionPrice: number;
	sizeMode: SizeMode;
	sizeInput: string;
	spotBalances: SpotBalance[] | null | undefined;
	spotAvailableAfterMaintenance?: SpotAvailableAfterMaintenance | null;
	/** Max trade sizes in base token: [buy, sell]. */
	maxTradeSzs: [number, number] | null;
	/** Available to trade in quote token: [buy, sell]. */
	availableToTrade: [number, number] | null;
	marketOrderSizing: MarketOrderSizingInput | null;
}

export interface OrderEntryDerived {
	isSpotMarket: boolean;
	baseToken: string;
	quoteToken: string;
	capabilities: MarketCapabilities;
	szDecimals: number;
	availableBalance: number;
	availableBalanceToken: string;
	displayAvailableBalance: number;
	displayAvailableBalanceToken: string;
	spotBalance: SpotBalanceData;
	maxSize: number;
	sizeValue: number;
	orderValue: number;
	sizeModeLabel: string;
}

function getAvailableBalance(
	isSpotMarket: boolean,
	isBuy: boolean,
	spotBalance: SpotBalanceData,
	availableLong: number,
	availableShort: number,
): number {
	if (isSpotMarket) {
		return isBuy ? spotBalance.quoteAvailable : spotBalance.baseAvailable;
	}
	return isBuy ? availableLong : availableShort;
}

function getMaxSizePrice(
	inputs: OrderEntryInputs,
	isSpotMarket: boolean,
	isBuy: boolean,
	szDecimals: number,
): number | string {
	if (!isSpotMarket || !isBuy || !inputs.marketOrderSizing) return inputs.conversionPrice;
	if (typeof inputs.market?.assetId !== "number") return 0;

	const executionPrice = getExecutedPrice(
		"market",
		"buy",
		inputs.marketOrderSizing.referencePx,
		inputs.marketOrderSizing.slippageBps,
		inputs.conversionPrice,
	);
	return formatPriceForOrder(executionPrice, { assetId: inputs.market.assetId, szDecimals });
}

export function deriveOrderEntry(inputs: OrderEntryInputs): OrderEntryDerived {
	const isSpotMarket = inputs.market?.kind === "spot";
	const isBuy = inputs.side === "buy";
	const capabilities = getMarketCapabilities(inputs.market);
	const szDecimals = inputs.market?.szDecimals ?? 0;

	const { baseToken, quoteToken } = inputs.market
		? getBaseQuoteFromPairName(inputs.market.pairName, inputs.market.kind)
		: { baseToken: "", quoteToken: "" };
	const spotBalance = getSpotBalanceData(inputs.spotBalances, inputs.market, inputs.spotAvailableAfterMaintenance);
	const availableBalanceToken = getAvailableBalanceToken(inputs.market, inputs.side);
	// Perp availability is authoritative per user, coin, and direction. Shared collateral is not a
	// substitute because it does not include market-specific caps or the current position state.
	const [availableLong, availableShort] = inputs.availableToTrade ?? [0, 0];
	const availableBalance = getAvailableBalance(isSpotMarket, isBuy, spotBalance, availableLong, availableShort);
	const displayAvailableBalance = availableBalance;
	const maxSizePrice = getMaxSizePrice(inputs, isSpotMarket, isBuy, szDecimals);

	const maxSize = getMaxSizeForOrderEntry({
		isConnected: inputs.isConnected,
		isSpotMarket,
		side: inputs.side,
		price: maxSizePrice,
		spotBalance,
		szDecimals,
		maxTradeSzs: inputs.maxTradeSzs,
	});

	const sizeValue = getSizeValueFromInput({
		sizeInput: inputs.sizeInput,
		sizeMode: inputs.sizeMode,
		price: inputs.conversionPrice,
		szDecimals,
	});

	const orderValue = getOrderValue(sizeValue, inputs.conversionPrice);
	const sizeModeLabel = getSizeModeLabel(inputs.sizeMode, baseToken, quoteToken);

	return {
		isSpotMarket,
		baseToken,
		quoteToken,
		capabilities,
		szDecimals,
		availableBalance,
		availableBalanceToken,
		displayAvailableBalance,
		displayAvailableBalanceToken: availableBalanceToken,
		spotBalance,
		maxSize,
		sizeValue,
		orderValue,
		sizeModeLabel,
	};
}
