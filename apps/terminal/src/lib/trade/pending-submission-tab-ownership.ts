import type { StoreApi } from "zustand";

interface TabOwnedSubmissionState {
	submissions: readonly { id: string }[];
	activeSubmissionIds: Set<string>;
}

/**
 * Lets one tab at a time reconcile a persisted pending submission (docs/trading-notifications.md).
 * The tab that adds a submission holds the Web Lock `<lockPrefix><id>` until the submission leaves
 * its store. Every other tab keeps the submission in `activeSubmissionIds`, which reconciliation
 * skips, and queues for the lock; the browser releases the locks of a closed or crashed tab, so the
 * first waiting tab that still finds the record in storage takes it over and holds the lock in turn.
 * Without Web Locks every tab reconciles every submission, as before. Returns the function the
 * store's `add` calls before it publishes a new submission.
 */
export function shareSubmissionsBetweenTabs<S extends TabOwnedSubmissionState>(
	store: StoreApi<S>,
	lockPrefix: string,
	isStored: (id: string) => boolean,
): (id: string) => void {
	const releases = new Map<string, () => void>();

	function setBlocked(id: string, blocked: boolean): void {
		store.setState((state) => {
			const activeSubmissionIds = new Set(state.activeSubmissionIds);
			if (blocked) activeSubmissionIds.add(id);
			else activeSubmissionIds.delete(id);
			return { activeSubmissionIds } as Partial<S>;
		});
	}

	function hold(id: string, foreign: boolean): void {
		const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
		if (!locks || typeof locks.request !== "function") return;
		let released = false;
		let release: (() => void) | undefined;
		releases.set(id, () => {
			released = true;
			release?.();
		});
		if (foreign) setBlocked(id, true);
		locks
			.request(`${lockPrefix}${id}`, { mode: "exclusive" }, () => {
				if (released || !isStored(id)) return;
				if (foreign) setBlocked(id, false);
				return new Promise<void>((resolve) => {
					release = resolve;
				});
			})
			.catch(() => {
				if (foreign && !released) setBlocked(id, false);
			});
	}

	function sync({ submissions }: S): void {
		const ids = new Set(submissions.map((submission) => submission.id));
		for (const [id, release] of releases) {
			if (ids.has(id)) continue;
			releases.delete(id);
			release();
		}
		for (const id of ids) {
			if (!releases.has(id)) hold(id, true);
		}
	}

	store.subscribe(sync);
	sync(store.getState());
	return (id) => hold(id, false);
}
