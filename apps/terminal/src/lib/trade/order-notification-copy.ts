import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import Big from "big.js";
import { isValidOrderExecutionSummary } from "@/domain/trade/order-execution-summary";
import { formatPrice, formatToken } from "@/lib/format";
import { formatOrderReconciliationError } from "@/lib/trade/order-reconciliation-feedback";
import { formatOrderSubmissionFeedback } from "@/lib/trade/order-submission-feedback";
import { formatPositionSubmitFeedback } from "@/lib/trade/position-submit-feedback";
import { formatSpotSwapFeedback } from "@/lib/trade/spot-swap-feedback";
import type { OrderQueueItem } from "@/stores/use-order-queue-store";

type Translate = (descriptor: MessageDescriptor) => string;

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
					msg`Attached TP/SL is placed only after the order fully fills. Set TP/SL on the position to protect the filled size.`,
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
		summary = getStatusSummary(order, label, ordinary, translate);
	}
	const count = getCountSummary(order, translate);
	const error = getErrorCopy(order, translate);
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

function getStatusSummary(order: OrderQueueItem, label: string, ordinary: boolean, translate: Translate): string {
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
			return contextual(msg`Unconfirmed — review before retrying`);
		case "failed":
			if (ordinary) return market ? translate(msg`${market} order failed`) : translate(msg`Order failed`);
			return contextual(msg`Failed`);
		case "canceled":
			if (ordinary) return market ? translate(msg`${market} order canceled`) : translate(msg`Order canceled`);
			return contextual(msg`Canceled`);
		case "partial":
			return contextual(msg`Partially completed`);
		case "success":
			if (order.outcome === "twapStarted") return contextual(msg`Created`);
			if (order.outcome === "filled") {
				if (ordinary) return market ? translate(msg`${market} order filled`) : translate(msg`Order filled`);
				return contextual(msg`Order filled`);
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
	if (order.countMode === "filled") return translate(msg`Fully filled ${accepted}/${total} · Review positions`);
	return translate(msg`Accepted ${accepted}/${total} · Review orders`);
}

function getErrorCopy(order: OrderQueueItem, translate: Translate): string | undefined {
	const error = order.error;
	if (!error) return;
	if (typeof error === "string") return error;
	if (!("kind" in error)) return translate(error);
	if (error.kind === "raw") return error.message;
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

function formatExecutionPrice(value: string, quoteToken: string): string {
	const price = Big(value).prec(8).toFixed();
	const options = { compact: false, maximumSignificantDigits: 8 };
	if (quoteToken === "USDC" || quoteToken === "USDT" || quoteToken === "USD") return formatPrice(price, options);
	return formatToken(price, { ...options, symbol: quoteToken });
}

function isolate(value: string): string {
	return `\u2068${value}\u2069`;
}
