import type { HyperliquidStore } from "@sairn/hl-react/store";

export type StartupMilestone = "entry" | "runtime" | "locale" | "localeFallback" | "fonts" | "reveal" | "route";

export type StartupMilestones = Partial<Record<StartupMilestone, number>>;

/** A boot that never reveals still gets its record written after this delay. */
export const STARTUP_DIAGNOSTICS_FALLBACK_MS = 8000;
const STARTUP_DIAGNOSTICS_IDLE_TIMEOUT_MS = 2000;

const milestones: StartupMilestones = {};
const listeners = new Set<() => void>();
let recoveryStore: HyperliquidStore | undefined;
let flushHandler: (() => void) | undefined;
let recorderScheduled = false;

function notify(): void {
	for (const listener of listeners) {
		try {
			listener();
		} catch {}
	}
}

export function markStartupMilestone(name: StartupMilestone): void {
	if (milestones[name] !== undefined || typeof performance === "undefined") return;
	milestones[name] = Math.round(performance.now());
	notify();
}

export function getStartupMilestones(): StartupMilestones {
	return { ...milestones };
}

export function attachRecoveryDiagnostics(store: HyperliquidStore): void {
	if (recoveryStore === store) return;
	recoveryStore = store;
	notify();
}

export function getRecoveryDiagnosticsStore(): HyperliquidStore | undefined {
	return recoveryStore;
}

export function subscribeStartupDiagnostics(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function registerDiagnosticsFlush(handler: (() => void) | undefined): void {
	flushHandler = handler;
}

/** Writes the current boot's record synchronously when the recorder is running; otherwise does nothing. */
export function flushStartupDiagnostics(): void {
	try {
		flushHandler?.();
	} catch {}
}

function runWhenIdle(task: () => void): void {
	if (typeof window.requestIdleCallback === "function") {
		window.requestIdleCallback(task, { timeout: STARTUP_DIAGNOSTICS_IDLE_TIMEOUT_MS });
		return;
	}
	setTimeout(task, 0);
}

// The recorder chunk loads only once the page has revealed (or the fallback delay has passed) and
// the main thread is idle, so recording never competes with the startup it measures.
export function scheduleStartupDiagnostics(): void {
	if (recorderScheduled || typeof window === "undefined") return;
	recorderScheduled = true;
	let started = false;
	let unsubscribe = () => {};
	const start = () => {
		if (started) return;
		started = true;
		unsubscribe();
		clearTimeout(fallbackTimer);
		runWhenIdle(() => {
			import("./diagnostics-recorder")
				.then(({ startDiagnosticsRecorder }) => startDiagnosticsRecorder())
				.catch(() => {});
		});
	};
	const fallbackTimer = setTimeout(start, STARTUP_DIAGNOSTICS_FALLBACK_MS);
	unsubscribe = subscribeStartupDiagnostics(() => {
		if (milestones.reveal !== undefined) start();
	});
	if (milestones.reveal !== undefined) start();
}
