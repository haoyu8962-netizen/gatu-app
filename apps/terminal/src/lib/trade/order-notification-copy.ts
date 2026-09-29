import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import Big from "big.js";
import { isValidOrderExecutionSummary } from "@/domain/trade/order-execution-summary";
import { formatActionFailure } from "@/lib/errors/action-error";
import { type ExchangeErrorEntry, formatExchangeErrorText } from "@/lib/errors/exchange-error-text";
import { formatPrice, formatToken } from "@/lib/format";
import { formatOrderReconciliationError } from "@/lib/trade/order-reconciliation-feedback";
import { formatOrderSubmissionFeedback } from "@/lib/trade/order-submission-feedback";
import { formatPositionSubmitFeedback } from "@/lib/trade/position-submit-feedback";
import { formatSpotSwapFeedback } from "@/lib/trade/spot-swap-feedback";
import type { Translate } from "@/lib/translate";
import type { OrderQueueItem } from "@/stores/use-order-queue-store";

const GENERIC_FAILURE_CODES: ReadonlySet<string> = new Set([
	"order-failed",
	"twap-cancel-failed",
	"failed-market-close",
	"failed-submit-close-orders",
	"failed-limit-close",
	"failed-reverse",
	"failed-update-isolated-margin",
]);

export interface OrderNotificationCopy {
	label: string;
	summary: string;
	detail?: string;
	notice?: string;
	count?: string;
	error?: string;
}

export function getOrderNotificationCopy(order: OrderQueueItem, translate: Translate): OrderNotificationCopy {
	const label = getActionLabel(order, translate);
	const market = order.market || "";
	const ordinary = !order.title && (!order.operation || order.operation === "order") && order.orderType !== "twap";
	const execution = order.execution && isValidOrderExecutionSummary(order.execution) ? order.execution : undefined;
	const showExecution =
		ordinary && execution && market && order.side && (order.status === "success" || order.status === "partial");
	const error = repeatsChildErrors(order) ? undefined : getErrorCopy(order, translate);
	let summary: string;
	let detail: string | undefined;
	let notice: string | undefined;
	if (order.message) {
		summary = [order.title ? label : undefined, market, translate(order.message)].filter(Boolean).join(" · ");
	} else if (order.positionsClosed && order.status === "success") {
		summary = translate(msg`All positions closed`);
	} else if (showExecution) {
		const quantity = isolate(`${execution.filledSize} ${market}`);
		if (execution.completeness === "partial") {
			const progress = isolate(`${execution.filledSize} / ${execution.requestedSize} ${market}`);
			summary = translate(msg`Partially filled ${progress}`);
			if (order.tpPrice || order.slPrice) {
				notice = translate(
					msg`Attached TP/SL is placed only if the order fully fills, or if its remainder is canceled for insufficient margin. Review your position's TP/SL.`,
				);
			}
		} else {
			summary = order.side === "buy" ? translate(msg`Bought ${quantity}`) : translate(msg`Sold ${quantity}`);
		}
		if (order.quoteToken) {
			const price = isolate(formatExecutionPrice(execution.averagePrice, order.quoteToken));
			detail = translate(msg`Avg. ${price}`);
		}
	} else {
		summary = getStatusSummary(order, label, ordinary, translate, Boolean(error));
	}
	const count = getCountSummary(order, translate);
	return {
		label,
		summary,
		detail,
		notice,
		count,
		error: error === summary || error === count ? undefined : error,
	};
}

function getActionLabel(order: OrderQueueItem, translate: Translate): string {
	if (order.title) return translate(order.title);
	if (order.operation === "close-all") return translate(msg`Close All Positions`);
	if (order.operation === "market-close") return translate(msg`Market Close`);
	if (order.operation === "spot-swap") return translate(msg`Swap`);
	if (order.orderType === "twap") return translate(msg`TWAP`);
	return translate(msg`Order`);
}

function getStatusSummary(
	order: OrderQueueItem,
	label: string,
	ordinary: boolean,
	translate: Translate,
	hasErrorLine: boolean,
): string {
	const market = order.market || "";
	const context = ordinary ? market : [label, market].filter(Boolean).join(" · ");
	function contextual(message: MessageDescriptor): string {
		return [context, translate(message)].filter(Boolean).join(" · ");
	}
	switch (order.status) {
		case "pending":
			return contextual(msg`Submitting…`);
		case "confirming":
			return contextual(msg`Confirming — do not resubmit`);
		case "unconfirmed":
			return contextual(hasErrorLine ? msg`Unconfirmed` : msg`Unconfirmed — review before retrying`);
		case "failed":
			if (ordinary) return market ? translate(msg`${market} order failed`) : translate(msg`Order failed`);
			return contextual(msg`Failed`);
		case "canceled":
			if (ordinary) return market ? translate(msg`${market} order canceled`) : translate(msg`Order canceled`);
			return contextual(msg`Canceled`);
		case "partial":
			return contextual(order.totalCount === 1 ? msg`Partially filled` : msg`Partially completed`);
		case "success":
			if (order.outcome === "twapStarted") return contextual(msg`Created`);
			if (order.outcome === "filled") {
				if (ordinary) return market ? translate(msg`${market} order filled`) : translate(msg`Order filled`);
				return contextual(msg`Filled`);
			}
			if (order.outcome === "resting" || order.outcome === "triggerSet") {
				if (ordinary) return market ? translate(msg`${market} order submitted`) : translate(msg`Order submitted`);
				return contextual(msg`Order submitted`);
			}
			return contextual(msg`Confirmed`);
	}
}

function getCountSummary(order: OrderQueueItem, translate: Translate): string | undefined {
	if (order.status !== "partial" || order.acceptedCount === undefined || order.totalCount === undefined) return;
	const accepted = order.acceptedCount;
	const total = order.totalCount;
	if (order.execution?.completeness === "partial" && accepted === total) return;
	if (order.countMode === "filled") {
		return total === 1
			? translate(msg`Review positions`)
			: translate(msg`Fully filled ${accepted}/${total} · Review positions`);
	}
	return translate(msg`Accepted ${accepted}/${total} · Review orders`);
}

function getErrorCopy(order: OrderQueueItem, translate: Translate): string | undefined {
	const error = order.error;
	if (!error) return;
	if (order.status === "failed" && isGenericFailure(error)) return;
	if (typeof error === "string") return formatExchangeErrorText(error, translate);
	if (!("kind" in error)) return translate(error);
	if (error.kind === "exchange-error" || error.kind === "action-error") {
		return formatActionFailure(error, translate) ?? undefined;
	}
	if (error.kind === "spot-swap") return formatSpotSwapFeedback(error, translate);
	if (error.kind === "order-reconciliation") {
		if (error.code === "status-unconfirmed" && order.status === "unconfirmed") return;
		if (error.code === "twap-status-unconfirmed") return translate(msg`Review active TWAP orders before retrying`);
		return formatOrderReconciliationError(error.code, translate);
	}
	if (
		error.kind === "partial-close-all" &&
		order.countMode === "filled" &&
		order.acceptedCount === error.acceptedCount &&
		order.totalCount === error.totalCount
	)
		return;
	if (
		error.kind === "localized" &&
		order.status === "confirming" &&
		(error.code === "reconciling-order" || error.code === "reconciling-close-orders")
	)
		return;
	if (error.kind === "order-submission") return formatOrderSubmissionFeedback(error, translate);
	return formatPositionSubmitFeedback(error, translate);
}

/**
 * True when the error only repeats the exchange texts already shown on the per-market lines, as a
 * rejected Market Close or Close All reports each market's rejection on its own line.
 */
function repeatsChildErrors(order: OrderQueueItem): boolean {
	const { children, error } = order;
	if (!error || !children?.some((child) => child.error)) return false;
	let entries: readonly ExchangeErrorEntry[];
	if (typeof error === "string") entries = [{ text: error }];
	else if ("kind" in error && error.kind === "exchange-error" && !error.hint) entries = error.entries;
	else return false;
	return (
		entries.length > 0 &&
		entries.every((entry) =>
			entry.index === undefined
				? children.some((child) => child.error === entry.text)
				: children[entry.index]?.error === entry.text,
		)
	);
}

/** True when the error only says that the action failed, which the "Failed" summary already states. */
function isGenericFailure(error: NonNullable<OrderQueueItem["error"]>): boolean {
	if (typeof error === "string" || !("kind" in error)) return false;
	if (error.kind === "spot-swap") return error.code === "failed";
	if (error.kind === "order-submission" || error.kind === "localized") return GENERIC_FAILURE_CODES.has(error.code);
	return false;
}

function formatExecutionPrice(value: string, quoteToken: string): string {
	const price = Big(value).prec(8).toFixed();
	const options = { compact: false, maximumSignificantDigits: 8 };
	if (quoteToken === "USDC" || quoteToken === "USDT" || quoteToken === "USD") return formatPrice(price, options);
	return formatToken(price, { ...options, symbol: quoteToken });
}

function isolate(value: string): string {
	return `\u2068${value}\u2069`;
}
