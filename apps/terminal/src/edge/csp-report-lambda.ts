/**
 * Receives Content-Security-Policy violation reports on a public Lambda function URL. Browsers
 * send these reports themselves, without the payload hash CloudFront's signed origin needs, so the
 * receiver lives outside the signed API origin. It logs a trimmed summary and nothing else: no
 * secrets, no storage, bounded body size and a per-instance rate limit.
 */
export interface CspReportEvent {
	rawPath: string;
	headers?: Record<string, string | undefined>;
	requestContext: { http: { method: string } };
	body?: string;
	isBase64Encoded?: boolean;
}

export interface CspReportResult {
	statusCode: number;
	headers: Record<string, string>;
	body: string;
	isBase64Encoded: boolean;
}

export interface CspViolationSummary {
	documentUrl: string;
	directive: string;
	blockedUrl: string;
	source: string;
	disposition: string;
}

export const CSP_REPORT_MAX_BODY_BYTES = 8_192;
export const CSP_REPORTS_PER_MINUTE = 120;
const ACCEPTED_CONTENT_TYPES = ["application/csp-report", "application/reports+json", "application/json"];
const FIELD_LIMIT = 200;

function text(value: unknown): string {
	return typeof value === "string" ? value.slice(0, FIELD_LIMIT) : "";
}

function summarize(report: Record<string, unknown>): CspViolationSummary {
	const source = text(report["source-file"] ?? report.sourceFile);
	const line = report["line-number"] ?? report.lineNumber;
	return {
		documentUrl: text(report["document-uri"] ?? report.documentURL),
		directive: text(report["effective-directive"] ?? report.effectiveDirective ?? report["violated-directive"]),
		blockedUrl: text(report["blocked-uri"] ?? report.blockedURL),
		source: typeof line === "number" ? `${source}:${line}` : source,
		disposition: text(report.disposition) || "report",
	};
}

/** Accepts the legacy `{"csp-report": {...}}` shape and Reporting API batches. */
export function summarizeCspReports(body: string): CspViolationSummary[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return [];
	}
	if (Array.isArray(parsed)) {
		return parsed
			.filter((entry): entry is { type?: unknown; body?: unknown } => typeof entry === "object" && entry !== null)
			.filter((entry) => entry.type === "csp-violation" && typeof entry.body === "object" && entry.body !== null)
			.map((entry) => summarize(entry.body as Record<string, unknown>));
	}
	if (typeof parsed === "object" && parsed !== null) {
		const legacy = (parsed as { "csp-report"?: unknown })["csp-report"];
		if (typeof legacy === "object" && legacy !== null) return [summarize(legacy as Record<string, unknown>)];
	}
	return [];
}

function respond(statusCode: number, extra: Record<string, string> = {}): CspReportResult {
	return { statusCode, headers: { "cache-control": "no-store", ...extra }, body: "", isBase64Encoded: false };
}

export interface CspReportEnvironment {
	now?: () => number;
	log?: (line: string) => void;
}

export function createCspReportHandler(environment: CspReportEnvironment = {}) {
	const now = environment.now ?? (() => Date.now());
	const log = environment.log ?? ((line: string) => console.warn(line));
	let windowStartedAt = 0;
	let reportsInWindow = 0;

	return async function handler(event: CspReportEvent): Promise<CspReportResult> {
		const method = event.requestContext.http.method.toUpperCase();
		if (method !== "POST") return respond(405, { allow: "POST" });
		const contentType = (event.headers?.["content-type"] ?? event.headers?.["Content-Type"] ?? "").toLowerCase();
		if (!ACCEPTED_CONTENT_TYPES.some((accepted) => contentType.startsWith(accepted))) return respond(415);
		const body = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString("utf8") : (event.body ?? "");
		if (Buffer.byteLength(body, "utf8") > CSP_REPORT_MAX_BODY_BYTES) return respond(413);

		const time = now();
		if (time - windowStartedAt >= 60_000) {
			windowStartedAt = time;
			reportsInWindow = 0;
		}
		if (reportsInWindow >= CSP_REPORTS_PER_MINUTE) return respond(429, { "retry-after": "60" });
		reportsInWindow += 1;

		for (const summary of summarizeCspReports(body)) {
			log(JSON.stringify({ event: "csp_violation", receivedAt: new Date(time).toISOString(), ...summary }));
		}
		return respond(204);
	};
}

export const handler = createCspReportHandler();
