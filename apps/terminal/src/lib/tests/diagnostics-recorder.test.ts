// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSubscription } from "@/lib/tests/harness/subscription";

type BufferModule = typeof import("@/lib/diagnostics/diagnostics-buffer");
type MilestonesModule = typeof import("@/lib/diagnostics/startup-milestones");
type RecorderModule = typeof import("@/lib/diagnostics/diagnostics-recorder");
type StoreModule = typeof import("@sairn/hl-react/store");

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

let buffer: BufferModule;
let milestones: MilestonesModule;
let recorder: RecorderModule;
let storeModule: StoreModule;
let stop: (() => void) | undefined;

function stubPerformanceEntries() {
	const navigation = {
		name: `https://example.test/trade/BTC?ref=${ADDRESS}`,
		type: "reload",
		transferSize: 2048,
		workerStart: 3.4,
		fetchStart: 4.2,
		requestStart: 10,
		responseStart: 52.7,
		responseEnd: 60.1,
		domInteractive: 180.5,
		domContentLoadedEventEnd: 190,
		loadEventEnd: 0,
	};
	const resources = [
		{ name: `https://example.test/assets/a.js?user=${ADDRESS}`, transferSize: 1000 },
		{ name: "https://example.test/assets/b.js", transferSize: 0 },
		{ name: "https://example.test/assets/c.css", transferSize: 300 },
	];
	vi.spyOn(performance, "getEntriesByType").mockImplementation((type: string) => {
		if (type === "navigation") return [navigation] as unknown as PerformanceEntryList;
		if (type === "resource") return resources as unknown as PerformanceEntryList;
		return [];
	});
}

describe("diagnostics recorder", () => {
	beforeEach(async () => {
		vi.resetModules();
		localStorage.clear();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
		Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
		buffer = await import("@/lib/diagnostics/diagnostics-buffer");
		milestones = await import("@/lib/diagnostics/startup-milestones");
		recorder = await import("@/lib/diagnostics/diagnostics-recorder");
		storeModule = await import("@sairn/hl-react/store");
	});

	afterEach(() => {
		stop?.();
		stop = undefined;
		vi.restoreAllMocks();
		vi.useRealTimers();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
	});

	it("records timings, fetched resource counts and gate milestones, and no URL or address", () => {
		stubPerformanceEntries();
		milestones.markStartupMilestone("entry");
		milestones.markStartupMilestone("reveal");
		stop = recorder.startDiagnosticsRecorder();
		window.dispatchEvent(new Event("pagehide"));

		const [record] = buffer.readDiagnosticsBuffer().boots;
		expect(record?.navigation).toEqual({
			type: "reload",
			transferSize: 2048,
			workerStart: 3,
			fetchStart: 4,
			requestStart: 10,
			responseStart: 53,
			responseEnd: 60,
			domInteractive: 181,
			domContentLoaded: 190,
			loadEnd: 0,
		});
		expect(record?.resources).toEqual({ total: 3, fetched: 2, fetchedBytes: 1300 });
		expect(Object.keys(record?.milestones ?? {}).sort()).toEqual(["entry", "reveal"]);
		const stored = localStorage.getItem(buffer.DIAGNOSTICS_STORAGE_KEY) ?? "";
		expect(stored).not.toContain("example.test");
		expect(stored).not.toContain(ADDRESS);
		expect(stored).not.toContain("?");
	});

	it("updates the same boot record when the page is hidden, keeping the first hidden time", () => {
		stubPerformanceEntries();
		stop = recorder.startDiagnosticsRecorder();
		Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		const first = buffer.readDiagnosticsBuffer().boots;
		milestones.markStartupMilestone("route");
		document.dispatchEvent(new Event("visibilitychange"));
		const second = buffer.readDiagnosticsBuffer().boots;

		expect(first).toHaveLength(1);
		expect(second).toHaveLength(1);
		expect(second[0]?.id).toBe(first[0]?.id);
		expect(second[0]?.hiddenAt).toBe(first[0]?.hiddenAt);
		expect(second[0]?.milestones.route).toBeTypeOf("number");
	});

	it("appends a summary of a stream recovery read from the store, without its subscription key", async () => {
		vi.useFakeTimers({ now: 0 });
		const store = storeModule.createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
		const key = JSON.stringify(["hl", "subscription", "allMids", { dex: "" }]);
		store.getState().acquireSubscription(key, createFakeSubscription().subscribe);
		await vi.advanceTimersByTimeAsync(0);
		store.getState().setSubscriptionData(key, { sequence: 1 });

		stop = recorder.startDiagnosticsRecorder();
		milestones.attachRecoveryDiagnostics(store);

		await vi.advanceTimersByTimeAsync(25_000);
		expect(storeModule.getStoreInternals(store).recoveryEvents.length).toBeGreaterThan(0);
		window.dispatchEvent(new Event("pagehide"));
		const pending = buffer.readDiagnosticsBuffer().boots[0]?.recoveries ?? [];
		expect(pending.at(-1)).toMatchObject({
			cause: "stream-stale",
			action: "resubscribe",
			streams: 1,
			result: "pending",
		});

		await vi.advanceTimersByTimeAsync(500);
		store.getState().setSubscriptionData(key, { sequence: 2 });
		window.dispatchEvent(new Event("pagehide"));
		const settled = buffer.readDiagnosticsBuffer().boots[0]?.recoveries ?? [];
		expect(settled[0]).toMatchObject({ cause: "stream-stale", result: "recovered" });
		expect(settled[0]?.durationMs).toBeGreaterThan(0);
		expect(localStorage.getItem(buffer.DIAGNOSTICS_STORAGE_KEY)).not.toContain("allMids");
		store.getState().releaseSubscription(key);
	});

	it("writes through the flush the settings dialog calls before copying", () => {
		stubPerformanceEntries();
		milestones.flushStartupDiagnostics();
		expect(buffer.readDiagnosticsBuffer().boots).toHaveLength(0);
		vi.stubGlobal("requestIdleCallback", vi.fn());
		stop = recorder.startDiagnosticsRecorder();
		expect(buffer.readDiagnosticsBuffer().boots).toHaveLength(0);
		milestones.flushStartupDiagnostics();
		expect(buffer.readDiagnosticsBuffer().boots).toHaveLength(1);
		vi.unstubAllGlobals();
	});
});
