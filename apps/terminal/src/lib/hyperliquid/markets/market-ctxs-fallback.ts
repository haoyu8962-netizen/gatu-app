import { reportClientError } from "@/lib/error-reporting/client";

let compactChannelsDisabled = false;
let fallbackReported = false;

/**
 * Once a compact `pac`/`sac` stream fails, the plain all-market channels serve the rest of the page
 * session: the decision outlives `MarketsInfoProvider`, which remounts on document-route navigation.
 * The failure is reported once so the receiver shows how often browsers take the fallback.
 */
export function isCompactMarketCtxsDisabled(): boolean {
	return compactChannelsDisabled;
}

export function disableCompactMarketCtxs(error: unknown): void {
	compactChannelsDisabled = true;
	if (fallbackReported) return;
	fallbackReported = true;
	reportClientError(error, { kind: "market_ctxs_compact_fallback" });
}
