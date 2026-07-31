import { describe, expect, it, vi } from "vitest";
import { CLIENT_ERROR_REPORT_MAX_BYTES, type ClientErrorReport } from "@/lib/error-reporting/report";
import { createErrorReportRateLimiter, handleClientErrorReport } from "@/lib/error-reporting/server";

const VALID_REPORT: ClientErrorReport = {
	schema: 1,
	kind: "react_boundary",
	category: "runtime",
	errorName: "TypeError",
	route: "trade",
	frames: ["asset:10:2"],
	componentFrames: ["source:20:4"],
};

function createReportRequest(body: BodyInit, origin = "https://gatu.ai", headers: HeadersInit = {}): Request {
	return new Request("https://gatu.ai/client-error-report", {
		method: "POST",
		headers: {
			origin,
			"content-type": "application/json",
			"sec-fetch-site": "same-origin",
			...headers,
		},
		body,
	});
}

describe("client error report endpoint", () => {
	it("accepts a bounded same-origin report and logs only the validated record", async () => {
		const write = vi.fn();
		const response = await handleClientErrorReport(createReportRequest(JSON.stringify(VALID_REPORT)), {
			now: () => Date.UTC(2026, 6, 31),
			rateLimiter: createErrorReportRateLimiter(5, 60_000),
			write,
		});

		expect(response.status).toBe(202);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(response.headers.get("referrer-policy")).toBe("no-referrer");
		expect(write).toHaveBeenCalledWith({
			event: "client_runtime_error",
			receivedAt: "2026-07-31T00:00:00.000Z",
			release: expect.any(String),
			build: expect.any(String),
			...VALID_REPORT,
		});
	});

	it("rejects cross-origin and cross-site requests", async () => {
		const write = vi.fn();
		const crossOrigin = await handleClientErrorReport(
			createReportRequest(JSON.stringify(VALID_REPORT), "https://evil.example"),
			{ write },
		);
		const crossSite = await handleClientErrorReport(
			createReportRequest(JSON.stringify(VALID_REPORT), "https://gatu.ai", {
				"sec-fetch-site": "cross-site",
			}),
			{ write },
		);

		expect(crossOrigin.status).toBe(403);
		expect(crossSite.status).toBe(403);
		expect(write).not.toHaveBeenCalled();
	});

	it("rejects bodies with extra secret-bearing fields or invalid UTF-8", async () => {
		const write = vi.fn();
		const secretBody = JSON.stringify({ ...VALID_REPORT, message: `privateKey=0x${"a".repeat(64)}` });
		const secretResponse = await handleClientErrorReport(createReportRequest(secretBody), {
			rateLimiter: createErrorReportRateLimiter(5, 60_000),
			write,
		});
		const invalidUtf8Response = await handleClientErrorReport(createReportRequest(new Uint8Array([0xff])), {
			rateLimiter: createErrorReportRateLimiter(5, 60_000),
			write,
		});

		expect(secretResponse.status).toBe(400);
		expect(invalidUtf8Response.status).toBe(400);
		expect(write).not.toHaveBeenCalled();
	});

	it("rejects oversized streamed and declared bodies", async () => {
		const oversizedBody = "x".repeat(CLIENT_ERROR_REPORT_MAX_BYTES + 1);
		const streamed = await handleClientErrorReport(createReportRequest(oversizedBody), {
			rateLimiter: createErrorReportRateLimiter(5, 60_000),
		});
		const declared = await handleClientErrorReport(
			createReportRequest("{}", "https://gatu.ai", {
				"content-length": String(CLIENT_ERROR_REPORT_MAX_BYTES + 1),
			}),
			{ rateLimiter: createErrorReportRateLimiter(5, 60_000) },
		);

		expect(streamed.status).toBe(413);
		expect(declared.status).toBe(413);
	});

	it("applies a fixed-window server rate limit without retaining client identity", async () => {
		const limiter = createErrorReportRateLimiter(1, 60_000);
		const options = { now: () => 1000, rateLimiter: limiter, write: vi.fn() };

		const first = await handleClientErrorReport(createReportRequest(JSON.stringify(VALID_REPORT)), options);
		const second = await handleClientErrorReport(createReportRequest(JSON.stringify(VALID_REPORT)), options);

		expect(first.status).toBe(202);
		expect(second.status).toBe(429);
		expect(second.headers.get("retry-after")).toBe("59");
	});
});
