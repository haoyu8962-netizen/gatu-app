// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let createHyperliquidStore: typeof import("@hypeterminal/hl-react/store").createHyperliquidStore;
let getStoreInternals: typeof import("@hypeterminal/hl-react/store").getStoreInternals;
let createHealthReport: typeof import("@hypeterminal/hl-react/internal/websocket/health").createHealthReport;
let maxTrackedKeys: number;

describe("websocket health report", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.resetModules();
		const storeMod = await import("@hypeterminal/hl-react/store");
		createHyperliquidStore = storeMod.createHyperliquidStore;
		getStoreInternals = storeMod.getStoreInternals;
		const healthMod = await import("@hypeterminal/hl-react/internal/websocket/health");
		createHealthReport = healthMod.createHealthReport;
		const reliabilityMod = await import("@hypeterminal/hl-react/internal/websocket/reliability");
		maxTrackedKeys = reliabilityMod.WS_RELIABILITY_LIMITS.subscriptions.maxTrackedKeys;
	});

	afterEach(() => {
		vi.useRealTimers();
		delete (performance as Performance & { memory?: unknown }).memory;
	});

	it("does not alert on heap growth until enough samples cover the minimum window", async () => {
		const store = createHyperliquidStore({ ssr: false });
		const memory = installChromeMemory(10 * 1024 * 1024);

		createHealthReport(store);
		await vi.advanceTimersByTimeAsync(2 * 60_000);
		memory.usedJSHeapSize = 50 * 1024 * 1024;

		const report = createHealthReport(store);

		expect(report.metrics.heapSlopeBytesPerMinute).toBeUndefined();
		expect(report.alerts.some((alert) => alert.id === "heap-growth")).toBe(false);
	});

	it("alerts on sustained heap growth using a least-squares trend", async () => {
		const store = createHyperliquidStore({ ssr: false });
		const memory = installChromeMemory(10 * 1024 * 1024);

		createHealthReport(store);
		await vi.advanceTimersByTimeAsync(60_000);
		memory.usedJSHeapSize = 20 * 1024 * 1024;
		createHealthReport(store);
		await vi.advanceTimersByTimeAsync(60_000);
		memory.usedJSHeapSize = 50 * 1024 * 1024;

		const report = createHealthReport(store);

		expect(report.status).toBe("critical");
		expect(report.metrics.heapSlopeBytesPerMinute).toBeGreaterThanOrEqual(16 * 1024 * 1024);
		expect(report.alerts.map((alert) => alert.id)).toContain("heap-growth");
	});

	it("reports tracked-key listener growth with the tracked-key threshold", () => {
		const store = createHyperliquidStore({ ssr: false });
		const warningThreshold = maxTrackedKeys * 0.8;
		const subscriptions: Record<string, { status: "active" }> = {};
		const runtime = getStoreInternals(store).subscriptionRuntime;

		for (let i = 0; i < warningThreshold; i++) {
			const key = `tracked-${i}`;
			subscriptions[key] = { status: "active" };
			runtime.set(key, { refCount: 1, reconnectAttempts: 0 });
		}

		store.setState({ subscriptions });

		const report = createHealthReport(store);
		const trackedKeyAlert = report.alerts.find((alert) => alert.message.includes("tracked-key limit"));

		expect(trackedKeyAlert).toMatchObject({
			id: "listener-growth",
			severity: "warning",
			value: warningThreshold,
			threshold: warningThreshold,
		});
	});
});

function installChromeMemory(usedJSHeapSize: number) {
	const memory = {
		usedJSHeapSize,
		totalJSHeapSize: usedJSHeapSize,
		jsHeapSizeLimit: 256 * 1024 * 1024,
	};
	Object.defineProperty(performance, "memory", { value: memory, configurable: true });
	return memory;
}
