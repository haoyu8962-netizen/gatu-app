import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
	formatOrderSubmissionCause,
	formatOrderSubmissionFeedback,
	getDefaultOrderSubmissionFeedbackMessage,
	getOrderSubmissionFeedback,
	type OrderSubmissionFeedback,
	OrderSubmissionFeedbackCause,
} from "@/lib/trade/order-submission-feedback";

export type PositionSubmitFeedbackCode =
	| "accept-hip3-market"
	| "accept-hip3-markets"
	| "active-twap"
	| "blocked-market"
	| "blocked-markets"
	| "close-all-preview-expired"
	| "close-orders-rejected"
	| "close-percent-decimal"
	| "close-percent-range"
	| "close-size-below-precision"
	| "close-size-decimal"
	| "close-size-exceeds-position"
	| "close-size-positive"
	| "coordination-unavailable"
	| "enter-limit-price"
	| "failed-build-close-order"
	| "failed-limit-close"
	| "failed-load-positions"
	| "failed-market-close"
	| "failed-reverse"
	| "failed-submit-close-orders"
	| "failed-update-isolated-margin"
	| "isolated-margin-ambiguous"
	| "isolated-margin-blocked"
	| "isolated-margin-coordination-unavailable"
	| "isolated-margin-market-changed"
	| "isolated-margin-position-unavailable"
	| "isolated-margin-removal-disallowed"
	| "isolated-margin-side-changed"
	| "isolated-margin-target-not-below-current"
	| "isolated-margin-target-positive"
	| "isolated-position-closed"
	| "isolated-position-not-isolated"
	| "no-active-positions"
	| "position-size-below-precision"
	| "position-size-nonzero"
	| "positions-changed"
	| "reconciling-close-orders"
	| "reconciling-order"
	| "size-precision-nonnegative"
	| "trading-data-changed";

export type PositionSubmitFeedback =
	| OrderSubmissionFeedback
	| { kind: "localized"; code: PositionSubmitFeedbackCode }
	| { kind: "partial-close-all"; acceptedCount: number; totalCount: number }
	| { kind: "raw"; message: string };

const messages: Record<PositionSubmitFeedbackCode, MessageDescriptor> = {
	"accept-hip3-market": msg`Accept the HIP-3 deployer disclaimer before trading this market.`,
	"accept-hip3-markets": msg`Accept the HIP-3 deployer disclaimer before trading these markets.`,
	"active-twap": msg`A TWAP is active for one of these markets.`,
	"blocked-market": msg`Another order for this market is still being confirmed.`,
	"blocked-markets": msg`Another order for one of these markets is still being confirmed.`,
	"close-all-preview-expired": msg`This close-all preview expired. Close and reopen it to review current values.`,
	"close-orders-rejected": msg`Close orders rejected`,
	"close-percent-decimal": msg`Close percentage must be a decimal number`,
	"close-percent-range": msg`Close percentage must be between 0 and 100`,
	"close-size-below-precision": msg`Close size is below market precision`,
	"close-size-decimal": msg`Close size must be a decimal number`,
	"close-size-exceeds-position": msg`Close size exceeds current position`,
	"close-size-positive": msg`Close size must be greater than zero`,
	"coordination-unavailable": msg`Safe order coordination across tabs is unavailable in this browser.`,
	"enter-limit-price": msg`Enter limit price`,
	"failed-build-close-order": msg`Failed to build a close order`,
	"failed-limit-close": msg`Failed to place limit close order`,
	"failed-load-positions": msg`Failed to load positions.`,
	"failed-market-close": msg`Failed to close position`,
	"failed-reverse": msg`Failed to reverse position`,
	"failed-submit-close-orders": msg`Failed to submit close orders`,
	"failed-update-isolated-margin": msg`Failed to update isolated margin`,
	"isolated-margin-ambiguous": msg`The margin update may have been applied. Refresh position data before trying again.`,
	"isolated-margin-blocked": msg`Another action for this market is already in progress.`,
	"isolated-margin-coordination-unavailable": msg`Safe action coordination across tabs is unavailable in this browser.`,
	"isolated-margin-market-changed": msg`The selected market changed. Reopen the margin dialog before adjusting margin.`,
	"isolated-margin-position-unavailable": msg`Live position data is unavailable. Wait for the account connection to recover before adjusting margin.`,
	"isolated-margin-removal-disallowed": msg`This strict isolated market does not allow margin to be removed from an open position.`,
	"isolated-margin-side-changed": msg`This position changed sides. Reopen the margin dialog before adjusting margin.`,
	"isolated-margin-target-not-below-current": msg`Target leverage must be below the current effective leverage to add margin.`,
	"isolated-margin-target-positive": msg`Enter a positive target leverage.`,
	"isolated-position-closed": msg`This isolated position is no longer open.`,
	"isolated-position-not-isolated": msg`This position is no longer using isolated margin.`,
	"no-active-positions": msg`No active positions.`,
	"position-size-below-precision": msg`Position size is below market precision`,
	"position-size-nonzero": msg`Position size must be a non-zero number`,
	"positions-changed": msg`Positions changed while this confirmation was open. Close and reopen it before submitting.`,
	"reconciling-close-orders": msg`Close orders submitted. Confirming exchange status; do not retry.`,
	"reconciling-order": msg`Order submitted. Confirming exchange status; do not retry.`,
	"size-precision-nonnegative": msg`Size precision must be a non-negative integer`,
	"trading-data-changed": msg`Trading data changed while this dialog was open. Close and reopen it before submitting.`,
};

const partialCloseAllMessage = msg`{acceptedCount} of {totalCount} close orders were accepted. Review positions before retrying.`;

export class PositionSubmitFeedbackCause extends Error {
	constructor(
		readonly feedback: PositionSubmitFeedback,
		message = getDefaultPositionSubmitFeedbackMessage(feedback),
	) {
		super(message);
		this.name = "PositionSubmitFeedbackCause";
	}
}

export function localizedPositionSubmitFeedback(code: PositionSubmitFeedbackCode): PositionSubmitFeedback {
	return { kind: "localized", code };
}

export function partialCloseAllFeedback(acceptedCount: number, totalCount: number): PositionSubmitFeedback {
	return { kind: "partial-close-all", acceptedCount, totalCount };
}

export function positionSubmitFeedbackCause(code: PositionSubmitFeedbackCode): PositionSubmitFeedbackCause {
	return new PositionSubmitFeedbackCause(localizedPositionSubmitFeedback(code));
}

export function positionSubmitFeedbackFromCause(
	cause: unknown,
	fallbackCode: PositionSubmitFeedbackCode,
): PositionSubmitFeedback {
	if (cause instanceof PositionSubmitFeedbackCause) return cause.feedback;
	if (cause instanceof OrderSubmissionFeedbackCause) return cause.feedback;
	const orderSubmissionFeedback = getOrderSubmissionFeedback(cause);
	if (orderSubmissionFeedback) return orderSubmissionFeedback;
	if (cause instanceof Error) return { kind: "raw", message: cause.message };
	return localizedPositionSubmitFeedback(fallbackCode);
}

export function formatPositionSubmitFeedback(
	feedback: PositionSubmitFeedback,
	translate: (descriptor: MessageDescriptor) => string,
): string {
	if (feedback.kind === "order-submission") return formatOrderSubmissionFeedback(feedback, translate);
	switch (feedback.kind) {
		case "localized":
			return translate(messages[feedback.code]);
		case "partial-close-all":
			return translate({
				...partialCloseAllMessage,
				values: { acceptedCount: feedback.acceptedCount, totalCount: feedback.totalCount },
			});
		case "raw":
			return feedback.message;
	}
}

export function localizePositionSubmitFeedbackCause(
	cause: unknown,
	feedback: PositionSubmitFeedback,
	message: string,
): Error {
	if (cause instanceof PositionSubmitFeedbackCause) {
		cause.message = message;
		return cause;
	}
	if (cause instanceof OrderSubmissionFeedbackCause) {
		cause.message = message;
		return cause;
	}
	if (getOrderSubmissionFeedback(cause)) {
		return new PositionSubmitFeedbackCause(feedback, message);
	}
	if (cause instanceof Error) return cause;
	return new PositionSubmitFeedbackCause(feedback, message);
}

export function formatTrackedPositionSubmitError(
	error: Error | null | undefined,
	translate: (descriptor: MessageDescriptor) => string,
): string | null {
	if (!error) return null;
	if (error instanceof PositionSubmitFeedbackCause) return formatPositionSubmitFeedback(error.feedback, translate);
	return formatOrderSubmissionCause(error, translate);
}

export function getPositionMarketClosePlanFeedback(error: string | undefined): PositionSubmitFeedback {
	switch (error) {
		case "Close percentage must be a decimal number":
			return localizedPositionSubmitFeedback("close-percent-decimal");
		case "Close percentage must be between 0 and 100":
			return localizedPositionSubmitFeedback("close-percent-range");
		case "Close size exceeds current position":
			return localizedPositionSubmitFeedback("close-size-exceeds-position");
		case "Close size is below market precision":
			return localizedPositionSubmitFeedback("close-size-below-precision");
		case "Close size must be a decimal number":
			return localizedPositionSubmitFeedback("close-size-decimal");
		case "Close size must be greater than zero":
			return localizedPositionSubmitFeedback("close-size-positive");
		case "Position size is below market precision":
			return localizedPositionSubmitFeedback("position-size-below-precision");
		case "Position size must be a non-zero number":
			return localizedPositionSubmitFeedback("position-size-nonzero");
		case "Size precision must be a non-negative integer":
			return localizedPositionSubmitFeedback("size-precision-nonnegative");
		case undefined:
			return localizedPositionSubmitFeedback("failed-market-close");
		default:
			return { kind: "raw", message: error };
	}
}

function getDefaultPositionSubmitFeedbackMessage(feedback: PositionSubmitFeedback): string {
	if (feedback.kind === "order-submission") return getDefaultOrderSubmissionFeedbackMessage(feedback);
	if (feedback.kind === "raw") return feedback.message;
	if (feedback.kind === "partial-close-all") {
		return `${feedback.acceptedCount} of ${feedback.totalCount} close orders were accepted. Review positions before retrying.`;
	}
	switch (feedback.code) {
		case "accept-hip3-market":
			return "Accept the HIP-3 deployer disclaimer before trading this market.";
		case "accept-hip3-markets":
			return "Accept the HIP-3 deployer disclaimer before trading these markets.";
		case "active-twap":
			return "A TWAP is active for one of these markets.";
		case "blocked-market":
			return "Another order for this market is still being confirmed.";
		case "blocked-markets":
			return "Another order for one of these markets is still being confirmed.";
		case "close-all-preview-expired":
			return "This close-all preview expired. Close and reopen it to review current values.";
		case "close-orders-rejected":
			return "Close orders rejected";
		case "close-percent-decimal":
			return "Close percentage must be a decimal number";
		case "close-percent-range":
			return "Close percentage must be between 0 and 100";
		case "close-size-below-precision":
			return "Close size is below market precision";
		case "close-size-decimal":
			return "Close size must be a decimal number";
		case "close-size-exceeds-position":
			return "Close size exceeds current position";
		case "close-size-positive":
			return "Close size must be greater than zero";
		case "coordination-unavailable":
			return "Safe order coordination across tabs is unavailable in this browser.";
		case "enter-limit-price":
			return "Enter limit price";
		case "failed-build-close-order":
			return "Failed to build a close order";
		case "failed-limit-close":
			return "Failed to place limit close order";
		case "failed-load-positions":
			return "Failed to load positions.";
		case "failed-market-close":
			return "Failed to close position";
		case "failed-reverse":
			return "Failed to reverse position";
		case "failed-submit-close-orders":
			return "Failed to submit close orders";
		case "failed-update-isolated-margin":
			return "Failed to update isolated margin";
		case "isolated-margin-ambiguous":
			return "The margin update may have been applied. Refresh position data before trying again.";
		case "isolated-margin-blocked":
			return "Another action for this market is already in progress.";
		case "isolated-margin-coordination-unavailable":
			return "Safe action coordination across tabs is unavailable in this browser.";
		case "isolated-margin-market-changed":
			return "The selected market changed. Reopen the margin dialog before adjusting margin.";
		case "isolated-margin-position-unavailable":
			return "Live position data is unavailable. Wait for the account connection to recover before adjusting margin.";
		case "isolated-margin-removal-disallowed":
			return "This strict isolated market does not allow margin to be removed from an open position.";
		case "isolated-margin-side-changed":
			return "This position changed sides. Reopen the margin dialog before adjusting margin.";
		case "isolated-margin-target-not-below-current":
			return "Target leverage must be below the current effective leverage to add margin.";
		case "isolated-margin-target-positive":
			return "Enter a positive target leverage.";
		case "isolated-position-closed":
			return "This isolated position is no longer open.";
		case "isolated-position-not-isolated":
			return "This position is no longer using isolated margin.";
		case "no-active-positions":
			return "No active positions.";
		case "position-size-below-precision":
			return "Position size is below market precision";
		case "position-size-nonzero":
			return "Position size must be a non-zero number";
		case "positions-changed":
			return "Positions changed while this confirmation was open. Close and reopen it before submitting.";
		case "reconciling-close-orders":
			return "Close orders submitted. Confirming exchange status; do not retry.";
		case "reconciling-order":
			return "Order submitted. Confirming exchange status; do not retry.";
		case "size-precision-nonnegative":
			return "Size precision must be a non-negative integer";
		case "trading-data-changed":
			return "Trading data changed while this dialog was open. Close and reopen it before submitting.";
	}
}
