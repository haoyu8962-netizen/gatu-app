export type FilteredFillsEmptyPresentation = "loading" | "offline" | "retry" | "noMatch" | "noMatchWithinLimit";

export interface FillSnapshotState {
	/** A `userFills` snapshot has loaded for the current owner and network. */
	hasData: boolean;
	/** The latest snapshot request failed, whether or not an earlier snapshot is kept. */
	failed: boolean;
	/** A snapshot request is on its way. */
	fetching: boolean;
	offline: boolean;
	/** The snapshot returned the endpoint's 2,000-fill limit, so older fills were not searched. */
	reachedLimit: boolean;
}

/**
 * What the phone trade history shows when no fill matches the active filters, while the `userFills`
 * snapshot backs the filters (docs/mobile-data-presentation.md). A no-match conclusion needs a
 * snapshot whose latest request succeeded and is not being replaced, and live fills that are current;
 * otherwise the list stays quiet, and a failed request offers a neutral retry.
 */
export function getFilteredFillsEmptyPresentation({
	liveCurrent,
	snapshot,
}: {
	liveCurrent: boolean;
	snapshot: FillSnapshotState;
}): FilteredFillsEmptyPresentation {
	if (snapshot.offline) return "offline";
	if (snapshot.fetching) return "loading";
	if (snapshot.failed) return "retry";
	if (!snapshot.hasData || !liveCurrent) return "loading";
	return snapshot.reachedLimit ? "noMatchWithinLimit" : "noMatch";
}
