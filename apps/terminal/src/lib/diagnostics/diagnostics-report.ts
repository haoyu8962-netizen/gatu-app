import type { DiagnosticsBuffer } from "./diagnostics-buffer";

export interface DiagnosticsEnvironment {
	build: { version: string; release: string; commit: string };
	userAgent: string;
	standalone: boolean;
	visibility: string;
	copiedAt: string;
}

interface BuildIdentity {
	version: string;
	release: string;
	commit: string;
}

function isStandaloneDisplay(): boolean {
	const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
	if (iosStandalone) return true;
	if (typeof window.matchMedia !== "function") return false;
	return window.matchMedia("(display-mode: standalone)").matches;
}

export function readDiagnosticsEnvironment(build: BuildIdentity): DiagnosticsEnvironment {
	return {
		build,
		userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
		standalone: typeof window === "undefined" ? false : isStandaloneDisplay(),
		visibility: typeof document === "undefined" ? "unknown" : document.visibilityState,
		copiedAt: new Date().toISOString(),
	};
}

/** The text the user copies: build, browser and the stored boot records, nothing else. */
export function buildDiagnosticsReport(environment: DiagnosticsEnvironment, buffer: DiagnosticsBuffer): string {
	return JSON.stringify({ kind: "startup-diagnostics", v: buffer.v, ...environment, boots: buffer.boots }, null, 2);
}
