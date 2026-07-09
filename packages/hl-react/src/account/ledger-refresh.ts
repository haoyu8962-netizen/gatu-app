import type { UserNonFundingLedgerUpdatesWsEvent } from "@nktkas/hyperliquid";

type LedgerUpdate = UserNonFundingLedgerUpdatesWsEvent["nonFundingLedgerUpdates"][number];

function getUpdateTime(update: LedgerUpdate): number {
	return typeof update.time === "number" && Number.isFinite(update.time) ? update.time : 0;
}

export function getAccountLedgerRefreshKey(event: UserNonFundingLedgerUpdatesWsEvent | undefined): string | undefined {
	if (!event || event.isSnapshot === true) return undefined;

	const updates = event.nonFundingLedgerUpdates;
	if (!updates.length) return undefined;

	let latest = updates[0];
	for (const update of updates) {
		if (getUpdateTime(update) > getUpdateTime(latest)) {
			latest = update;
		}
	}

	const hash = typeof latest.hash === "string" && latest.hash.length > 0 ? latest.hash : "no-hash";
	return `${getUpdateTime(latest)}:${hash}:${updates.length}`;
}
