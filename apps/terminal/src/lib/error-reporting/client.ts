import {
	CLIENT_ERROR_REPORT_ENDPOINT,
	CLIENT_ERROR_REPORT_MAX_BYTES,
	type ClientErrorKind,
	createClientErrorReport,
} from "./report";

const CLIENT_REPORT_LIMIT = 5;
const CLIENT_REPORT_WINDOW_MS = 60_000;
const CLIENT_REPORT_DEDUPLICATION_MS = 10_000;

let reportWindowStartedAtMs = 0;
let reportsInWindow = 0;
let removeGlobalListeners: (() => void) | null = null;
const recentReports = new Map<string, number>();
const reportedErrors = new WeakSet<object>();

interface ReportClientErrorOptions {
	kind: ClientErrorKind;
	componentStack?: string;
}

export function installGlobalErrorReporting(): () => void {
	if (removeGlobalListeners) return removeGlobalListeners;

	function handleError(event: ErrorEvent) {
		if (event.error === undefined || event.error === null) return;
		reportClientError(event.error, { kind: "window_error" });
	}

	function handleUnhandledRejection(event: PromiseRejectionEvent) {
		reportClientError(event.reason, { kind: "unhandled_rejection" });
	}

	window.addEventListener("error", handleError);
	window.addEventListener("unhandledrejection", handleUnhandledRejection);

	removeGlobalListeners = () => {
		window.removeEventListener("error", handleError);
		window.removeEventListener("unhandledrejection", handleUnhandledRejection);
		removeGlobalListeners = null;
	};
	return removeGlobalListeners;
}

export function reportClientError(error: unknown, options: ReportClientErrorOptions): boolean {
	if (typeof window === "undefined" || typeof fetch !== "function") return false;
	if (typeof error === "object" && error !== null) {
		if (reportedErrors.has(error)) return false;
		reportedErrors.add(error);
	}

	const report = createClientErrorReport(error, {
		kind: options.kind,
		pathname: window.location.pathname,
		origin: window.location.origin,
		componentStack: options.componentStack,
	});
	const body = JSON.stringify(report);
	if (new TextEncoder().encode(body).byteLength > CLIENT_ERROR_REPORT_MAX_BYTES) return false;

	const nowMs = Date.now();
	if (isRecentlyReported(body, nowMs) || !consumeClientReportAllowance(nowMs)) return false;
	rememberReport(body, nowMs);

	void fetch(CLIENT_ERROR_REPORT_ENDPOINT, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body,
		cache: "no-store",
		credentials: "omit",
		keepalive: true,
		mode: "same-origin",
		redirect: "error",
		referrerPolicy: "no-referrer",
	}).catch(() => {});
	return true;
}

function consumeClientReportAllowance(nowMs: number): boolean {
	if (nowMs - reportWindowStartedAtMs >= CLIENT_REPORT_WINDOW_MS || nowMs < reportWindowStartedAtMs) {
		reportWindowStartedAtMs = nowMs;
		reportsInWindow = 0;
		recentReports.clear();
	}
	if (reportsInWindow >= CLIENT_REPORT_LIMIT) return false;
	reportsInWindow += 1;
	return true;
}

function isRecentlyReported(body: string, nowMs: number): boolean {
	const previousReportAtMs = recentReports.get(body);
	if (previousReportAtMs === undefined) return false;
	const ageMs = nowMs - previousReportAtMs;
	return ageMs >= 0 && ageMs <= CLIENT_REPORT_DEDUPLICATION_MS;
}

function rememberReport(body: string, nowMs: number): void {
	recentReports.set(body, nowMs);

	for (const [report, reportedAtMs] of recentReports) {
		if (nowMs - reportedAtMs > CLIENT_REPORT_DEDUPLICATION_MS) recentReports.delete(report);
	}
}
