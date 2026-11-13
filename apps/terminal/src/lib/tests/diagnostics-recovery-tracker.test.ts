import type { WsRecoveryEvent } from "@sairn/hl-react/store";
import { describe, expect, it, vi } from "vitest";
import {
	createRecoveryTracker,
	RECOVERY_DIAGNOSTICS_TIMEOUT_MS,
	type TrackedSubscriptions,
} from "@/lib/diagnostics/recovery-tracker";

const USER_KEY = JSON.stringify([
	"hl",
	"subscription",
	"webData3",
	{ user: "0x1234567890abcdef1234567890abcdef12345678" },
]);
const MIDS_KEY = JSON.stringify(["hl", "subscription", "allMids", { dex: "" }]);

function event(overrides: Partial<WsRecoveryEvent> = {}): WsRecoveryEvent {
	return {
		timestamp: 10_000,
		cause: "stream-stale",
		action: "resubscribe",
		streams: [{ key: USER_KEY, method: "webData3", lastMessageAt: 0, staleForMs: 0, thresholdMs: 0 }],
		visibility: "visible",
		network: "online",
		...overrides,
	};
}

function setup(initial: WsRecoveryEvent[] = []) {
	const events: WsRecoveryEvent[] = [...initial];
	const clock = { mono: 1000, wall: 10_000 };
	const onSettled = vi.fn();
	let subscriptions: TrackedSubscriptions = {};
	const tracker = createRecoveryTracker({
		readEvents: () => events,
		readSubscriptions: () => subscriptions,
		monotonicNow: () => clock.mono,
		wallNow: () => clock.wall,
		maxSummaries: 3,
		onSettled,
	});
	function update(next: TrackedSubscriptions) {
		subscriptions = next;
		tracker.update();
	}
	function setSubscriptions(next: TrackedSubscriptions) {
		subscriptions = next;
	}
	return { events, clock, onSettled, tracker, update, setSubscriptions };
}

describe("createRecoveryTracker", () => {
	it("ignores recoveries that happened before it started", () => {
		const { tracker, update, onSettled } = setup([event()]);
		update({ [USER_KEY]: { status: "active", monotonicLastMessageAt: 5000 } });
		expect(tracker.summaries()).toEqual([]);
		expect(onSettled).not.toHaveBeenCalled();
	});

	it("settles a recovery once every recovering stream has a fresh frame, without storing stream keys", () => {
		const { events, clock, tracker, update, onSettled } = setup();
		events.push(event());
		const stale: TrackedSubscriptions = {
			[USER_KEY]: { status: "active", isStale: true, monotonicLastMessageAt: 500 },
		};
		update(stale);
		expect(tracker.summaries()).toEqual([expect.objectContaining({ result: "pending", durationMs: 0 })]);

		clock.mono = 1800;
		update({ [USER_KEY]: { status: "subscribing", monotonicLastMessageAt: 500 } });
		expect(onSettled).not.toHaveBeenCalled();

		clock.mono = 2400;
		update({ [USER_KEY]: { status: "active", isStale: false, monotonicLastMessageAt: 2300 } });
		expect(onSettled).toHaveBeenCalledOnce();
		const summaries = tracker.summaries();
		expect(summaries).toEqual([
			{
				at: 1000,
				cause: "stream-stale",
				action: "resubscribe",
				streams: 1,
				visibility: "visible",
				network: "online",
				durationMs: 1400,
				result: "recovered",
			},
		]);
		expect(JSON.stringify(summaries)).not.toContain("0x1234");
	});

	it("lists a recovery the store has not reported a change for yet", () => {
		const { events, tracker, setSubscriptions } = setup();
		setSubscriptions({ [USER_KEY]: { status: "active", isStale: true, monotonicLastMessageAt: 500 } });
		events.push(event());
		expect(tracker.summaries()).toEqual([expect.objectContaining({ result: "pending", streams: 1 })]);
	});

	it("waits for every current stream after a network resume that names none", () => {
		const { events, clock, tracker, update } = setup();
		events.push(event({ cause: "network-resume", action: "reconnect", streams: [] }));
		const subscriptions: TrackedSubscriptions = {
			[USER_KEY]: { status: "active", monotonicLastMessageAt: 900 },
			[MIDS_KEY]: { status: "active", monotonicLastMessageAt: 900 },
		};
		update(subscriptions);
		clock.mono = 1500;
		update({ ...subscriptions, [MIDS_KEY]: { status: "active", monotonicLastMessageAt: 1400 } });
		expect(tracker.summaries()[0]).toMatchObject({ result: "pending", streams: 2 });
		clock.mono = 1700;
		update({
			[USER_KEY]: { status: "active", monotonicLastMessageAt: 1600 },
			[MIDS_KEY]: { status: "active", monotonicLastMessageAt: 1400 },
		});
		expect(tracker.summaries()[0]).toMatchObject({ result: "recovered", durationMs: 700, cause: "network-resume" });
	});

	it("dates the start from the event, not from when the tracker noticed it", () => {
		const { events, clock, tracker, update } = setup();
		clock.wall = 10_300;
		clock.mono = 1300;
		events.push(event({ timestamp: 10_000 }));
		update({ [USER_KEY]: { status: "active", monotonicLastMessageAt: 900 } });
		expect(tracker.summaries()[0]).toMatchObject({ at: 1000, result: "pending", durationMs: 300 });
	});

	it("reports a stream that went away as dropped and one that never answers as timed out", () => {
		const { events, clock, tracker, update } = setup();
		events.push(event());
		update({ [USER_KEY]: { status: "active", isStale: true, monotonicLastMessageAt: 500 } });
		clock.mono = 1200;
		update({});
		expect(tracker.summaries()[0]).toMatchObject({ result: "dropped" });

		events.push(event({ timestamp: clock.wall, streams: [{ ...event().streams[0], key: MIDS_KEY }] }));
		update({ [MIDS_KEY]: { status: "error", monotonicLastMessageAt: 500 } });
		clock.mono = 1200 + RECOVERY_DIAGNOSTICS_TIMEOUT_MS;
		update({ [MIDS_KEY]: { status: "error", monotonicLastMessageAt: 500 } });
		expect(tracker.summaries()[1]).toMatchObject({ result: "timeout", durationMs: RECOVERY_DIAGNOSTICS_TIMEOUT_MS });
	});

	it("keeps only the newest summaries and follows events after the store trims its history", () => {
		const { events, clock, tracker, update } = setup();
		for (let index = 0; index < 5; index += 1) {
			events.push(event({ timestamp: clock.wall }));
			update({});
			clock.mono += 10;
		}
		expect(tracker.summaries()).toHaveLength(3);
		events.splice(0, events.length);
		events.push(event({ timestamp: clock.wall + 1 }));
		update({ [USER_KEY]: { status: "active", isStale: true } });
		expect(tracker.summaries().at(-1)).toMatchObject({ result: "pending" });
	});
});
