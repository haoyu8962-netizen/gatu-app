import type { ValidationError } from "@/lib/errors/types";

interface PresentationState {
	accountReady: boolean;
	marketReady: boolean;
	positionReady: boolean;
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
		return true;
	});
}
