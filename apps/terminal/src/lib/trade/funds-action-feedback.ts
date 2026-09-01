import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type FundsActionFeedbackCode =
	| "account-mode-changed"
	| "account-mode-unavailable"
	| "balance-changed"
	| "balance-unavailable"
	| "deposit-route-changed"
	| "deposit-route-unavailable"
	| "geo-restricted"
	| "geo-unavailable"
	| "withdrawal-activation-fee-changed"
	| "withdrawal-conditions-changed"
	| "withdrawal-eligibility-unavailable"
	| "withdrawal-fee-changed"
	| "withdrawal-fee-unavailable"
	| "withdrawal-route-changed"
	| "withdrawal-route-unavailable"
	| "withdrawal-sanctioned";

const messages: Record<FundsActionFeedbackCode, MessageDescriptor> = {
	"account-mode-changed": msg`Account mode changed before the request was submitted. Review balances and try again.`,
	"account-mode-unavailable": msg`Unable to verify the current account mode. Request was not submitted.`,
	"balance-changed": msg`Balance changed before submission. Review the updated balance and try again.`,
	"balance-unavailable": msg`Balance data is unavailable. Try again after the connection recovers.`,
	"deposit-route-changed": msg`The Hyperliquid deposit route changed before signing. Review the updated route and retry.`,
	"deposit-route-unavailable": msg`Unable to verify the current Hyperliquid deposit route. Deposit was not submitted.`,
	"geo-restricted": msg`Funds actions are not available in your region. This funds action was not submitted.`,
	"geo-unavailable": msg`Unable to verify regional availability. This funds action was not submitted.`,
	"withdrawal-activation-fee-changed": msg`The account activation fee changed before signing. Review the updated fee and try again.`,
	"withdrawal-conditions-changed": msg`Withdrawal conditions changed before signing. Review the withdrawal and submit it again.`,
	"withdrawal-eligibility-unavailable": msg`Unable to verify withdrawal eligibility. Request was not submitted.`,
	"withdrawal-fee-changed": msg`Circle fees changed before submission. Review the updated fee and retry.`,
	"withdrawal-fee-unavailable": msg`Unable to load the current CCTP withdrawal fee.`,
	"withdrawal-route-changed": msg`The Hyperliquid withdrawal route changed. Review the updated route and fee, then submit again.`,
	"withdrawal-route-unavailable": msg`Unable to verify the current Hyperliquid withdrawal route.`,
	"withdrawal-sanctioned": msg`Withdrawals are unavailable for this address.`,
};

export class FundsActionFeedbackCause extends Error {
	constructor(readonly code: FundsActionFeedbackCode) {
		super(getDefaultMessage(code));
		this.name = "FundsActionFeedbackCause";
	}
}

export function fundsActionFeedbackCause(code: FundsActionFeedbackCode): FundsActionFeedbackCause {
	return new FundsActionFeedbackCause(code);
}

export function formatFundsActionFeedback(
	code: FundsActionFeedbackCode,
	translate: (descriptor: MessageDescriptor) => string,
): string {
	return translate(messages[code]);
}

function getDefaultMessage(code: FundsActionFeedbackCode): string {
	switch (code) {
		case "account-mode-changed":
			return "Account mode changed before the request was submitted. Review balances and try again.";
		case "account-mode-unavailable":
			return "Unable to verify the current account mode. Request was not submitted.";
		case "balance-changed":
			return "Balance changed before submission. Review the updated balance and try again.";
		case "balance-unavailable":
			return "Balance data is unavailable. Try again after the connection recovers.";
		case "deposit-route-changed":
			return "The Hyperliquid deposit route changed before signing. Review the updated route and retry.";
		case "deposit-route-unavailable":
			return "Unable to verify the current Hyperliquid deposit route. Deposit was not submitted.";
		case "geo-restricted":
			return "Funds actions are not available in your region. This funds action was not submitted.";
		case "geo-unavailable":
			return "Unable to verify regional availability. This funds action was not submitted.";
		case "withdrawal-activation-fee-changed":
			return "The account activation fee changed before signing. Review the updated fee and try again.";
		case "withdrawal-conditions-changed":
			return "Withdrawal conditions changed before signing. Review the withdrawal and submit it again.";
		case "withdrawal-eligibility-unavailable":
			return "Unable to verify withdrawal eligibility. Request was not submitted.";
		case "withdrawal-fee-changed":
			return "Circle fees changed before submission. Review the updated fee and retry.";
		case "withdrawal-fee-unavailable":
			return "Unable to load the current CCTP withdrawal fee.";
		case "withdrawal-route-changed":
			return "The Hyperliquid withdrawal route changed. Review the updated route and fee, then submit again.";
		case "withdrawal-route-unavailable":
			return "Unable to verify the current Hyperliquid withdrawal route.";
		case "withdrawal-sanctioned":
			return "Withdrawals are unavailable for this address.";
	}
}
