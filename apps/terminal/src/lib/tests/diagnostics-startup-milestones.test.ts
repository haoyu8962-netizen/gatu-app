// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recorderState = vi.hoisted(() => ({ start: vi.fn(() => () => {}) }));

vi.mock("@/lib/diagnostics/diagnostics-recorder", () => ({
	startDiagnosticsRecorder: recorderState.start,
}));

type MilestonesModule = typeof import("@/lib/diagnostics/startup-milestones");
let milestones: MilestonesModule;
let idleCallbacks: Array<() => void>;

describe("startup diagnostics scheduling", () => {
	beforeEach(async () => {
		vi.resetModules();
		vi.useFakeTimers();
		recorderState.start.mockClear();
		idleCallbacks = [];
		vi.stubGlobal(
			"requestIdleCallback",
			vi.fn((callback: () => void) => {
				idleCallbacks.push(callback);
				return idleCallbacks.length;
			}),
		);
		milestones = await import("@/lib/diagnostics/startup-milestones");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("keeps the first time of each milestone", () => {
		vi.advanceTimersByTime(120);
		milestones.markStartupMilestone("entry");
		vi.advanceTimersByTime(300);
		milestones.markStartupMilestone("entry");
		milestones.markStartupMilestone("reveal");
		const recorded = milestones.getStartupMilestones();
		expect(recorded.entry).toBeTypeOf("number");
		expect((recorded.reveal ?? 0) - (recorded.entry ?? 0)).toBe(300);
	});

	it("loads the recorder only after the reveal, and then only when the main thread is idle", async () => {
		milestones.scheduleStartupDiagnostics();
		milestones.markStartupMilestone("entry");
		milestones.markStartupMilestone("locale");
		await vi.advanceTimersByTimeAsync(1000);
		expect(idleCallbacks).toHaveLength(0);

		milestones.markStartupMilestone("reveal");
		expect(idleCallbacks).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(0);
		expect(recorderState.start).not.toHaveBeenCalled();

		idleCallbacks[0]?.();
		await vi.waitFor(() => expect(recorderState.start).toHaveBeenCalledOnce());

		milestones.markStartupMilestone("route");
		await vi.advanceTimersByTimeAsync(milestones.STARTUP_DIAGNOSTICS_FALLBACK_MS);
		expect(idleCallbacks).toHaveLength(1);
	});

	it("still records a boot that never reveals, after the fallback delay", async () => {
		milestones.scheduleStartupDiagnostics();
		milestones.scheduleStartupDiagnostics();
		await vi.advanceTimersByTimeAsync(milestones.STARTUP_DIAGNOSTICS_FALLBACK_MS - 1);
		expect(idleCallbacks).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(1);
		expect(idleCallbacks).toHaveLength(1);
		idleCallbacks[0]?.();
		await vi.waitFor(() => expect(recorderState.start).toHaveBeenCalledOnce());
	});
});
