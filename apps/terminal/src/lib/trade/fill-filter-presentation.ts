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
	/** No fill can fall between the snapshot and the live fills held (`fillSnapshotReachesLiveFills`). */
	reachesLive: boolean;
}

/**
 * Whether a `userFills` snapshot and the live fills the subscription still holds leave no gap: the
 * subscription keeps a bounded number of fills, TWAP fills included, so after enough new fills its oldest
 * one can be newer than anything the snapshot saw, and fills in between are in neither. Both times count
 * TWAP fills, which the lists leave out. A snapshot without fills reaches only a subscription that holds
 * none: every live fill is newer than such a snapshot, and the subscription may already have dropped some.
 */
export function fillSnapshotReachesLiveFills(
	newestSnapshotFillTime: number | null,
	oldestLiveFillTime: number | null,
): boolean {
	if (oldestLiveFillTime === null) return true;
	return newestSnapshotFillTime !== null && oldestLiveFillTime <= newestSnapshotFillTime;
}

/**
 * What the phone trade history shows when no fill matches the active filters, while the `userFills`
 * snapshot backs the filters (docs/mobile-data-presentation.md). A no-match conclusion needs a
 * snapshot whose latest request succeeded, is not being replaced and reaches the live fills, and live
 * fills that are current; otherwise the list stays quiet, and a failed request or a gap between the
 * snapshot and the live fills offers a neutral retry.
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
	if (!snapshot.reachesLive) return "retry";
	return snapshot.reachedLimit ? "noMatchWithinLimit" : "noMatch";
}
