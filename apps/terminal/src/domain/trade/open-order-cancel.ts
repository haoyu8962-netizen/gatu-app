import { getOutcomeAssetIdFromCoin } from "@gatu/hl-react";

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
