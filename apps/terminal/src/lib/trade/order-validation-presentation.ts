import { isOrderSizeValidationError } from "@/domain/trade/order-size-validation";
import type { TpSlPriceErrors } from "@/domain/trade/tpsl-price-validation";
import type { ValidationError } from "@/lib/errors/types";
import { toBig } from "@/lib/trade/numbers";

interface PresentationState {
	accountReady: boolean;
	marketReady: boolean;
	positionReady: boolean;
	draft: {
		size: string;
		limitPrice: string;
		triggerPrice: string;
		tpPrice: string;
		slPrice: string;
		scaleStartPrice: string;
		scaleEndPrice: string;
	};
}

const MARKET_PRICE_COMPARISON_CODES = new Set(["TRG_001", "TRG_002", "TRG_003", "TRG_004", "TWAP_005", "TWAP_006"]);
const POSITION_DEPENDENT_CODES = new Set(["TRG_005", "TRG_006", "TRG_007"]);

export function getOrderValidationPresentation(
	errors: readonly ValidationError[],
	state: PresentationState,
): ValidationError[] {
	if (!state.accountReady) return [];
	return errors.filter((error) => {
		if (error.category === "connection" || error.category === "market" || error.id === "no-balance") return false;
		if (
			!state.marketReady &&
			(isOrderSizeValidationError(error) || error.category === "tpsl" || MARKET_PRICE_COMPARISON_CODES.has(error.code))
		)
			return false;
		if (!state.positionReady && POSITION_DEPENDENT_CODES.has(error.code)) return false;
		if (!state.draft.size.trim() && isOrderSizeValidationError(error)) return false;
		if ((error.id === "enter-limit-price" || error.id === "spot-enter-limit-price") && !state.draft.limitPrice.trim())
			return false;
		if (error.id === "enter-trigger-price" && !state.draft.triggerPrice.trim()) return false;
		if (error.id === "enter-tpsl-price" && !state.draft.tpPrice.trim() && !state.draft.slPrice.trim()) return false;
		if (
			error.id === "enter-price-range" &&
			(!state.draft.scaleStartPrice.trim() || !state.draft.scaleEndPrice.trim()) &&
			![state.draft.scaleStartPrice, state.draft.scaleEndPrice].some(
				(value) => value.trim() !== "" && !toBig(value)?.gt(0),
			)
		)
			return false;
		return true;
	});
}

export function isInlineTpSlValidationError(error: ValidationError, priceErrors: TpSlPriceErrors): boolean {
	return (
		(error.id === "tp-price-invalid" && priceErrors.tp) ||
		(error.id === "sl-price-invalid" && priceErrors.sl) ||
		error.id === "tpsl-return-invalid"
	);
}
