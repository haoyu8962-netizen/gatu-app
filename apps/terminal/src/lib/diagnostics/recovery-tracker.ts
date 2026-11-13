import type { WsRecoveryEvent } from "@sairn/hl-react/store";
import type { DiagnosticsRecovery } from "./diagnostics-buffer";

export const RECOVERY_DIAGNOSTICS_TIMEOUT_MS = 60_000;

export interface TrackedSubscription {
	status: string;
	isStale?: boolean;
	monotonicLastMessageAt?: number;
}

export type TrackedSubscriptions = Record<string, TrackedSubscription | undefined>;

interface PendingRecovery {
	event: WsRecoveryEvent;
	startedAt: number;
	keys: string[];
}

export interface RecoveryTracker {
	/** Reads new recovery events and settles pending ones; call on every store change. */
	update(): void;
	/** Reads new events first, then lists settled recoveries and the ones still pending; holds no subscription keys. */
	summaries(): DiagnosticsRecovery[];
}

interface Options {
	readEvents: () => readonly WsRecoveryEvent[];
	readSubscriptions: () => TrackedSubscriptions;
	monotonicNow: () => number;
	wallNow: () => number;
	maxSummaries: number;
	onSettled: () => void;
}

function hasFreshFrame(entry: TrackedSubscription | undefined, startedAt: number): boolean {
	if (!entry) return false;
	return (
		entry.status === "active" &&
		entry.isStale !== true &&
		entry.monotonicLastMessageAt !== undefined &&
		entry.monotonicLastMessageAt > startedAt
	);
}

export function createRecoveryTracker({
	readEvents,
	readSubscriptions,
	monotonicNow,
	wallNow,
	maxSummaries,
	onSettled,
}: Options): RecoveryTracker {
	const initialEvents = readEvents();
	let lastSeen: WsRecoveryEvent | undefined = initialEvents[initialEvents.length - 1];
	let pending: PendingRecovery[] = [];
	let settled: DiagnosticsRecovery[] = [];

	function summarize(item: PendingRecovery, result: DiagnosticsRecovery["result"], now: number): DiagnosticsRecovery {
		return {
			at: Math.max(0, Math.round(item.startedAt)),
			cause: item.event.cause,
			action: item.event.action,
			streams: item.keys.length,
			visibility: item.event.visibility,
			network: item.event.network,
			durationMs: Math.max(0, Math.round(now - item.startedAt)),
			result,
		};
	}

	function readNewEvents(): WsRecoveryEvent[] {
		const events = readEvents();
		const latest = events[events.length - 1];
		if (latest === undefined || latest === lastSeen) return [];
		const previous = lastSeen;
		lastSeen = latest;
		if (previous === undefined) return [...events];
		const index = events.lastIndexOf(previous);
		if (index >= 0) return events.slice(index + 1);
		return events.filter((event) => event.timestamp >= previous.timestamp);
	}

	function update(): void {
		const subscriptions = readSubscriptions();
		const now = monotonicNow();
		for (const event of readNewEvents()) {
			const startedAt = now - Math.max(0, wallNow() - event.timestamp);
			const keys = event.streams.length > 0 ? event.streams.map((stream) => stream.key) : Object.keys(subscriptions);
			pending.push({ event, startedAt, keys });
		}
		if (pending.length === 0) return;
		const stillPending: PendingRecovery[] = [];
		let changed = false;
		for (const item of pending) {
			const remaining = item.keys.filter((key) => subscriptions[key] !== undefined);
			if (remaining.length === 0) {
				settled.push(summarize(item, "dropped", now));
				changed = true;
			} else if (remaining.every((key) => hasFreshFrame(subscriptions[key], item.startedAt))) {
				settled.push(summarize(item, "recovered", now));
				changed = true;
			} else if (now - item.startedAt >= RECOVERY_DIAGNOSTICS_TIMEOUT_MS) {
				settled.push(summarize(item, "timeout", now));
				changed = true;
			} else {
				stillPending.push(item);
			}
		}
		pending = stillPending;
		if (!changed) return;
		settled = settled.slice(-maxSummaries);
		onSettled();
	}

	function summaries(): DiagnosticsRecovery[] {
		update();
		const now = monotonicNow();
		return [...settled, ...pending.map((item) => summarize(item, "pending", now))].slice(-maxSummaries);
	}

	return { update, summaries };
}
