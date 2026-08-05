import type { UserFillsResponse } from "@nktkas/hyperliquid";

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
		item.hash.length > 0
	);
}

export function getUserFillKey(fill: UserFillsResponse[number]): string {
	return `${fill.tid}:${fill.oid}:${fill.time}`;
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
