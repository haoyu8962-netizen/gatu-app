import Big from "big.js";
import type { TrackedOrderParams } from "@/domain/trade/order-tracking";

export interface OrderExecutionSummary {
	evidence: "exchange-response";
	filledSize: string;
	requestedSize: string;
	averagePrice: string;
	orderIds: number[];
	completeness: "full" | "partial";
}

export function getOrderExecutionSummary(
	orders: TrackedOrderParams["orders"],
	response: unknown,
	mainOrderCount: number,
): OrderExecutionSummary | undefined {
	if (!Number.isSafeInteger(mainOrderCount) || mainOrderCount < 1 || mainOrderCount > orders.length) return;
	const envelope = asRecord(response);
	const result = asRecord(envelope?.response);
	const statuses = asRecord(result?.data)?.statuses;
	if (envelope?.status !== "ok" || result?.type !== "order" || !Array.isArray(statuses)) return;
	if (statuses.length !== orders.length) return;

	const firstOrder = orders[0];
	let requestedSize = Big(0);
	let filledSize = Big(0);
	let filledValue = Big(0);
	const orderIds: number[] = [];
	for (let index = 0; index < mainOrderCount; index += 1) {
		const order = orders[index];
		if (!order || order.a !== firstOrder?.a || order.b !== firstOrder.b) return;
		const requested = positiveDecimal(order.s);
		if (!requested) return;
		requestedSize = requestedSize.plus(requested);
		const status = asRecord(statuses[index]);
		if (!status || !("filled" in status)) continue;
		const fill = asRecord(status.filled);
		const actual = positiveDecimal(fill?.totalSz);
		const price = positiveDecimal(fill?.avgPx);
		const oid = fill?.oid;
		if (!actual || !price || actual.gt(requested) || typeof oid !== "number" || !Number.isSafeInteger(oid) || oid < 0) {
			return;
		}
		if (orderIds.includes(oid)) return;
		if (fill?.cloid !== undefined) {
			if (typeof fill.cloid !== "string" || !/^0x[a-fA-F0-9]{32}$/.test(fill.cloid)) return;
			if (order.c !== undefined && fill.cloid.toLowerCase() !== order.c.toLowerCase()) return;
		}
		orderIds.push(oid);
		filledSize = filledSize.plus(actual);
		filledValue = filledValue.plus(actual.times(price));
	}
	if (!filledSize.gt(0)) return;
	return {
		evidence: "exchange-response",
		filledSize: filledSize.toFixed(),
		requestedSize: requestedSize.toFixed(),
		averagePrice: filledValue.div(filledSize).toFixed(),
		orderIds,
		completeness: filledSize.eq(requestedSize) ? "full" : "partial",
	};
}

export function isValidOrderExecutionSummary(summary: OrderExecutionSummary): boolean {
	if (summary.evidence !== "exchange-response" || summary.orderIds.length === 0) return false;
	if (summary.orderIds.some((id) => !Number.isSafeInteger(id) || id < 0)) return false;
	if (new Set(summary.orderIds).size !== summary.orderIds.length) return false;
	const actual = positiveDecimal(summary.filledSize);
	const requested = positiveDecimal(summary.requestedSize);
	if (!actual || !requested || !positiveDecimal(summary.averagePrice) || actual.gt(requested)) return false;
	return (actual.eq(requested) ? "full" : "partial") === summary.completeness;
}

function positiveDecimal(value: unknown): Big | null {
	if (typeof value !== "string" && typeof value !== "number") return null;
	try {
		const decimal = Big(value);
		return decimal.gt(0) ? decimal : null;
	} catch {
		return null;
	}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}
