import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
	SCALE_LEVELS_MAX,
	SCALE_LEVELS_MIN,
	TWAP_MIN_NOTIONAL_USD,
	TWAP_MINUTES_MAX,
	TWAP_MINUTES_MIN,
} from "@/config/trade";
import { EntryExecutionError } from "@/domain/trade/order/entry-execution-guard";
import { OrderTrackingInputError } from "@/domain/trade/order-tracking";
import { SpotSwapExecutionError } from "@/domain/trade/spot-swap-execution-guard";
import { TwapOrderDetailsError } from "@/domain/trade/twap-details";

export type OrderSubmissionFeedbackCode =
	| "blocked-order"
	| "blocked-twap"
	| "balance-changed"
	| "coordination-unavailable"
	| "exchange-order-rejected"
	| "live-position-unavailable"
	| "live-trading-data-unavailable"
	| "market-precision-invalid"
	| "market-context-mismatch"
	| "no-active-account"
	| "order-conditions-changed"
	| "order-failed"
	| "scale-level-below-min-notional"
	| "scale-levels-range"
	| "scale-price-range"
	| "scale-prices-not-distinct"
	| "scale-size-skew-too-aggressive"
	| "scale-size-too-small"
	| "scale-skew-invalid"
	| "secure-random-unavailable"
	| "twap-cancel-failed"
	| "twap-cancel-identity-changed"
	| "twap-cancel-market-unavailable"
	| "twap-cancel-unconfirmed"
	| "twap-min-notional"
	| "twap-minutes-range"
	| "twap-state-unavailable";

export interface OrderSubmissionFeedback {
	kind: "order-submission";
	code: OrderSubmissionFeedbackCode;
}

const messages: Record<OrderSubmissionFeedbackCode, MessageDescriptor> = {
	"balance-changed": msg`Balance changed before submission. Review the updated balance and try again.`,
	"blocked-order": msg`Another order for this market is still being confirmed.`,
	"blocked-twap": msg`Another TWAP order for this market is still being confirmed.`,
	"coordination-unavailable": msg`Safe order coordination across tabs is unavailable in this browser.`,
	"exchange-order-rejected": msg`The exchange did not accept the order.`,
	"live-position-unavailable": msg`Live position data is unavailable. Wait for the account connection to recover.`,
	"live-trading-data-unavailable": msg`Live trading data is unavailable. Wait for it to refresh and try again.`,
	"market-precision-invalid": msg`Market precision data is invalid. Refresh market data before placing an order.`,
	"market-context-mismatch": msg`Order market context does not match the submitted asset.`,
	"no-active-account": msg`No active Hyperliquid account`,
	"order-conditions-changed": msg`Order conditions changed before it was confirmed. Review the order and submit it again.`,
	"order-failed": msg`Order failed`,
	"scale-level-below-min-notional": msg`Scale level below min notional`,
	"scale-levels-range": msg`Scale levels must be ${SCALE_LEVELS_MIN}-${SCALE_LEVELS_MAX}`,
	"scale-price-range": msg`Enter price range`,
	"scale-prices-not-distinct": msg`Scale prices must resolve to distinct ticks`,
	"scale-size-skew-too-aggressive": msg`Size skew is too aggressive for the total size`,
	"scale-size-too-small": msg`Scale size is too small for the selected number of orders`,
	"scale-skew-invalid": msg`Enter a valid scale skew`,
	"secure-random-unavailable": msg`Secure random number generation is unavailable in this browser. Use a supported browser before placing an order.`,
	"twap-cancel-failed": msg`Failed to cancel TWAP order.`,
	"twap-cancel-identity-changed": msg`The trading account or network changed. Review active TWAP orders before retrying.`,
	"twap-cancel-market-unavailable": msg`Unable to identify this TWAP market. Refresh market data before retrying.`,
	"twap-cancel-unconfirmed": msg`TWAP cancellation was submitted, but its status could not be confirmed. Check the active TWAP list before retrying.`,
	"twap-min-notional": msg`TWAP order value must be at least $${TWAP_MIN_NOTIONAL_USD}.`,
	"twap-minutes-range": msg`TWAP minutes must be ${TWAP_MINUTES_MIN}-${TWAP_MINUTES_MAX}`,
	"twap-state-unavailable": msg`TWAP order state is still loading. Please retry in a moment.`,
};

export class OrderSubmissionFeedbackCause extends Error {
	constructor(readonly feedback: OrderSubmissionFeedback) {
		super(getDefaultOrderSubmissionFeedbackMessage(feedback));
		this.name = "OrderSubmissionFeedbackCause";
	}
}

export function orderSubmissionFeedback(code: OrderSubmissionFeedbackCode): OrderSubmissionFeedback {
	return { kind: "order-submission", code };
}

export function orderSubmissionFeedbackCause(code: OrderSubmissionFeedbackCode): OrderSubmissionFeedbackCause {
	return new OrderSubmissionFeedbackCause(orderSubmissionFeedback(code));
}

export function getOrderSubmissionFeedback(cause: unknown): OrderSubmissionFeedback | null {
	if (cause instanceof OrderSubmissionFeedbackCause) return cause.feedback;
	if (cause instanceof EntryExecutionError) return getEntryExecutionFeedback(cause);
	if (cause instanceof SpotSwapExecutionError) return getSpotSwapExecutionFeedback(cause);
	if (cause instanceof TwapOrderDetailsError) return orderSubmissionFeedback("order-conditions-changed");
	if (cause instanceof OrderTrackingInputError) {
		return orderSubmissionFeedback(
			cause.reason === "secure-random-unavailable" ? "secure-random-unavailable" : "order-conditions-changed",
		);
	}
	return null;
}

export function getOrderPlanSubmissionFeedback(message: string | undefined): OrderSubmissionFeedback {
	switch (message) {
		case "Order market precision is invalid":
			return orderSubmissionFeedback("market-precision-invalid");
		case `Scale levels must be ${SCALE_LEVELS_MIN}-${SCALE_LEVELS_MAX}`:
			return orderSubmissionFeedback("scale-levels-range");
		case "Enter a valid scale price range":
			return orderSubmissionFeedback("scale-price-range");
		case "Enter a valid scale skew":
			return orderSubmissionFeedback("scale-skew-invalid");
		case "Scale size is too small for the selected number of orders":
			return orderSubmissionFeedback("scale-size-too-small");
		case "Size skew is too aggressive for the total size":
			return orderSubmissionFeedback("scale-size-skew-too-aggressive");
		case "Scale prices must resolve to distinct ticks":
			return orderSubmissionFeedback("scale-prices-not-distinct");
		case "Scale level below min notional":
			return orderSubmissionFeedback("scale-level-below-min-notional");
		default:
			return orderSubmissionFeedback("order-conditions-changed");
	}
}

function getEntryExecutionFeedback(cause: EntryExecutionError): OrderSubmissionFeedback {
	switch (cause.reason) {
		case "market-context-mismatch":
		case "inactive":
			return orderSubmissionFeedback("market-context-mismatch");
		case "position-data-unavailable":
			return orderSubmissionFeedback("live-position-unavailable");
		case "execution-price-unavailable":
		case "mark-price-unavailable":
		case "trading-availability-unavailable":
			return orderSubmissionFeedback("live-trading-data-unavailable");
		case "twap-duration-invalid":
			return orderSubmissionFeedback("twap-minutes-range");
		case "twap-notional-too-small":
			return orderSubmissionFeedback("twap-min-notional");
		case "order-request-invalid":
		case "reduce-only-position-changed":
		case "slippage-limit-exceeded":
		case "slippage-setting-invalid":
		case "stop-price-invalidated":
		case "trading-availability-changed":
		case "trigger-price-invalidated":
			return orderSubmissionFeedback("order-conditions-changed");
	}
}

function getSpotSwapExecutionFeedback(cause: SpotSwapExecutionError): OrderSubmissionFeedback {
	switch (cause.reason) {
		case "balance-changed":
			return orderSubmissionFeedback("balance-changed");
		case "balance-unavailable":
		case "swap-data-unavailable":
			return orderSubmissionFeedback("live-trading-data-unavailable");
		case "quote-changed":
			return orderSubmissionFeedback("order-conditions-changed");
	}
}

export function formatOrderSubmissionFeedback(
	feedback: OrderSubmissionFeedback,
	translate: (descriptor: MessageDescriptor) => string,
): string {
	return translate(messages[feedback.code]);
}

export function formatOrderSubmissionCause(
	cause: Error | null | undefined,
	translate: (descriptor: MessageDescriptor) => string,
): string | null {
	if (!cause) return null;
	const feedback = getOrderSubmissionFeedback(cause);
	return feedback ? formatOrderSubmissionFeedback(feedback, translate) : cause.message;
}

export function getDefaultOrderSubmissionFeedbackMessage(feedback: OrderSubmissionFeedback): string {
	switch (feedback.code) {
		case "balance-changed":
			return "Balance changed before submission. Review the updated balance and try again.";
		case "blocked-order":
			return "Another order for this market is still being confirmed.";
		case "blocked-twap":
			return "Another TWAP order for this market is still being confirmed.";
		case "coordination-unavailable":
			return "Safe order coordination across tabs is unavailable in this browser.";
		case "exchange-order-rejected":
			return "The exchange did not accept the order.";
		case "live-position-unavailable":
			return "Live position data is unavailable. Wait for the account connection to recover.";
		case "live-trading-data-unavailable":
			return "Live trading data is unavailable. Wait for it to refresh and try again.";
		case "market-precision-invalid":
			return "Market precision data is invalid. Refresh market data before placing an order.";
		case "market-context-mismatch":
			return "Order market context does not match the submitted asset.";
		case "no-active-account":
			return "No active Hyperliquid account";
		case "order-conditions-changed":
			return "Order conditions changed before it was confirmed. Review the order and submit it again.";
		case "order-failed":
			return "Order failed";
		case "scale-level-below-min-notional":
			return "Scale level below min notional";
		case "scale-levels-range":
			return `Scale levels must be ${SCALE_LEVELS_MIN}-${SCALE_LEVELS_MAX}`;
		case "scale-price-range":
			return "Enter price range";
		case "scale-prices-not-distinct":
			return "Scale prices must resolve to distinct ticks";
		case "scale-size-skew-too-aggressive":
			return "Size skew is too aggressive for the total size";
		case "scale-size-too-small":
			return "Scale size is too small for the selected number of orders";
		case "scale-skew-invalid":
			return "Enter a valid scale skew";
		case "secure-random-unavailable":
			return "Secure random number generation is unavailable in this browser. Use a supported browser before placing an order.";
		case "twap-cancel-failed":
			return "Failed to cancel TWAP order.";
		case "twap-cancel-identity-changed":
			return "The trading account or network changed. Review active TWAP orders before retrying.";
		case "twap-cancel-market-unavailable":
			return "Unable to identify this TWAP market. Refresh market data before retrying.";
		case "twap-cancel-unconfirmed":
			return "TWAP cancellation was submitted, but its status could not be confirmed. Check the active TWAP list before retrying.";
		case "twap-min-notional":
			return `TWAP order value must be at least $${TWAP_MIN_NOTIONAL_USD}.`;
		case "twap-minutes-range":
			return `TWAP minutes must be ${TWAP_MINUTES_MIN}-${TWAP_MINUTES_MAX}`;
		case "twap-state-unavailable":
			return "TWAP order state is still loading. Please retry in a moment.";
	}
}
