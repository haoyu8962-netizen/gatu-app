import { APP_BUILD_COMMIT, APP_RELEASE_ID } from "@/config/app";
import { CLIENT_ERROR_REPORT_MAX_BYTES, type ClientErrorReport, parseClientErrorReport } from "./report";

const SERVER_REPORT_LIMIT = 60;
const SERVER_REPORT_WINDOW_MS = 60_000;

interface RateLimitResult {
	allowed: boolean;
	retryAfterSeconds: number;
}

interface ErrorReportRateLimiter {
	consume(nowMs: number): RateLimitResult;
}

interface HandleClientErrorReportOptions {
	now?: () => number;
	rateLimiter?: ErrorReportRateLimiter;
	write?: (record: ServerClientErrorRecord) => void;
}

interface ServerClientErrorRecord extends ClientErrorReport {
	event: "client_runtime_error";
	receivedAt: string;
	release: string;
	build: string;
}

const serverRateLimiter = createErrorReportRateLimiter(SERVER_REPORT_LIMIT, SERVER_REPORT_WINDOW_MS);

export async function handleClientErrorReport(
	request: Request,
	options: HandleClientErrorReportOptions = {},
): Promise<Response> {
	if (!isSameOriginRequest(request)) return responseWithStatus(403);
	if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
		return responseWithStatus(415);
	}

	const declaredLength = parseDeclaredContentLength(request.headers.get("content-length"));
	if (declaredLength === null) return responseWithStatus(400);
	if (declaredLength !== undefined && declaredLength > CLIENT_ERROR_REPORT_MAX_BYTES) return responseWithStatus(413);

	const now = options.now ?? Date.now;
	const nowMs = now();
	const rateLimit = (options.rateLimiter ?? serverRateLimiter).consume(nowMs);
	if (!rateLimit.allowed) {
		return responseWithStatus(429, { "retry-after": String(rateLimit.retryAfterSeconds) });
	}

	let body: string | null;
	try {
		body = await readBoundedBody(request, CLIENT_ERROR_REPORT_MAX_BYTES);
	} catch {
		return responseWithStatus(400);
	}
	if (body === null) return responseWithStatus(413);

	let parsedBody: unknown;
	try {
		parsedBody = JSON.parse(body);
	} catch {
		return responseWithStatus(400);
	}

	const report = parseClientErrorReport(parsedBody);
	if (!report) return responseWithStatus(400);

	const record: ServerClientErrorRecord = {
		event: "client_runtime_error",
		receivedAt: new Date(nowMs).toISOString(),
		release: APP_RELEASE_ID,
		build: APP_BUILD_COMMIT,
		...report,
	};
	(options.write ?? writeClientErrorRecord)(record);
	return responseWithStatus(202);
}

export function createErrorReportRateLimiter(limit: number, windowMs: number): ErrorReportRateLimiter {
	let windowStartedAtMs = 0;
	let reportsInWindow = 0;

	return {
		consume(nowMs) {
			if (nowMs - windowStartedAtMs >= windowMs || nowMs < windowStartedAtMs) {
				windowStartedAtMs = nowMs;
				reportsInWindow = 0;
			}
			if (reportsInWindow >= limit) {
				return {
					allowed: false,
					retryAfterSeconds: Math.max(1, Math.ceil((windowStartedAtMs + windowMs - nowMs) / 1000)),
				};
			}
			reportsInWindow += 1;
			return { allowed: true, retryAfterSeconds: 0 };
		},
	};
}

export function isSameOriginRequest(request: Request): boolean {
	const origin = request.headers.get("origin");
	if (!origin || origin === "null") return false;
	if (request.headers.get("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin") return false;

	try {
		return origin === new URL(request.url).origin;
	} catch {
		return false;
	}
}

function parseDeclaredContentLength(header: string | null): number | undefined | null {
	if (header === null) return undefined;
	if (!/^[0-9]+$/.test(header)) return null;
	const length = Number(header);
	return Number.isSafeInteger(length) ? length : null;
}

async function readBoundedBody(request: Request, maxBytes: number): Promise<string | null> {
	if (!request.body) return "";

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		if (!value) continue;
		totalBytes += value.byteLength;
		if (totalBytes > maxBytes) {
			try {
				await reader.cancel();
			} catch {}
			return null;
		}
		chunks.push(value);
	}

	const body = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

function responseWithStatus(status: number, extraHeaders: Record<string, string> = {}): Response {
	return new Response(null, {
		status,
		headers: {
			"cache-control": "no-store",
			"referrer-policy": "no-referrer",
			...extraHeaders,
		},
	});
}

function writeClientErrorRecord(record: ServerClientErrorRecord): void {
	console.error(JSON.stringify(record));
}
