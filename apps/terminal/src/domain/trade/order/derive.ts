import { getSizeModeLabel } from "@/config/ui-text";
import { getBaseQuoteFromPairName } from "@/domain/market";
import {
	getAvailableBalanceToken,
	getSpotBalanceData,
	type SpotAvailableAfterMaintenance,
	type SpotBalanceData,
} from "@/domain/trade/balances";
import {
	capSizeToQuoteAmount,
	exceedsPerpEntryMaxSize,
	getMaxSizeForOrderEntry,
	getOrderValue,
	getSizeStringFromInput,
} from "@/domain/trade/order/size";
import { getFrontendMarketOrderPrice } from "@/domain/trade/orders";
import type { SpotBalance } from "@/hooks/trade/use-account-balances";
import { getMarketCapabilities, type MarketCapabilities } from "@/lib/hyperliquid";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import type { Side, SizeMode } from "@/lib/trade/types";
import { type EntryPositionSnapshot, getReduceOnlyCapacity, type ReduceOnlyCapacity } from "./reduce-only";

export interface MarketOrderSizingInput {
	referencePx: number;
	slippageBps: number;
}

export interface OrderEntryInputs {
	reduceOnly?: boolean;
	positionSnapshot?: EntryPositionSnapshot;
	selectedBaseSize?: string;
	isConnected: boolean;
	market: UnifiedMarketInfo | undefined;
	side: Side;
	conversionPrice: number;
	markPx?: number;
	/** The order value of a total size when it is not size × conversion price (a scale order's levels). */
	orderValueForSize?: (size: string) => number | undefined;
	/** What a perp order of a total size reserves margin on when it rests below or above mark. */
	marginNotionalForSize?: (size: string) => number | undefined;
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
	reduceOnlyCapacity: ReduceOnlyCapacity;
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
	/** Whether the entered size reserves more margin than the exchange's maximum allows (perp only). */
	exceedsMaxSize: boolean;
	/** What a spot buy locks in the quote token at the price it is sent at (market buys at the slippage limit). */
	spotBuyQuoteCost: number;
	sizeValue: number;
	sizeForOrder: string;
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

	return getFrontendMarketOrderPrice({
		assetId: inputs.market.assetId,
		side: "buy",
		szDecimals,
		markPx: inputs.marketOrderSizing.referencePx,
		slippageBps: inputs.marketOrderSizing.slippageBps,
	});
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

	const reduceOnlyCapacity = getReduceOnlyCapacity(
		!!inputs.reduceOnly && capabilities.hasReduceOnly,
		inputs.side,
		inputs.isConnected ? inputs.positionSnapshot : undefined,
		szDecimals,
	);
	const maxSize =
		reduceOnlyCapacity.status !== "ordinary"
			? Number(reduceOnlyCapacity.maxBase)
			: getMaxSizeForOrderEntry({
					isConnected: inputs.isConnected,
					isSpotMarket,
					side: inputs.side,
					price: maxSizePrice,
					spotBalance,
					szDecimals,
					maxTradeSzs: inputs.maxTradeSzs,
					markPx: inputs.markPx,
					marginNotionalForSize: inputs.marginNotionalForSize,
				});

	const convertedSize =
		inputs.selectedBaseSize ??
		getSizeStringFromInput({
			sizeInput: inputs.sizeInput,
			sizeMode: inputs.sizeMode,
			price: inputs.conversionPrice,
			szDecimals,
		});
	const sizeForOrder =
		inputs.selectedBaseSize === undefined && inputs.sizeMode === "quote" && inputs.orderValueForSize
			? capSizeToQuoteAmount(convertedSize, inputs.sizeInput, szDecimals, inputs.orderValueForSize)
			: convertedSize;

	const sizeValue = Number(sizeForOrder);
	const exceedsMaxSize =
		!isSpotMarket &&
		reduceOnlyCapacity.status === "ordinary" &&
		inputs.isConnected &&
		exceedsPerpEntryMaxSize({
			maxTradeSize: inputs.maxTradeSzs?.[isBuy ? 0 : 1] ?? 0,
			markPx: inputs.markPx ?? 0,
			szDecimals,
			marginNotionalForSize: inputs.marginNotionalForSize,
			size: sizeForOrder,
		});
	const orderValue =
		(sizeValue > 0 ? inputs.orderValueForSize?.(sizeForOrder) : undefined) ??
		getOrderValue(sizeValue, inputs.conversionPrice);
	const marketBuyQuoteCost =
		isSpotMarket && isBuy && inputs.marketOrderSizing ? getOrderValue(sizeValue, Number(maxSizePrice)) : 0;
	const spotBuyQuoteCost = marketBuyQuoteCost > 0 ? marketBuyQuoteCost : orderValue;
	const sizeModeLabel = getSizeModeLabel(inputs.sizeMode, baseToken, quoteToken);

	return {
		reduceOnlyCapacity,
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
		exceedsMaxSize,
		spotBuyQuoteCost,
		sizeValue,
		sizeForOrder,
		orderValue,
		sizeModeLabel,
	};
}
