import type { ValidationError } from "@/lib/errors/types";

const ORDER_SIZE_VALIDATION_CODES = new Set([
	"INP_003",
	"INP_004",
	"INP_005",
	"SCL_004",
	"SCL_005",
	"SCL_008",
	"SPOT_BAL_001",
	"SPOT_BAL_002",
	"SPOT_INP_002",
	"SPOT_INP_003",
	"TRG_007",
	"TWAP_002",
]);

export function isOrderSizeValidationError(error: Pick<ValidationError, "code">): boolean {
	return ORDER_SIZE_VALIDATION_CODES.has(error.code);
}

export function hasOrderSizeValidationError(errors: readonly ValidationError[]): boolean {
	return errors.some(isOrderSizeValidationError);
}
