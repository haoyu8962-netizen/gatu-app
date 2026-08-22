import type { InfoClient } from "@nktkas/hyperliquid";
import Big from "big.js";
import type { ExchangeParams } from "@/lib/hyperliquid";

export const ORDER_RECONCILIATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS = 2 * 60 * 1000;
export const ORDER_RECONCILIATION_POLL_LIMIT = 3;

export type TrackedOrderParams = ExchangeParams<"order">;
type OrderStatusResponse = Awaited<ReturnType<InfoClient["orderStatus"]>>;
export type OrderProcessingStatus = Extract<OrderStatusResponse, { status: "order" }>["order"]["status"];

const ACCEPTED_ORDER_STATUSES: ReadonlySet<OrderProcessingStatus> = new Set(["open", "filled", "triggered"]);
const CANCELED_ORDER_STATUSES: ReadonlySet<OrderProcessingStatus> = new Set([
	"canceled",
	"marginCanceled",
	"vaultWithdrawalCanceled",
	"openInterestCapCanceled",
	"selfTradeCanceled",
	"reduceOnlyCanceled",
	"siblingFilledCanceled",
	"delistedCanceled",
	"liquidatedCanceled",
	"scheduledCancel",
	"outcomeSettledCanceled",
	"internalCancel",
]);

export interface TrackedOrderChild {
	assetId: number;
	cloid: `0x${string}`;
}

export interface TrackedOrderRequest {
	params: TrackedOrderParams;
	children: TrackedOrderChild[];
	intentKey: string;
}

interface OrderBatchResolutionData {
	totalCount: number;
	acceptedCount: number;
	rejectedCount: number;
	errors: string[];
}

export type OrderBatchResolution =
	| (OrderBatchResolutionData & { status: "accepted" })
	| (OrderBatchResolutionData & { status: "partial" })
	| (OrderBatchResolutionData & { status: "rejected" });

type RejectedOrderBatchResolution = Extract<OrderBatchResolution, { status: "partial" | "rejected" }>;

export class OrderBatchResolutionError extends Error {
	readonly resolution: RejectedOrderBatchResolution;

	constructor(resolution: RejectedOrderBatchResolution) {
		super(getOrderBatchResolutionMessage(resolution));
		this.name = "OrderBatchResolutionError";
		this.resolution = resolution;
	}
}

export function createClientOrderId(): `0x${string}` {
	if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
		throw new Error("Secure random number generation is unavailable");
	}

	const bytes = crypto.getRandomValues(new Uint8Array(16));
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
	return `0x${hex}`;
}

export function trackOrderRequest(params: TrackedOrderParams): TrackedOrderRequest {
	const intentKey = getOrderIntentKey(params);
	const children = params.orders.map((order) => ({
		assetId: normalizeAssetId(order.a),
		cloid: normalizeClientOrderId(order.c),
	}));
	if (new Set(children.map((child) => child.cloid.toLowerCase())).size !== children.length) {
		throw new Error("Duplicate client order ID");
	}

	return {
		intentKey,
		children,
		params: {
			...params,
			orders: params.orders.map((order, index) => ({ ...order, c: children[index]?.cloid })),
		},
	};
}

function normalizeAssetId(assetId: string | number): number {
	const normalized = Number(assetId);
	if (!Number.isSafeInteger(normalized) || normalized < 0) throw new Error("Invalid order asset ID");
	return normalized;
}

function normalizeClientOrderId(cloid: string | undefined): `0x${string}` {
	if (cloid === undefined) return createClientOrderId();
	if (!/^0x[a-fA-F0-9]{32}$/.test(cloid)) throw new Error("Invalid client order ID");
	return cloid as `0x${string}`;
}

export function getOrderIntentKey(params: TrackedOrderParams): string {
	const serialized = stableSerialize({
		grouping: params.grouping,
		orders: params.orders.map(({ c: _cloid, ...order }) => order),
	});
	return `${hashString(serialized)}:${serialized.length}`;
}

export function isAcceptedOrderStatus(status: OrderProcessingStatus): boolean {
	return ACCEPTED_ORDER_STATUSES.has(status);
}

export function isCanceledOrderStatus(status: OrderProcessingStatus): boolean {
	return CANCELED_ORDER_STATUSES.has(status);
}

export function isAmbiguousExchangeRequestError(error: unknown): boolean {
	if (!isHttpRequestErrorLike(error)) return false;
	const status = getHttpStatus(error.response);
	if (status === undefined) return true;
	return status < 400 || status === 408 || status >= 500;
}

/** @deprecated Prefer the transport-agnostic exchange request name. */
export const isAmbiguousOrderRequestError = isAmbiguousExchangeRequestError;

export function isApiOrderResponseError(error: unknown): error is { response: unknown } {
	return isRecord(error) && error.name === "ApiRequestError" && "response" in error;
}

export function resolveOrderBatchResponse(response: unknown, expectedCount: number): OrderBatchResolution | null {
	if (!Number.isSafeInteger(expectedCount) || expectedCount <= 0) return null;
	if (isRecord(response) && response.status === "err" && typeof response.response === "string") {
		return {
			status: "rejected",
			totalCount: expectedCount,
			acceptedCount: 0,
			rejectedCount: expectedCount,
			errors: [response.response],
		};
	}

	const statuses = getOrderStatuses(response);
	if (!statuses) return null;
	if (statuses.length === 1 && expectedCount > 1) {
		const error = getOrderStatusError(statuses[0]);
		if (!error) return null;
		return {
			status: "rejected",
			totalCount: expectedCount,
			acceptedCount: 0,
			rejectedCount: expectedCount,
			errors: [error],
		};
	}
	if (statuses.length !== expectedCount) return null;

	const errors: string[] = [];
	let acceptedCount = 0;
	for (let index = 0; index < statuses.length; index += 1) {
		const status = statuses[index];
		const error = getOrderStatusError(status);
		if (error) {
			errors.push(`Order ${index + 1}: ${error}`);
			continue;
		}
		if (!isAcceptedOrderResponseStatus(status)) return null;
		acceptedCount += 1;
	}
	const rejectedCount = errors.length;
	let status: OrderBatchResolution["status"] = "accepted";
	if (rejectedCount === expectedCount) status = "rejected";
	else if (rejectedCount > 0) status = "partial";

	return { status, totalCount: expectedCount, acceptedCount, rejectedCount, errors };
}

/**
 * Resolves a filled-confirmation batch only when every child has a terminal
 * exchange response. A filled child is accepted only when `totalSz` exactly
 * matches the submitted size.
 */
export function resolveFilledOrderBatchResponse(
	response: unknown,
	expectedSizes: readonly string[],
): OrderBatchResolution | null {
	if (expectedSizes.length === 0) return null;
	const genericResolution = resolveOrderBatchResponse(response, expectedSizes.length);
	if (genericResolution?.status === "rejected" && genericResolution.acceptedCount === 0) {
		return genericResolution;
	}

	const statuses = getOrderStatuses(response);
	if (!statuses || statuses.length !== expectedSizes.length) return null;

	const errors: string[] = [];
	let acceptedCount = 0;
	for (let index = 0; index < statuses.length; index += 1) {
		const status = statuses[index];
		const exchangeError = getOrderStatusError(status);
		if (exchangeError) {
			errors.push(`Order ${index + 1}: ${exchangeError}`);
			continue;
		}

		const filledSize = getOrderStatusFilledSize(status);
		if (filledSize === null) return null;
		const expectedSize = parsePositiveDecimal(expectedSizes[index]);
		const actualSize = parsePositiveDecimal(filledSize);
		if (!expectedSize || !actualSize || !actualSize.eq(expectedSize)) {
			errors.push(`Order ${index + 1}: filled ${filledSize} of ${expectedSizes[index] ?? "unknown"}.`);
			continue;
		}
		acceptedCount += 1;
	}

	const rejectedCount = expectedSizes.length - acceptedCount;
	const status: OrderBatchResolution["status"] =
		rejectedCount === 0 ? "accepted" : acceptedCount === 0 ? "rejected" : "partial";
	return { status, totalCount: expectedSizes.length, acceptedCount, rejectedCount, errors };
}

export function isOrderBatchResolutionError(error: unknown): error is OrderBatchResolutionError {
	return error instanceof OrderBatchResolutionError;
}

export function getReconciliationDelayMs(attempts: number): number {
	return Math.min(30_000, 2_000 * 2 ** Math.min(attempts, 4));
}

function stableSerialize(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, entryValue]) => entryValue !== undefined)
			.sort(([left], [right]) => left.localeCompare(right));
		return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`).join(",")}}`;
	}
	return JSON.stringify(value);
}

function getOrderStatuses(response: unknown): unknown[] | null {
	if (
		!isRecord(response) ||
		response.status !== "ok" ||
		!isRecord(response.response) ||
		response.response.type !== "order" ||
		!isRecord(response.response.data)
	) {
		return null;
	}
	return Array.isArray(response.response.data.statuses) ? response.response.data.statuses : null;
}

function getOrderStatusError(status: unknown): string | null {
	if (!isRecord(status) || typeof status.error !== "string") return null;
	return status.error;
}

function isAcceptedOrderResponseStatus(status: unknown): boolean {
	if (status === "waitingForFill" || status === "waitingForTrigger") return true;
	if (!isRecord(status)) return false;
	if (isRecord(status.resting)) return isValidOrderId(status.resting.oid) && isValidOptionalCloid(status.resting.cloid);
	if (!isRecord(status.filled)) return false;
	return (
		isValidOrderId(status.filled.oid) &&
		isValidOptionalCloid(status.filled.cloid) &&
		parsePositiveDecimalValue(status.filled.totalSz) !== null &&
		parsePositiveDecimalValue(status.filled.avgPx) !== null
	);
}

function isValidOrderId(value: unknown): boolean {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isValidOptionalCloid(value: unknown): boolean {
	return value === undefined || (typeof value === "string" && /^0x[a-fA-F0-9]{32}$/.test(value));
}

function parsePositiveDecimalValue(value: unknown): Big | null {
	if (typeof value !== "string" && typeof value !== "number") return null;
	try {
		const parsed = Big(value);
		return parsed.gt(0) ? parsed : null;
	} catch {
		return null;
	}
}

function getOrderStatusFilledSize(status: unknown): string | null {
	if (!isRecord(status) || !isRecord(status.filled)) return null;
	const totalSize = status.filled.totalSz;
	return typeof totalSize === "string" || typeof totalSize === "number" ? String(totalSize) : null;
}

function parsePositiveDecimal(value: string | undefined): Big | null {
	return value === undefined ? null : parsePositiveDecimalValue(value);
}

function getOrderBatchResolutionMessage(resolution: RejectedOrderBatchResolution): string {
	const details = resolution.errors.join("; ");
	if (resolution.status === "partial") {
		const summary = `${resolution.acceptedCount} of ${resolution.totalCount} orders were accepted. Review open orders before retrying.`;
		return details ? `${summary} ${details}` : summary;
	}
	return details || "The exchange did not accept the order.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isHttpRequestErrorLike(error: unknown): error is { response?: unknown } {
	return isRecord(error) && error.name === "HttpRequestError";
}

function getHttpStatus(response: unknown): number | undefined {
	if (!isRecord(response) || typeof response.status !== "number") return undefined;
	return response.status;
}

function hashString(value: string): string {
	let first = 0x811c9dc5;
	let second = 0x9e3779b9;
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		first = Math.imul(first ^ code, 0x01000193);
		second = Math.imul(second ^ code, 0x85ebca6b);
	}
	return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}
