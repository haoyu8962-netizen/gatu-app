import Big from "big.js";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { ORDER_MIN_NOTIONAL_USD } from "@/config/trade";
import type { SpotMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import type { SpotToken } from "@/lib/hyperliquid/markets";
import { toBig } from "@/lib/trade/numbers";

const BPS_DIVISOR = 10_000;
const TENTHS_OF_BPS_DIVISOR = 100_000;
const STABLE_PAIR_FEE_SCALE = "0.2";

export const DEFAULT_SWAP_SLIPPAGE_BPS = 100;
export const STABLECOIN_SWAP_TOKEN_NAMES = [DEFAULT_QUOTE_TOKEN, "USDT0", "USDH"] as const;

type StablecoinSwapTokenName = (typeof STABLECOIN_SWAP_TOKEN_NAMES)[number];

interface SwapBookLevel {
	px: string;
	sz: string;
}

interface BuildSwapQuoteParams {
	amount: string;
	isBuying: boolean;
	bids: SwapBookLevel[] | undefined;
	asks: SwapBookLevel[] | undefined;
	referencePrice?: string;
	szDecimals: number;
	slippageBps: number;
	takerFeeRate: number;
	builderFeeTenthsBps: number | string;
	isStablecoinSwap: boolean;
}

export interface SwapQuote {
	estimatedReceive: string;
	feeAmount: string;
	filledInput: string;
	isPartial: boolean;
	isBelowMinimumNotional: boolean;
	limitPrice: string;
	maxInput: string;
	orderNotional: string;
	orderSize: string;
	rate: string;
}

export function getAvailablePairTokens(token: string, spotMarkets: SpotMarketInfo[]): SpotToken[] {
	const tokenMap = new Map<string, SpotToken>();

	for (const market of spotMarkets) {
		if (market.tokensInfo.length < 2) continue;

		const baseToken = market.tokensInfo[0];
		const quoteToken = market.tokensInfo[1];

		if (baseToken?.name === token && quoteToken) {
			if (!tokenMap.has(quoteToken.name)) {
				tokenMap.set(quoteToken.name, quoteToken);
			}
		}

		if (quoteToken?.name === token && baseToken) {
			if (!tokenMap.has(baseToken.name)) {
				tokenMap.set(baseToken.name, baseToken);
			}
		}
	}

	return Array.from(tokenMap.values()).sort((a, b) => {
		if (a.name === DEFAULT_QUOTE_TOKEN) return -1;
		if (b.name === DEFAULT_QUOTE_TOKEN) return 1;
		return a.displayName.localeCompare(b.displayName);
	});
}

function isStablecoinSwapToken(token: string): token is StablecoinSwapTokenName {
	return STABLECOIN_SWAP_TOKEN_NAMES.includes(token as StablecoinSwapTokenName);
}

function sortStablecoinSwapTokens(tokens: SpotToken[]): SpotToken[] {
	return [...tokens].sort(
		(left, right) =>
			STABLECOIN_SWAP_TOKEN_NAMES.indexOf(left.name as StablecoinSwapTokenName) -
			STABLECOIN_SWAP_TOKEN_NAMES.indexOf(right.name as StablecoinSwapTokenName),
	);
}

export function getStablecoinSwapFromTokens(spotMarkets: SpotMarketInfo[]): SpotToken[] {
	const tokens = new Map<string, SpotToken>();

	for (const market of spotMarkets) {
		if (market.tokensInfo.length < 2) continue;
		const baseToken = market.tokensInfo[0];
		const quoteToken = market.tokensInfo[1];
		if (!baseToken || !quoteToken) continue;
		if (quoteToken.name !== DEFAULT_QUOTE_TOKEN || !isStablecoinSwapToken(baseToken.name)) continue;

		tokens.set(quoteToken.name, quoteToken);
		tokens.set(baseToken.name, baseToken);
	}

	return sortStablecoinSwapTokens(Array.from(tokens.values()));
}

export function getStablecoinSwapToTokens(token: string, spotMarkets: SpotMarketInfo[]): SpotToken[] {
	if (!isStablecoinSwapToken(token)) return [];

	const pairTokens = getAvailablePairTokens(token, spotMarkets);
	if (token === DEFAULT_QUOTE_TOKEN) {
		return sortStablecoinSwapTokens(
			pairTokens.filter((candidate) => candidate.name !== DEFAULT_QUOTE_TOKEN && isStablecoinSwapToken(candidate.name)),
		);
	}

	return pairTokens.filter((candidate) => candidate.name === DEFAULT_QUOTE_TOKEN);
}

export function findSpotPair(tokenA: string, tokenB: string, spotMarkets: SpotMarketInfo[]): SpotMarketInfo | null {
	for (const market of spotMarkets) {
		if (market.tokensInfo.length < 2) continue;

		const baseToken = market.tokensInfo[0]?.name;
		const quoteToken = market.tokensInfo[1]?.name;

		if ((baseToken === tokenA && quoteToken === tokenB) || (baseToken === tokenB && quoteToken === tokenA)) {
			return market;
		}
	}
	return null;
}

export function getSwapSide(fromToken: string, spotMarket: SpotMarketInfo): boolean {
	const baseToken = spotMarket.tokensInfo[0]?.name;
	return fromToken !== baseToken;
}

export function getMaxSwapInput(
	balance: string | number,
	isBuying: boolean,
	slippageBps = DEFAULT_SWAP_SLIPPAGE_BPS,
	decimals = 6,
): string {
	const balanceValue = toBig(balance);
	if (!balanceValue || balanceValue.lte(0)) return "0";
	if (!isBuying) return balanceValue.round(decimals, Big.roundDown).toString();

	return balanceValue
		.div(Big(1).plus(Big(slippageBps).div(BPS_DIVISOR)))
		.round(decimals, Big.roundDown)
		.toString();
}

export function buildSwapQuote({
	amount,
	isBuying,
	bids,
	asks,
	referencePrice,
	szDecimals,
	slippageBps,
	takerFeeRate,
	builderFeeTenthsBps,
	isStablecoinSwap,
}: BuildSwapQuoteParams): SwapQuote | null {
	const amountValue = toBig(amount);
	if (!amountValue || amountValue.lte(0)) return null;

	const levels = isBuying ? asks : bids;
	const firstLevel = levels?.[0];
	const bestPrice = toBig(firstLevel?.px);
	if (!levels || !bestPrice || bestPrice.lte(0)) return null;

	const slippageFraction = Big(slippageBps).div(BPS_DIVISOR);
	const limitPrice = isBuying
		? bestPrice.times(Big(1).plus(slippageFraction))
		: bestPrice.times(Big(1).minus(slippageFraction));
	const parsedReferencePrice = toBig(referencePrice);
	const sizeReferencePrice = isBuying ? bestPrice : parsedReferencePrice?.gt(0) ? parsedReferencePrice : bestPrice;
	const requestedSize = (isBuying ? amountValue.div(sizeReferencePrice) : amountValue).round(szDecimals, Big.roundDown);
	if (requestedSize.lte(0)) return null;

	let remainingSize = requestedSize;
	let filledSize = requestedSize.times(0);
	let quoteAmount = requestedSize.times(0);

	for (const level of levels) {
		const price = toBig(level.px);
		const size = toBig(level.sz);
		if (!price || !size || price.lte(0) || size.lte(0)) continue;
		if ((isBuying && price.gt(limitPrice)) || (!isBuying && price.lt(limitPrice))) break;

		const fillSize = bigMin(remainingSize, size);
		filledSize = filledSize.plus(fillSize);
		quoteAmount = quoteAmount.plus(fillSize.times(price));
		remainingSize = remainingSize.minus(fillSize);
		if (remainingSize.lte(0)) break;
	}

	if (filledSize.lte(0)) return null;

	const grossReceive = isBuying ? filledSize : quoteAmount;
	const filledInput = isBuying ? quoteAmount : filledSize;
	const rawFeeRate = toBig(takerFeeRate);
	const takerFeeRateValue = rawFeeRate?.gt(0)
		? rawFeeRate.times(isStablecoinSwap ? STABLE_PAIR_FEE_SCALE : 1)
		: grossReceive.times(0);
	const builderFeeRate = isBuying
		? grossReceive.times(0)
		: (toBig(builderFeeTenthsBps)?.div(TENTHS_OF_BPS_DIVISOR) ?? grossReceive.times(0));
	const feeRate = takerFeeRateValue.plus(builderFeeRate);
	const feeAmount = grossReceive.times(feeRate);
	const estimatedReceive = bigMax(grossReceive.minus(feeAmount), grossReceive.times(0));
	const maxInput = isBuying ? requestedSize.times(limitPrice) : requestedSize;
	const orderNotional = requestedSize.times(sizeReferencePrice);

	return {
		estimatedReceive: estimatedReceive.toString(),
		feeAmount: feeAmount.toString(),
		filledInput: filledInput.toString(),
		isPartial: filledSize.lt(requestedSize),
		isBelowMinimumNotional: orderNotional.lt(ORDER_MIN_NOTIONAL_USD),
		limitPrice: limitPrice.toString(),
		maxInput: maxInput.toString(),
		orderNotional: orderNotional.toString(),
		orderSize: requestedSize.toString(),
		rate: grossReceive.div(filledInput).toString(),
	};
}

function bigMin(left: Big, right: Big): Big {
	return left.lte(right) ? left : right;
}

function bigMax(left: Big, right: Big): Big {
	return left.gte(right) ? left : right;
}
