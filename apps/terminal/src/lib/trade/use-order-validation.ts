import type { MarkPriceStatus } from "@/domain/trade/market-price";
import { type PerpOrderContext, validatePerpOrder } from "@/lib/errors/stacks/perp-order";
import { type SpotOrderContext, validateSpotOrder } from "@/lib/errors/stacks/spot-order";
import type { FormValidationResult, Side } from "@/lib/trade/types";

export interface BaseOrderInput {
	assetId: number | null;
	szDecimals: number;
	isConnected: boolean;
	isWalletLoading: boolean;
	availableBalance: number;
	hasMarket: boolean;
	hasAssetIndex: boolean;
	markPriceStatus: MarkPriceStatus;
	requiresLiveMarkPrice: boolean;
	needsAgentApproval: boolean;
	isReadyToTrade: boolean;
	price: number;
	sizeValue: number;
	orderValue: number;
	side: Side;
	usesLimitPrice: boolean;
	usesTriggerPrice: boolean;
	triggerPriceNum: number | null;
	scaleOrder: boolean;
	twapOrder: boolean;
	scaleStartPriceNum: number | null;
	scaleEndPriceNum: number | null;
	scaleLevelsNum: number | null;
	scaleSkewNum: number | null;
	twapMinutesNum: number | null;
	twapTriggerPriceNum: number | null;
	twapStopPriceNum: number | null;
}

export interface SpotOrderFields {
	markPx: number;
	baseAvailable: number;
	quoteAvailable: number;
	baseToken: string;
	quoteToken: string;
}

export interface PerpOrderFields {
	orderType: string;
	markPx: number;
	maxSize: number;
	stopOrder: boolean;
	takeProfitOrder: boolean;
	positionSize: number | null;
	reduceOnly: boolean;
	tpSlEnabled: boolean;
	canUseTpSl: boolean;
	tpSlReturnInvalid: boolean;
	tpPriceNum: number | null;
	slPriceNum: number | null;
}

type SpotValidationInput = BaseOrderInput & SpotOrderFields & { isSpotMarket: true };
type PerpValidationInput = BaseOrderInput & PerpOrderFields & { isSpotMarket: false };
type ValidationInput = SpotValidationInput | PerpValidationInput;

export function spotInput(base: BaseOrderInput, spot: SpotOrderFields): SpotValidationInput {
	return { ...base, ...spot, isSpotMarket: true };
}

export function perpInput(base: BaseOrderInput, perp: PerpOrderFields): PerpValidationInput {
	return { ...base, ...perp, isSpotMarket: false };
}

function toResult(result: {
	valid: boolean;
	errors: { message: string }[];
	canSubmit: boolean;
	needsApproval: boolean;
}): FormValidationResult {
	return {
		valid: result.valid,
		errors: result.errors.map((e) => e.message),
		canSubmit: result.canSubmit,
		needsApproval: result.needsApproval,
	};
}

export function useOrderValidation(input: ValidationInput): FormValidationResult {
	if (input.isSpotMarket) {
		const context: SpotOrderContext = input;
		return toResult(validateSpotOrder(context));
	}

	const context: PerpOrderContext = input;
	return toResult(validatePerpOrder(context));
}
