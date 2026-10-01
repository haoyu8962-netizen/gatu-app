import { describe, expect, it, vi } from "vitest";
import {
	CSP_REPORT_MAX_BODY_BYTES,
	CSP_REPORTS_PER_MINUTE,
	CSP_REPORTS_PER_REQUEST,
	createCspReportHandler,
	sanitizeReportUrl,
	summarizeCspReports,
} from "@/edge/csp-report-lambda";

function event(body: string, overrides: { method?: string; contentType?: string } = {}) {
	return {
		rawPath: "/",
		headers: { "content-type": overrides.contentType ?? "application/csp-report" },
		requestContext: { http: { method: overrides.method ?? "POST" } },
		body,
		isBase64Encoded: false,
	};
}

const LEGACY = JSON.stringify({
	"csp-report": {
		"document-uri": "https://app.sairn.ai/trade/HYPE",
		"effective-directive": "img-src",
		"blocked-uri": "https://cdn.example/logo.png",
		"source-file": "https://app.sairn.ai/assets/index-abc.js",
		"line-number": 12,
	},
});

const INLINE = JSON.stringify({
	"csp-report": {
		"document-uri": "https://app.sairn.ai/docs",
		"effective-directive": "script-src",
		"blocked-uri": "inline",
		"script-sample": '(()=>{let theme="dark";try{const value=JS',
		disposition: "enforce",
	},
});

const REPORTING_API = JSON.stringify([
	{
		type: "csp-violation",
		body: {
			documentURL: "https://app.sairn.ai/portfolio",
			effectiveDirective: "script-src",
			blockedURL: "blob",
			disposition: "report",
		},
	},
	{ type: "deprecation", body: {} },
]);

describe("csp report receiver", () => {
	it("summarizes both report formats and ignores other report types", () => {
		expect(summarizeCspReports(LEGACY)).toEqual([
			{
				documentUrl: "https://app.sairn.ai/trade/HYPE",
				directive: "img-src",
				blockedUrl: "https://cdn.example/logo.png",
				source: "https://app.sairn.ai/assets/index-abc.js:12",
				sample: "",
				disposition: "report",
			},
		]);
		expect(summarizeCspReports(INLINE)).toEqual([
			{
				documentUrl: "https://app.sairn.ai/docs",
				directive: "script-src",
				blockedUrl: "inline",
				source: "",
				sample: '(()=>{let theme="dark";try{const value=J',
				disposition: "enforce",
			},
		]);
		expect(summarizeCspReports(REPORTING_API)).toEqual([
			{
				documentUrl: "https://app.sairn.ai/portfolio",
				directive: "script-src",
				blockedUrl: "blob",
				source: "",
				sample: "",
				disposition: "report",
			},
		]);
		expect(summarizeCspReports("not json")).toEqual([]);
		expect(summarizeCspReports(JSON.stringify({ other: 1 }))).toEqual([]);
	});

	it("logs URLs without query strings, fragments or referral codes and truncates script samples", () => {
		expect(sanitizeReportUrl("https://app.sairn.ai/join/abc123?ref=ME#x")).toBe("https://app.sairn.ai/join/*");
		expect(sanitizeReportUrl("https://user:pw@app.sairn.ai/trade/HYPE?utm=1")).toBe("https://app.sairn.ai/trade/HYPE");
		expect(sanitizeReportUrl("inline")).toBe("inline");
		expect(sanitizeReportUrl("blob")).toBe("blob");
		expect(sanitizeReportUrl("https://[bad")).toBe("");
		const [summary] = summarizeCspReports(
			JSON.stringify({
				"csp-report": {
					"document-uri": "https://app.sairn.ai/join/CODE?ref=friend",
					"effective-directive": "script-src",
					"blocked-uri": "https://cdn.example/x.js?token=secret",
					"source-file": "https://app.sairn.ai/assets/a.js?v=1",
					"line-number": 3,
					"script-sample": "x".repeat(200),
				},
			}),
		);
		expect(summary).toMatchObject({
			documentUrl: "https://app.sairn.ai/join/*",
			blockedUrl: "https://cdn.example/x.js",
			source: "https://app.sairn.ai/assets/a.js:3",
		});
		expect(summary?.sample).toHaveLength(40);
	});

	it("drops empty entries and caps a batch, charging every logged entry against the minute budget", async () => {
		const log = vi.fn();
		const handler = createCspReportHandler({ now: () => 1_000, log });
		const batch = JSON.stringify([
			...Array.from({ length: 30 }, () => ({
				type: "csp-violation",
				body: {
					documentURL: "https://app.sairn.ai/trade/HYPE",
					effectiveDirective: "img-src",
					blockedURL: "https://x.example/i.png",
				},
			})),
			{ type: "csp-violation", body: {} },
		]);
		expect((await handler(event(batch, { contentType: "application/reports+json" }))).statusCode).toBe(204);
		expect(log).toHaveBeenCalledTimes(CSP_REPORTS_PER_REQUEST);
		for (let index = 1; index * CSP_REPORTS_PER_REQUEST < CSP_REPORTS_PER_MINUTE; index += 1) {
			expect((await handler(event(batch, { contentType: "application/reports+json" }))).statusCode).toBe(204);
		}
		expect((await handler(event(batch, { contentType: "application/reports+json" }))).statusCode).toBe(429);
		expect(log).toHaveBeenCalledTimes(CSP_REPORTS_PER_MINUTE);
		expect(
			(
				await handler(
					event(JSON.stringify([{ type: "csp-violation", body: {} }]), { contentType: "application/reports+json" }),
				)
			).statusCode,
		).toBe(429);
	});

	it("logs one line per violation and answers 204 without a body", async () => {
		const log = vi.fn();
		const handler = createCspReportHandler({ now: () => 1_000, log });
		const result = await handler(event(LEGACY));
		expect(result.statusCode).toBe(204);
		expect(result.headers["cache-control"]).toBe("no-store");
		expect(log).toHaveBeenCalledTimes(1);
		expect(JSON.parse(log.mock.calls[0]?.[0] ?? "{}")).toMatchObject({ event: "csp_violation", directive: "img-src" });
	});

	it("rejects other methods, content types and oversized bodies, and rate limits per instance", async () => {
		const log = vi.fn();
		let time = 0;
		const handler = createCspReportHandler({ now: () => time, log });
		expect((await handler(event(LEGACY, { method: "GET" }))).statusCode).toBe(405);
		expect((await handler(event(LEGACY, { contentType: "text/plain" }))).statusCode).toBe(415);
		expect((await handler(event("x".repeat(CSP_REPORT_MAX_BODY_BYTES + 1)))).statusCode).toBe(413);
		for (let index = 0; index < CSP_REPORTS_PER_MINUTE; index += 1)
			expect((await handler(event(LEGACY))).statusCode).toBe(204);
		expect((await handler(event(LEGACY))).statusCode).toBe(429);
		time = 61_000;
		expect((await handler(event(LEGACY))).statusCode).toBe(204);
		expect(log).toHaveBeenCalledTimes(CSP_REPORTS_PER_MINUTE + 1);
	});
});
