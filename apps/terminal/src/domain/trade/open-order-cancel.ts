import { getOutcomeAssetIdFromCoin } from "@sairn/hl-react";
import { isApiOrderResponseError } from "@/domain/trade/order-tracking";
import type { ExchangeErrorEntry } from "@/lib/errors/exchange-error-text";

export interface OpenOrderCancelTarget {
	coin: string;
	oid: number;
}

export interface OpenOrderCancelAction {
	a: number;
	o: number;
}

export type GetMarketAssetId = (coin: string) => number | undefined;

export function resolveOpenOrderCancelAssetId(coin: string, getMarketAssetId: GetMarketAssetId): number | undefined {
	if (coin.startsWith("#")) return getOutcomeAssetIdFromCoin(coin);
	const assetId = getMarketAssetId(coin);
	return typeof assetId === "number" && Number.isSafeInteger(assetId) && assetId >= 0 ? assetId : undefined;
}

export function buildOpenOrderCancelActions(
	orders: readonly OpenOrderCancelTarget[],
	getMarketAssetId: GetMarketAssetId,
): OpenOrderCancelAction[] | null {
	const actions: OpenOrderCancelAction[] = [];
	for (const order of orders) {
		if (!Number.isSafeInteger(order.oid) || order.oid < 0) return null;
		const assetId = resolveOpenOrderCancelAssetId(order.coin, getMarketAssetId);
		if (assetId === undefined) return null;
		actions.push({ a: assetId, o: order.oid });
	}
	return actions;
}

export function isConfirmedOpenOrderCancelResponse(response: unknown, expectedCount: number): boolean {
	if (!Number.isSafeInteger(expectedCount) || expectedCount <= 0 || !isRecord(response) || response.status !== "ok") {
		return false;
	}
	if (!isRecord(response.response) || response.response.type !== "cancel" || !isRecord(response.response.data)) {
		return false;
	}
	const statuses = response.response.data.statuses;
	return (
		Array.isArray(statuses) && statuses.length === expectedCount && statuses.every((status) => status === "success")
	);
}

/**
 * The SDK returns any response that is not one of its three error shapes, so a TWAP termination is
 * accepted only when the exchange answered exactly `{ status: "ok", response: { type: "twapCancel",
 * data: { status: "success" } } }`; any other shape leaves its outcome unknown.
 */
export function isConfirmedTwapCancelResponse(response: unknown): boolean {
	const body = isRecord(response) && response.status === "ok" ? response.response : undefined;
	return isRecord(body) && body.type === "twapCancel" && isRecord(body.data) && body.data.status === "success";
}

export interface OpenOrderCancelResolution {
	status: "accepted" | "partial" | "rejected";
	totalCount: number;
	acceptedIndexes: number[];
	errors: ExchangeErrorEntry[];
}

/**
 * Reads a cancel response item by item, as the official terminal counts `success` statuses: a batch
 * whose statuses are all `success` is accepted, a mix of `success` and `{ error }` is partial and a
 * batch without any success (or a top-level `err`) is rejected. The SDK throws an `ApiRequestError`
 * whenever one status is an error, so callers pass its `response` here. Returns null when the
 * statuses cannot be matched to the submitted cancels, which callers treat as unconfirmed.
 */
export function resolveOpenOrderCancelResponse(
	response: unknown,
	expectedCount: number,
): OpenOrderCancelResolution | null {
	if (!Number.isSafeInteger(expectedCount) || expectedCount <= 0 || !isRecord(response)) return null;
	if (response.status === "err") {
		return typeof response.response === "string"
			? { status: "rejected", totalCount: expectedCount, acceptedIndexes: [], errors: [{ text: response.response }] }
			: null;
	}
	if (response.status !== "ok" || !isRecord(response.response) || response.response.type !== "cancel") return null;
	if (!isRecord(response.response.data) || !Array.isArray(response.response.data.statuses)) return null;

	const statuses: unknown[] = response.response.data.statuses;
	if (statuses.length === 1 && expectedCount > 1) {
		const error = getCancelStatusError(statuses[0]);
		return error
			? { status: "rejected", totalCount: expectedCount, acceptedIndexes: [], errors: [{ text: error }] }
			: null;
	}
	if (statuses.length !== expectedCount) return null;

	const acceptedIndexes: number[] = [];
	const errors: ExchangeErrorEntry[] = [];
	for (const [index, status] of statuses.entries()) {
		if (status === "success") {
			acceptedIndexes.push(index);
			continue;
		}
		const error = getCancelStatusError(status);
		if (!error) return null;
		errors.push({ index, text: error });
	}
	let status: OpenOrderCancelResolution["status"] = "partial";
	if (errors.length === 0) status = "accepted";
	else if (acceptedIndexes.length === 0) status = "rejected";
	return { status, totalCount: expectedCount, acceptedIndexes, errors };
}

/** The partial resolution of a cancel batch the SDK rejected because some of its statuses are errors. */
export function getPartialOpenOrderCancel(cause: unknown, expectedCount: number): OpenOrderCancelResolution | null {
	if (!isApiOrderResponseError(cause)) return null;
	const resolution = resolveOpenOrderCancelResponse(cause.response, expectedCount);
	return resolution?.status === "partial" ? resolution : null;
}

function getCancelStatusError(status: unknown): string | null {
	return isRecord(status) && typeof status.error === "string" && status.error.length > 0 ? status.error : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
