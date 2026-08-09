import type { UserFillsResponse, UserTwapSliceFillsResponse } from "@nktkas/hyperliquid";
import Big from "big.js";

export function isValidUserFillHistoryItem(item: unknown): item is UserFillsResponse[number] {
	if (!isRecord(item)) return false;
	return (
		typeof item.time === "number" &&
		Number.isSafeInteger(item.time) &&
		item.time >= 0 &&
		typeof item.oid === "number" &&
		Number.isSafeInteger(item.oid) &&
		item.oid >= 0 &&
		typeof item.tid === "number" &&
		Number.isSafeInteger(item.tid) &&
		item.tid >= 0 &&
		typeof item.coin === "string" &&
		item.coin.length > 0 &&
		typeof item.hash === "string" &&
		item.hash.length > 0 &&
		(item.twapId === null || (typeof item.twapId === "number" && Number.isSafeInteger(item.twapId) && item.twapId >= 0))
	);
}

export function filterNonTwapUserFills(fills: UserFillsResponse): UserFillsResponse {
	return fills.filter((fill) => fill.twapId === null);
}

export function getUserFillKey(fill: UserFillsResponse[number]): string {
	return `${fill.tid}:${fill.oid}:${fill.time}`;
}

export function isValidUserTwapSliceFillHistoryItem(item: unknown): item is UserTwapSliceFillsResponse[number] {
	if (!isRecord(item)) return false;
	return (
		typeof item.twapId === "number" &&
		Number.isSafeInteger(item.twapId) &&
		item.twapId >= 0 &&
		isValidUserFillHistoryItem(item.fill)
	);
}

export function getUserTwapSliceFillKey(entry: UserTwapSliceFillsResponse[number]): string {
	return getUserFillKey(entry.fill);
}

export function normalizeUserTwapSliceFills(entries: UserTwapSliceFillsResponse): UserFillsResponse {
	return entries.map((entry) => ({ ...entry.fill, twapId: entry.twapId }));
}

export function getUserFillNotional(fill: UserFillsResponse[number]): string | null {
	try {
		return new Big(fill.px).times(fill.sz).toString();
	} catch {
		return null;
	}
}

export function hasUserFillExplorerTransaction(fill: UserFillsResponse[number]): boolean {
	return !/^0x0{64}$/i.test(fill.hash);
}

export function mergeUserFillSources(...sources: ReadonlyArray<UserFillsResponse | undefined>): UserFillsResponse {
	const fillsById = new Map<string, UserFillsResponse[number]>();

	for (const source of sources) {
		for (const fill of source ?? []) {
			fillsById.set(getUserFillKey(fill), fill);
		}
	}

	return [...fillsById.values()].sort((a, b) => b.time - a.time);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
