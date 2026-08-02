import type { UserFillsResponse } from "@nktkas/hyperliquid";

function getUserFillKey(fill: UserFillsResponse[number]): string {
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
