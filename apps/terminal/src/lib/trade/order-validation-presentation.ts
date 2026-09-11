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

const MARKET_DEPENDENT_ERRORS = new Set([
	"enter-size",
	"spot-enter-size",
	"min-order-notional",
	"spot-min-order-notional",
	"exceeds-max-size",
	"spot-insufficient-quote",
	"spot-insufficient-base",
	"tpsl-return-invalid",
	"enter-tpsl-price",
	"tp-price-invalid",
	"sl-price-invalid",
	"stop-trigger-above-mark",
	"stop-trigger-below-mark",
	"tp-trigger-above-mark",
	"tp-trigger-below-mark",
	"trigger-position-size",
	"scale-level-min-notional",
	"scale-size-allocation",
	"scale-skew-allocation",
	"twap-min-notional",
	"twap-trigger-differs-from-mark",
	"twap-stop-direction",
]);

const POSITION_DEPENDENT_ERRORS = new Set([
	"trigger-position-exists",
	"trigger-position-direction",
	"trigger-position-size",
]);

export function getOrderValidationPresentation(
	errors: readonly ValidationError[],
	state: PresentationState,
): ValidationError[] {
	if (!state.accountReady) return [];
	return errors.filter((error) => {
		if (error.category === "connection" || error.category === "market" || error.id === "no-balance") return false;
		if (!state.marketReady && MARKET_DEPENDENT_ERRORS.has(error.id)) return false;
		if (!state.positionReady && POSITION_DEPENDENT_ERRORS.has(error.id)) return false;
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
