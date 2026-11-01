import type { MarkPriceStatus } from "@/domain/trade/market-price";
import { noBalanceValidator } from "../definitions/balance";
import {
	signerNotReadyValidator,
	walletLoadingValidator,
	walletNotConnectedValidator,
} from "../definitions/connection";
import { liveMarkPriceValidator, marketNotReadyValidator, noMarketValidator } from "../definitions/market";
import {
	limitPriceTickValidator,
	type PriceTickContext,
	twapStopPriceTickValidator,
	twapTriggerPriceTickValidator,
} from "../definitions/price-tick";
import {
	enterPriceRangeValidator,
	type ScaleContext,
	scaleLevelMinNotionalValidator,
	scaleLevelsRangeValidator,
	scalePricePrecisionValidator,
	scaleSizeAllocationValidator,
	scaleSkewAllocationValidator,
	scaleSkewRangeValidator,
	scaleStartEndDifferValidator,
} from "../definitions/scale";
import {
	insufficientBaseBalanceValidator,
	insufficientQuoteBalanceValidator,
	type SpotBalanceContext,
} from "../definitions/spot-balance";
import {
	type SpotInputContext,
	spotEnterLimitPriceValidator,
	spotEnterSizeValidator,
	spotMinOrderNotionalValidator,
} from "../definitions/spot-input";
import {
	type TwapContext,
	twapMinNotionalValidator,
	twapMinutesRangeValidator,
	twapStopBeyondTriggerValidator,
	twapStopDirectionValidator,
	twapStopPricePositiveValidator,
	twapTriggerDiffersFromMarkValidator,
	twapTriggerPricePositiveValidator,
} from "../definitions/twap";
import { runValidators, type ValidationError, type Validator } from "../types";

export interface SpotOrderContext
	extends SpotInputContext,
		SpotBalanceContext,
		ScaleContext,
		TwapContext,
		PriceTickContext {
	isConnected: boolean;
	isWalletLoading: boolean;
	isReadyToTrade: boolean;
	needsAgentApproval: boolean;
	availableBalance: number;
	hasMarket: boolean;
	hasAssetIndex: boolean;
	markPriceStatus: MarkPriceStatus;
	requiresLiveMarkPrice: boolean;
}

export interface SpotOrderValidationResult {
	valid: boolean;
	errors: ValidationError[];
	canSubmit: boolean;
	needsApproval: boolean;
}

const spotOrderValidators: Validator<SpotOrderContext>[] = [
	walletNotConnectedValidator,
	walletLoadingValidator,
	noBalanceValidator,
	noMarketValidator,
	marketNotReadyValidator,
	signerNotReadyValidator,
	liveMarkPriceValidator,
	spotEnterLimitPriceValidator,
	limitPriceTickValidator,
	twapTriggerPriceTickValidator,
	twapStopPriceTickValidator,
	spotEnterSizeValidator,
	spotMinOrderNotionalValidator,
	enterPriceRangeValidator,
	scaleLevelsRangeValidator,
	scaleStartEndDifferValidator,
	scaleSizeAllocationValidator,
	scalePricePrecisionValidator,
	scaleLevelMinNotionalValidator,
	scaleSkewRangeValidator,
	scaleSkewAllocationValidator,
	twapMinutesRangeValidator,
	twapMinNotionalValidator,
	twapTriggerPricePositiveValidator,
	twapStopPricePositiveValidator,
	twapTriggerDiffersFromMarkValidator,
	twapStopDirectionValidator,
	twapStopBeyondTriggerValidator,
	insufficientQuoteBalanceValidator,
	insufficientBaseBalanceValidator,
];

export function validateSpotOrder(context: SpotOrderContext): SpotOrderValidationResult {
	if (context.needsAgentApproval) {
		return { valid: false, errors: [], canSubmit: false, needsApproval: true };
	}

	const errors = runValidators(spotOrderValidators, context);

	return {
		valid: errors.length === 0,
		errors,
		canSubmit: errors.length === 0,
		needsApproval: false,
	};
}
