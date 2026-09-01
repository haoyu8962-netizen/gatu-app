import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type OrderSubmissionFeedbackCode =
	| "blocked-order"
	| "blocked-twap"
	| "coordination-unavailable"
	| "market-context-mismatch"
	| "no-active-account"
	| "order-failed"
	| "twap-cancel-failed"
	| "twap-cancel-identity-changed"
	| "twap-cancel-market-unavailable"
	| "twap-cancel-unconfirmed"
	| "twap-state-unavailable";

export interface OrderSubmissionFeedback {
	kind: "order-submission";
	code: OrderSubmissionFeedbackCode;
}

const messages: Record<OrderSubmissionFeedbackCode, MessageDescriptor> = {
	"blocked-order": msg`Another order for this market is still being confirmed.`,
	"blocked-twap": msg`Another TWAP order for this market is still being confirmed.`,
	"coordination-unavailable": msg`Safe order coordination across tabs is unavailable in this browser.`,
	"market-context-mismatch": msg`Order market context does not match the submitted asset.`,
	"no-active-account": msg`No active Hyperliquid account`,
	"order-failed": msg`Order failed`,
	"twap-cancel-failed": msg`Failed to cancel TWAP order.`,
	"twap-cancel-identity-changed": msg`The trading account or network changed. Review active TWAP orders before retrying.`,
	"twap-cancel-market-unavailable": msg`Unable to identify this TWAP market. Refresh market data before retrying.`,
	"twap-cancel-unconfirmed": msg`TWAP cancellation was submitted, but its status could not be confirmed. Check the active TWAP list before retrying.`,
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
	return cause instanceof OrderSubmissionFeedbackCause ? cause.feedback : null;
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
	return cause instanceof OrderSubmissionFeedbackCause
		? formatOrderSubmissionFeedback(cause.feedback, translate)
		: cause.message;
}

export function getDefaultOrderSubmissionFeedbackMessage(feedback: OrderSubmissionFeedback): string {
	switch (feedback.code) {
		case "blocked-order":
			return "Another order for this market is still being confirmed.";
		case "blocked-twap":
			return "Another TWAP order for this market is still being confirmed.";
		case "coordination-unavailable":
			return "Safe order coordination across tabs is unavailable in this browser.";
		case "market-context-mismatch":
			return "Order market context does not match the submitted asset.";
		case "no-active-account":
			return "No active Hyperliquid account";
		case "order-failed":
			return "Order failed";
		case "twap-cancel-failed":
			return "Failed to cancel TWAP order.";
		case "twap-cancel-identity-changed":
			return "The trading account or network changed. Review active TWAP orders before retrying.";
		case "twap-cancel-market-unavailable":
			return "Unable to identify this TWAP market. Refresh market data before retrying.";
		case "twap-cancel-unconfirmed":
			return "TWAP cancellation was submitted, but its status could not be confirmed. Check the active TWAP list before retrying.";
		case "twap-state-unavailable":
			return "TWAP order state is still loading. Please retry in a moment.";
	}
}
