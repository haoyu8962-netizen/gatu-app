import type { MarkPriceStatus } from "@/domain/trade/market-price";
import { noBalanceValidator } from "../definitions/balance";
import {
	signerNotReadyValidator,
	walletLoadingValidator,
	walletNotConnectedValidator,
} from "../definitions/connection";
import {
	liveMarkPriceValidator,
	marketNotReadyValidator,
	noMarketValidator,
	noMarkPriceValidator,
} from "../definitions/market";
import { limitOrderOpenInterestCapValidator, type OpenInterestCapContext } from "../definitions/open-interest-cap";
import {
	enterLimitPriceValidator,
	enterSizeValidator,
	enterTriggerPriceValidator,
	exceedsMaxSizeValidator,
	minOrderNotionalValidator,
	type OrderInputContext,
} from "../definitions/order-input";
import {
	reduceOnlyPositionDirectionValidator,
	reduceOnlyPositionExistsValidator,
	reduceOnlyPositionSizeValidator,
} from "../definitions/reduce-only";
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
	enterTpSlPriceValidator,
	slPriceValidator,
	type TpSlContext,
	tpPriceValidator,
	tpSlReturnValidator,
} from "../definitions/tpsl";
import {
	stopTriggerAboveMarkValidator,
	stopTriggerBelowMarkValidator,
	type TriggerContext,
	tpTriggerAboveMarkValidator,
	tpTriggerBelowMarkValidator,
} from "../definitions/trigger";
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

export interface PerpOrderContext
	extends OrderInputContext,
		OpenInterestCapContext,
		TpSlContext,
		TriggerContext,
		ScaleContext,
		TwapContext {
	isConnected: boolean;
	isWalletLoading: boolean;
	isReadyToTrade: boolean;
	needsAgentApproval: boolean;
	availableBalance: number;
	hasMarket: boolean;
	hasAssetIndex: boolean;
	markPriceStatus: MarkPriceStatus;
	requiresLiveMarkPrice: boolean;
	orderType: string;
}

export interface PerpOrderValidationResult {
	valid: boolean;
	errors: ValidationError[];
	canSubmit: boolean;
	needsApproval: boolean;
}

const perpOrderValidators: Validator<PerpOrderContext>[] = [
	walletNotConnectedValidator,
	walletLoadingValidator,
	{ ...noBalanceValidator, validate: (ctx) => ctx.reduceOnly || noBalanceValidator.validate(ctx) },
	noMarketValidator,
	marketNotReadyValidator,
	signerNotReadyValidator,
	liveMarkPriceValidator,
	limitOrderOpenInterestCapValidator,
	noMarkPriceValidator,
	enterLimitPriceValidator,
	enterTriggerPriceValidator,
	enterSizeValidator,
	minOrderNotionalValidator,
	{ ...exceedsMaxSizeValidator, validate: (ctx) => ctx.reduceOnly || exceedsMaxSizeValidator.validate(ctx) },
	tpSlReturnValidator,
	enterTpSlPriceValidator,
	tpPriceValidator,
	slPriceValidator,
	stopTriggerAboveMarkValidator,
	stopTriggerBelowMarkValidator,
	tpTriggerAboveMarkValidator,
	tpTriggerBelowMarkValidator,
	reduceOnlyPositionExistsValidator,
	reduceOnlyPositionDirectionValidator,
	reduceOnlyPositionSizeValidator,
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
];

export function validatePerpOrder(context: PerpOrderContext): PerpOrderValidationResult {
	if (context.needsAgentApproval) {
		return { valid: false, errors: [], canSubmit: false, needsApproval: true };
	}

	const errors = runValidators(perpOrderValidators, context);

	return {
		valid: errors.length === 0,
		errors,
		canSubmit: errors.length === 0,
		needsApproval: false,
	};
}
