import type { UserFundingResponse, UserFundingsWsEvent } from "@nktkas/hyperliquid";
import { MalformedHistoryPageError } from "@/lib/trade/history-pagination";

export type UserFunding = UserFundingsWsEvent["fundings"][number];

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
	return (response ?? []).map(({ delta, time }) => ({
		coin: delta.coin,
		fundingRate: delta.fundingRate,
		nSamples: delta.nSamples,
		szi: delta.szi,
		time,
		usdc: delta.usdc,
	}));
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
