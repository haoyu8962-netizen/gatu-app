/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FeedState = {
	data?: { coin: string; fast?: true; time: number };
	error?: unknown;
	isStale: boolean;
	status: "idle" | "subscribing" | "active" | "error";
};

const mocks = vi.hoisted(() => ({
	l2Enabled: [] as boolean[],
	l2State: { isStale: false, status: "subscribing" } as FeedState,
	listeners: new Set<() => void>(),
	publicEnabled: [] as boolean[],
	publicState: { isStale: false, status: "subscribing" } as FeedState,
}));

vi.mock("@/lib/hyperliquid", async () => {
	const { useSyncExternalStore } = await import("react");
	function useMockFeed(read: () => FeedState, enabled: boolean): FeedState {
		const state = useSyncExternalStore(
			(listener) => {
				mocks.listeners.add(listener);
				return () => mocks.listeners.delete(listener);
			},
			read,
			read,
		);
		return enabled ? state : { isStale: false, status: "idle" };
	}
	return {
		canUseL2Decompression: () => true,
		L2BookStreamError: class L2BookStreamError extends Error {
			code: string;

			constructor(code: string) {
				super(code);
				this.code = code;
			}
		},
		useL2BookSubscription: (_params: unknown, options: { enabled?: boolean }) => {
			const enabled = options.enabled === true;
			mocks.l2Enabled.push(enabled);
			return { ...useMockFeed(() => mocks.l2State, enabled), lastMessageAt: undefined };
		},
		useSubscription: (_method: string, _params: unknown, options: { enabled?: boolean }) => {
			const enabled = options.enabled === true;
			mocks.publicEnabled.push(enabled);
			return { ...useMockFeed(() => mocks.publicState, enabled), lastMessageAt: undefined };
		},
	};
});

vi.mock("@/lib/error-reporting/client", () => ({ reportClientError: vi.fn() }));

import {
	L2_RECOVERY_OBSERVATION_MS,
	type OrderbookFeedResult,
	useOrderbookFeed,
} from "@/hooks/trade/use-orderbook-feed";

const PARAMS = { coin: "BTC", fast: true as const };
const PUBLIC_BOOK = { coin: "BTC", fast: true as const, time: 1 };
const L2_BOOK = { coin: "BTC", time: 2 };

let latest: OrderbookFeedResult | undefined;

function Probe({ enabled = true }: { enabled?: boolean }) {
	latest = useOrderbookFeed({ compact: true, enabled, env: "Mainnet", params: PARAMS });
	return null;
}

function setFeeds(next: { l2?: FeedState; publicFeed?: FeedState }) {
	act(() => {
		if (next.l2) mocks.l2State = next.l2;
		if (next.publicFeed) mocks.publicState = next.publicFeed;
		for (const listener of [...mocks.listeners]) listener();
	});
}

function advance(ms: number) {
	act(() => {
		vi.advanceTimersByTime(ms);
	});
}

function setHidden(hidden: boolean) {
	act(() => {
		Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
	});
}

function setOnline(online: boolean) {
	act(() => {
		window.dispatchEvent(new Event(online ? "online" : "offline"));
	});
}

function l2Subscribed(): boolean {
	return mocks.l2Enabled.at(-1) === true;
}

function publicSubscribed(): boolean {
	return mocks.publicEnabled.at(-1) === true;
}

function failL2() {
	setFeeds({ l2: { error: new Error("snapshot_timeout"), isStale: false, status: "error" } });
	setFeeds({ l2: { isStale: false, status: "subscribing" } });
}

function recoverL2() {
	setFeeds({ l2: { data: L2_BOOK, isStale: false, status: "active" } });
}

function expectFallbackServing() {
	expect(latest?.source).toBe("l2Book-fast");
	expect(latest?.data).toEqual(PUBLIC_BOOK);
	expect(publicSubscribed()).toBe(true);
}

function expectWaitThenProbe(waitMs: number) {
	advance(waitMs - 1);
	expect(l2Subscribed()).toBe(false);
	expectFallbackServing();
	advance(1);
	expect(l2Subscribed()).toBe(true);
	expectFallbackServing();
}

describe("compact order book incremental feed retry", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		mocks.l2Enabled.length = 0;
		mocks.publicEnabled.length = 0;
		mocks.l2State = { data: L2_BOOK, isStale: false, status: "active" };
		mocks.publicState = { data: PUBLIC_BOOK, isStale: false, status: "active" };
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(<Probe />));
	});

	afterEach(() => {
		act(() => root.unmount());
		mocks.listeners.clear();
		container.remove();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		latest = undefined;
		vi.useRealTimers();
	});

	it("falls back to the public fast feed after the incremental feed fails", () => {
		expect(latest?.source).toBe("l2");
		expect(publicSubscribed()).toBe(false);

		failL2();

		expect(l2Subscribed()).toBe(false);
		expectFallbackServing();
	});

	it("waits sixty seconds, then probes the incremental feed while the fallback keeps serving", () => {
		failL2();

		expectWaitThenProbe(60_000);
		expect(latest?.status).toBe("active");
	});

	it("switches back once the probe delivers its first snapshot and keeps counting a failure while observing", () => {
		failL2();
		expectWaitThenProbe(60_000);
		failL2();
		expectWaitThenProbe(120_000);

		recoverL2();

		expect(latest?.source).toBe("l2");
		expect(latest?.data).toEqual(L2_BOOK);
		expect(publicSubscribed()).toBe(false);

		advance(5_000);
		failL2();
		expectWaitThenProbe(240_000);
	});

	it("doubles the next wait when the primary fails before the observation period ends", () => {
		failL2();
		expectWaitThenProbe(60_000);
		recoverL2();

		advance(L2_RECOVERY_OBSERVATION_MS - 1);
		failL2();
		expectWaitThenProbe(120_000);
	});

	it("starts the wait from sixty seconds again once the primary stayed stable for the observation period", () => {
		failL2();
		expectWaitThenProbe(60_000);
		failL2();
		expectWaitThenProbe(120_000);
		recoverL2();

		advance(L2_RECOVERY_OBSERVATION_MS);
		failL2();
		expectWaitThenProbe(60_000);
	});

	it("reaches the ten-minute cap when the primary keeps failing a few seconds after its first snapshot", () => {
		failL2();
		for (const waitMs of [60_000, 120_000, 240_000, 480_000, 600_000, 600_000]) {
			expectWaitThenProbe(waitMs);
			recoverL2();
			expect(latest?.source).toBe("l2");
			advance(5_000);
			failL2();
		}
		expectWaitThenProbe(600_000);
	});

	it("does not count the observation period while the page is hidden", () => {
		failL2();
		expectWaitThenProbe(60_000);
		recoverL2();

		advance(L2_RECOVERY_OBSERVATION_MS / 2);
		setHidden(true);
		advance(20 * 60_000);
		setHidden(false);
		advance(L2_RECOVERY_OBSERVATION_MS / 2 - 1);
		failL2();
		expectWaitThenProbe(120_000);
	});

	it("doubles the wait after each failed probe and caps it at ten minutes", () => {
		failL2();
		for (const waitMs of [60_000, 120_000, 240_000, 480_000, 600_000, 600_000]) {
			expectWaitThenProbe(waitMs);
			failL2();
		}
		expectWaitThenProbe(600_000);
	});

	it("does not count the wait or probe while the page is hidden or offline", () => {
		failL2();
		advance(30_000);

		setHidden(true);
		advance(20 * 60_000);
		expect(l2Subscribed()).toBe(false);
		setHidden(false);

		advance(10_000);
		setOnline(false);
		advance(20 * 60_000);
		expect(l2Subscribed()).toBe(false);
		setOnline(true);

		expectWaitThenProbe(20_000);

		setHidden(true);
		expect(l2Subscribed()).toBe(false);
		expect(publicSubscribed()).toBe(true);
		setHidden(false);
		expect(l2Subscribed()).toBe(true);
		expectFallbackServing();
	});

	it("does not count the wait while the book is not shown", () => {
		failL2();
		advance(30_000);
		act(() => root.render(<Probe enabled={false} />));
		advance(20 * 60_000);
		act(() => root.render(<Probe />));

		expectWaitThenProbe(30_000);
	});
});
