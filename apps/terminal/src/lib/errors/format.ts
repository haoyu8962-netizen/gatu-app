import { msg } from "@lingui/core/macro";
import { SCALE_LEVELS_MAX, SCALE_LEVELS_MIN } from "@/config/trade";
import type { Translate } from "@/lib/translate";
import { describeActionError, isAmbiguousExchangeActionError } from "./action-error";

export { isAmbiguousExchangeActionError, isSmartWalletNonceConflict } from "./action-error";

/**
 * Describes a failed funds or wallet operation in the active language. Pass the surface's own
 * message as the fallback for failures that have nothing more specific to say.
 */
export function formatTransferError(error: Error | null, translate: Translate, fallback?: string): string {
	if (!error) return fallback ?? translate(msg`Unknown error`);
	return describeActionError(error, translate, fallback);
}

/**
 * Describes a failed signed exchange action. A result that may still have executed is reported as
 * unconfirmed; unknown failures use the caller's fallback instead of an untranslated message.
 */
export function formatExchangeActionError(error: unknown, fallback: string, translate: Translate): string {
	if (isAmbiguousExchangeActionError(error)) {
		return translate(msg`Request status could not be confirmed. Check balances and transfer history before retrying.`);
	}
	return describeActionError(error, translate, fallback);
}

export function formatOrderPlanError(message: string, translate: Translate): string {
	switch (message) {
		case `Scale levels must be ${SCALE_LEVELS_MIN}-${SCALE_LEVELS_MAX}`:
			return translate(msg`Scale levels must be ${SCALE_LEVELS_MIN}-${SCALE_LEVELS_MAX}`);
		case "Enter a valid scale price range":
			return translate(msg`Enter price range`);
		case "Enter a valid scale skew":
			return translate(msg`Enter a valid scale skew`);
		case "Scale size is too small for the selected number of orders":
			return translate(msg`Scale size is too small for the selected number of orders`);
		case "Size skew is too aggressive for the total size":
			return translate(msg`Size skew is too aggressive for the total size`);
		case "Scale prices must resolve to distinct ticks":
			return translate(msg`Scale prices must resolve to distinct ticks`);
		case "Scale level below min notional":
			return translate(msg`Scale level below min notional`);
		default:
			return translate(msg`Order conditions changed before it was confirmed. Review the order and submit it again.`);
	}
}
