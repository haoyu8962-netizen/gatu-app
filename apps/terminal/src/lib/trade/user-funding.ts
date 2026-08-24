import type { UserFundingResponse, UserFundingsWsEvent } from "@nktkas/hyperliquid";
import { MalformedHistoryPageError } from "@/lib/trade/history-pagination";

export type UserFunding = UserFundingsWsEvent["fundings"][number];

export function normalizeUserFunding(item: unknown): UserFunding | null {
	if (!isRecord(item)) return null;
	const candidate = item.nSamples === undefined ? { ...item, nSamples: null } : item;
	return isValidUserFunding(candidate) ? candidate : null;
}

export function isValidUserFunding(item: unknown): item is UserFunding {
	if (!isRecord(item)) return false;
	return (
		typeof item.time === "number" &&
		Number.isSafeInteger(item.time) &&
		item.time >= 0 &&
		typeof item.coin === "string" &&
		item.coin.length > 0 &&
		typeof item.fundingRate === "string" &&
		(item.nSamples === null || (typeof item.nSamples === "number" && Number.isFinite(item.nSamples))) &&
		typeof item.szi === "string" &&
		typeof item.usdc === "string"
	);
}

export function getUserFundingKey(funding: UserFunding): string {
	return `${funding.time}:${funding.coin}`;
}

export function normalizeUserFundingResponse(response: UserFundingResponse | undefined): UserFunding[] {
	if (response !== undefined && !Array.isArray(response)) throw new MalformedHistoryPageError();
	return (response ?? []).map((entry) => {
		if (!isRecord(entry) || !isRecord(entry.delta)) throw new MalformedHistoryPageError();
		const funding = normalizeUserFunding({
			coin: entry.delta.coin,
			fundingRate: entry.delta.fundingRate,
			nSamples: entry.delta.nSamples,
			szi: entry.delta.szi,
			time: entry.time,
			usdc: entry.delta.usdc,
		});
		if (!funding) throw new MalformedHistoryPageError();
		return funding;
	});
}

export function mergeUserFundingSources(...sources: ReadonlyArray<readonly UserFunding[] | undefined>): UserFunding[] {
	const fundingByKey = new Map<string, UserFunding>();

	for (const source of sources) {
		for (const funding of source ?? []) {
			fundingByKey.set(getUserFundingKey(funding), funding);
		}
	}

	return [...fundingByKey.values()].sort((left, right) => right.time - left.time);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
