import type { StoreApi } from "zustand";

export interface PendingSubmissionIdentity {
	env: string;
	user: string;
}

export interface PendingSubmissionSharing {
	claim: (id: string) => void;
	serve: (identity: PendingSubmissionIdentity | null) => void;
	owns: (id: string) => boolean;
	takeRemovedElsewhere: () => string[];
}

interface TabOwnedSubmissionState {
	submissions: readonly (PendingSubmissionIdentity & { id: string })[];
	activeSubmissionIds: Set<string>;
}

interface Claim {
	state: "idle" | "waiting" | "held" | "unlocked";
	own: boolean;
	blocked: boolean;
	release?: () => void;
}

function getLockManager(): LockManager | undefined {
	const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
	return locks && typeof locks.request === "function" ? locks : undefined;
}

/**
 * Lets one tab at a time reconcile a persisted pending submission (docs/trading-notifications.md).
 * The tab that adds a submission holds the Web Lock `<lockPrefix><id>` while it sends it. Any tab
 * that does not hold the lock keeps the submission in `activeSubmissionIds`, which reconciliation
 * skips, and queues for the lock only while it can serve the submission: its reconciliation host
 * reports the submission's owner and network through `serve`. A tab that gets the lock checks again
 * that the record is still stored and still its own to serve, and otherwise lets it go at once; a
 * holder whose identity stops matching releases the lock unless the submission is still being sent
 * from it. The browser releases a closed or crashed tab's locks, so a waiting tab of the same account
 * takes over. Without Web Locks every tab reconciles every submission, as before. `owns` tells an
 * asynchronous step that resumes after an `await` whether this tab still reconciles the submission,
 * so a lookup that returns after the lock moved to another tab writes nothing. `takeRemovedElsewhere`
 * hands the host each submission that left the store while another tab held it, so the host can
 * withdraw the notification it showed for it without claiming a result it never saw.
 */
export function shareSubmissionsBetweenTabs<S extends TabOwnedSubmissionState>(
	store: StoreApi<S>,
	lockPrefix: string,
	isStored: (id: string) => boolean,
): PendingSubmissionSharing {
	const claims = new Map<string, Claim>();
	const removedElsewhere = new Set<string>();
	let identity: PendingSubmissionIdentity | null = null;
	let syncing = false;

	function serves(id: string): boolean {
		const submission = store.getState().submissions.find((entry) => entry.id === id);
		return !!submission && submission.env === identity?.env && submission.user === identity.user;
	}

	function setBlocked(id: string, claim: Claim, blocked: boolean): void {
		if (claim.blocked === blocked) return;
		claim.blocked = blocked;
		store.setState((state) => {
			const activeSubmissionIds = new Set(state.activeSubmissionIds);
			if (blocked) activeSubmissionIds.add(id);
			else activeSubmissionIds.delete(id);
			return { activeSubmissionIds } as Partial<S>;
		});
	}

	function request(id: string, claim: Claim, locks: LockManager): void {
		const controller = new AbortController();
		let hold: (() => void) | undefined;
		claim.state = "waiting";
		claim.release = () => {
			controller.abort();
			hold?.();
		};
		locks
			.request(`${lockPrefix}${id}`, { mode: "exclusive", signal: controller.signal }, () => {
				if (controller.signal.aborted) return;
				const sending = claim.own && store.getState().activeSubmissionIds.has(id);
				if (!isStored(id) || (!serves(id) && !sending)) {
					claim.state = "idle";
					claim.own = false;
					if (isStored(id)) setBlocked(id, claim, true);
					return;
				}
				claim.state = "held";
				setBlocked(id, claim, false);
				return new Promise<void>((resolve) => {
					hold = resolve;
				});
			})
			.catch(() => {
				if (controller.signal.aborted || claims.get(id) !== claim) return;
				claim.state = "unlocked";
				setBlocked(id, claim, false);
			});
	}

	function sync(): void {
		if (syncing) return;
		syncing = true;
		try {
			const { submissions, activeSubmissionIds } = store.getState();
			const ids = new Set(submissions.map((submission) => submission.id));
			for (const [id, claim] of claims) {
				if (ids.has(id)) continue;
				claims.delete(id);
				if (claim.blocked) removedElsewhere.add(id);
				claim.release?.();
				setBlocked(id, claim, false);
			}
			const locks = getLockManager();
			for (const id of ids) {
				let claim = claims.get(id);
				if (!claim) {
					claim = { state: "idle", own: false, blocked: false };
					claims.set(id, claim);
				}
				if (!locks || claim.state === "unlocked") continue;
				const eligible = serves(id);
				if (claim.state === "held" && !eligible && !activeSubmissionIds.has(id)) {
					claim.release?.();
					claim.state = "idle";
					claim.own = false;
				} else if (claim.state === "waiting" && !eligible && !claim.own) {
					claim.release?.();
					claim.state = "idle";
				}
				if (claim.state !== "idle") continue;
				setBlocked(id, claim, true);
				if (eligible) request(id, claim, locks);
			}
		} finally {
			syncing = false;
		}
	}

	store.subscribe(sync);
	sync();
	return {
		claim: (id) => {
			const locks = getLockManager();
			const claim: Claim = { state: "idle", own: true, blocked: false };
			claims.set(id, claim);
			if (locks) request(id, claim, locks);
			else claim.state = "unlocked";
		},
		serve: (next) => {
			identity = next;
			sync();
		},
		takeRemovedElsewhere: () => {
			const ids = [...removedElsewhere];
			removedElsewhere.clear();
			return ids;
		},
		owns: (id) => store.getState().submissions.some((submission) => submission.id === id) && !claims.get(id)?.blocked,
	};
}
