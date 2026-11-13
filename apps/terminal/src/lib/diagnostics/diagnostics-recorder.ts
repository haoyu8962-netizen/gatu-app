import { getStoreInternals, type HyperliquidStore } from "@sairn/hl-react/store";
import { APP_BUILD_COMMIT, APP_RELEASE_ID } from "@/config/app";
import {
	DIAGNOSTICS_MAX_RECOVERIES,
	type DiagnosticsBootRecord,
	upsertDiagnosticsBootRecord,
} from "./diagnostics-buffer";
import { createRecoveryTracker, type RecoveryTracker } from "./recovery-tracker";
import {
	getRecoveryDiagnosticsStore,
	getStartupMilestones,
	registerDiagnosticsFlush,
	subscribeStartupDiagnostics,
} from "./startup-milestones";

/** Resources keep arriving after the reveal (route chunks, chart); one more write captures them. */
export const DIAGNOSTICS_SETTLE_WRITE_MS = 15_000;
const WRITE_IDLE_TIMEOUT_MS = 2000;

function toTime(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value) || value < 0) return 0;
	return Math.round(value);
}

function readNavigation(): DiagnosticsBootRecord["navigation"] {
	const [entry] = performance.getEntriesByType?.("navigation") ?? [];
	if (!entry) return null;
	const navigation = entry as PerformanceNavigationTiming;
	return {
		type: String(navigation.type ?? "").slice(0, 64),
		transferSize: toTime(navigation.transferSize),
		workerStart: toTime(navigation.workerStart),
		fetchStart: toTime(navigation.fetchStart),
		requestStart: toTime(navigation.requestStart),
		responseStart: toTime(navigation.responseStart),
		responseEnd: toTime(navigation.responseEnd),
		domInteractive: toTime(navigation.domInteractive),
		domContentLoaded: toTime(navigation.domContentLoadedEventEnd),
		loadEnd: toTime(navigation.loadEventEnd),
	};
}

function readResources(): DiagnosticsBootRecord["resources"] {
	const entries = (performance.getEntriesByType?.("resource") ?? []) as PerformanceResourceTiming[];
	let fetched = 0;
	let fetchedBytes = 0;
	for (const entry of entries) {
		const size = entry.transferSize;
		if (typeof size === "number" && size > 0) {
			fetched += 1;
			fetchedBytes += size;
		}
	}
	return { total: entries.length, fetched, fetchedBytes: toTime(fetchedBytes) };
}

export interface DiagnosticsRecorderSnapshotInput {
	startedAt: number;
	hiddenAt: number | null;
	recoveries: DiagnosticsBootRecord["recoveries"];
}

/** Times and counts only: no URLs, addresses, account data or text from the page. */
export function buildBootRecord({
	startedAt,
	hiddenAt,
	recoveries,
}: DiagnosticsRecorderSnapshotInput): DiagnosticsBootRecord {
	return {
		id: String(startedAt),
		startedAt,
		build: { commit: APP_BUILD_COMMIT.slice(0, 12), release: APP_RELEASE_ID.slice(0, 64) },
		navigation: readNavigation(),
		resources: readResources(),
		milestones: getStartupMilestones(),
		hiddenAt,
		recoveries,
	};
}

let stopRecorder: (() => void) | undefined;

export function startDiagnosticsRecorder(): () => void {
	if (stopRecorder) return stopRecorder;
	if (typeof window === "undefined" || typeof performance === "undefined") return () => {};

	const startedAt = Math.round(performance.timeOrigin || Date.now() - performance.now());
	let hiddenAt: number | null = null;
	let tracker: RecoveryTracker | undefined;
	let detachStore = () => {};
	let attachedStore: HyperliquidStore | undefined;
	let writeQueued = false;
	let stopped = false;

	function write(): void {
		writeQueued = false;
		if (stopped) return;
		upsertDiagnosticsBootRecord(buildBootRecord({ startedAt, hiddenAt, recoveries: tracker?.summaries() ?? [] }));
	}

	function scheduleWrite(): void {
		if (writeQueued) return;
		writeQueued = true;
		if (typeof window.requestIdleCallback === "function") {
			window.requestIdleCallback(write, { timeout: WRITE_IDLE_TIMEOUT_MS });
		} else {
			setTimeout(write, 0);
		}
	}

	function attachStore(): void {
		const store = getRecoveryDiagnosticsStore();
		if (!store || store === attachedStore) return;
		detachStore();
		attachedStore = store;
		try {
			const internals = getStoreInternals(store);
			const activeTracker = createRecoveryTracker({
				readEvents: () => internals.recoveryEvents,
				readSubscriptions: () => store.getState().subscriptions,
				monotonicNow: () => performance.now(),
				wallNow: () => Date.now(),
				maxSummaries: DIAGNOSTICS_MAX_RECOVERIES,
				onSettled: scheduleWrite,
			});
			tracker = activeTracker;
			detachStore = store.subscribe(() => activeTracker.update());
		} catch {
			detachStore = () => {};
		}
	}

	function handleHidden(): void {
		if (document.visibilityState !== "hidden") return;
		if (hiddenAt === null) hiddenAt = Math.round(performance.now());
		write();
	}

	function handlePageHide(): void {
		write();
	}

	const unsubscribeMilestones = subscribeStartupDiagnostics(() => {
		attachStore();
		scheduleWrite();
	});
	const settleTimer = setTimeout(scheduleWrite, DIAGNOSTICS_SETTLE_WRITE_MS);
	document.addEventListener("visibilitychange", handleHidden);
	window.addEventListener("pagehide", handlePageHide);
	registerDiagnosticsFlush(write);
	attachStore();
	scheduleWrite();

	stopRecorder = () => {
		stopped = true;
		unsubscribeMilestones();
		clearTimeout(settleTimer);
		document.removeEventListener("visibilitychange", handleHidden);
		window.removeEventListener("pagehide", handlePageHide);
		registerDiagnosticsFlush(undefined);
		detachStore();
		stopRecorder = undefined;
	};
	return stopRecorder;
}
