import { describe, expect, it, vi } from "vitest";
import {
	createLambdaHandler,
	FORWARDED_HOST_HEADER,
	type LambdaEnvironment,
	type LambdaFunctionUrlEvent,
	resolveClientIp,
	resolveRequestOrigin,
	stripViewerAddressPort,
	toRequest,
	VIEWER_ADDRESS_HEADER,
} from "@/edge/lambda-handler";

const ALLOWED_IPDATA_RESPONSE = {
	country_code: "GB",
	region_code: "ENG",
	threat: { is_anonymous: false, is_proxy: false, is_tor: false },
};

function event(overrides: Partial<LambdaFunctionUrlEvent> & { method?: string } = {}): LambdaFunctionUrlEvent {
	const { method = "GET", ...rest } = overrides;
	return {
		rawPath: "/api/geo",
		rawQueryString: "",
		headers: {},
		requestContext: { domainName: "abc.lambda-url.ap-northeast-1.on.aws", http: { method, sourceIp: "198.51.100.7" } },
		isBase64Encoded: false,
		...rest,
	};
}

function environment(overrides: Partial<LambdaEnvironment> = {}): LambdaEnvironment {
	return {
		development: false,
		ipdataApiKey: () => "test-key",
		publicOrigin: "https://app.gatu.ai",
		trustViewerAddress: true,
		now: () => 1_000,
		...overrides,
	};
}

describe("lambda function url adapter", () => {
	it("strips the port from the CloudFront viewer address and falls back to the source ip", () => {
		expect(stripViewerAddressPort("203.0.113.9:44512")).toBe("203.0.113.9");
		expect(stripViewerAddressPort("[2001:db8::1]:443")).toBe("2001:db8::1");
		expect(stripViewerAddressPort("203.0.113.9")).toBe("203.0.113.9");
		expect(resolveClientIp(event({ headers: { [VIEWER_ADDRESS_HEADER]: "203.0.113.9:1" } }), true)).toBe("203.0.113.9");
		expect(resolveClientIp(event({ headers: { [VIEWER_ADDRESS_HEADER]: "203.0.113.9:1" } }), false)).toBe(
			"198.51.100.7",
		);
		expect(resolveClientIp(event(), true)).toBe("198.51.100.7");
	});

	it("rebuilds the public request url from the forwarded host and never trusts a viewer-supplied client ip", () => {
		const forwarded = event({ headers: { [FORWARDED_HOST_HEADER]: "App.Gatu.Ai", "x-gatu-client-ip": "1.1.1.1" } });
		expect(resolveRequestOrigin(forwarded, undefined)).toBe("https://app.gatu.ai");
		expect(resolveRequestOrigin(event(), "https://testnet.gatu.ai/")).toBe("https://testnet.gatu.ai");
		expect(resolveRequestOrigin(event(), undefined)).toBe("https://abc.lambda-url.ap-northeast-1.on.aws");
		const request = toRequest(forwarded, environment({ trustViewerAddress: false }));
		expect(request.url).toBe("https://app.gatu.ai/api/geo");
		expect(request.headers.get("x-gatu-client-ip")).toBe("198.51.100.7");
	});

	it("routes geo lookups with the trusted viewer address", async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ALLOWED_IPDATA_RESPONSE } as Response);
		const handler = createLambdaHandler(environment({ fetch: fetchMock }));
		const result = await handler(event({ headers: { [VIEWER_ADDRESS_HEADER]: "203.0.113.9:5555" } }));
		expect(result.statusCode).toBe(200);
		expect(result.headers["cache-control"]).toBe("no-store");
		expect(JSON.parse(result.body)).toEqual({ country: "GB", proxy: false, tradeRestricted: false });
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain("https://api.ipdata.co/203.0.113.9?api-key=test-key");
	});

	it("enforces same-origin referral checks against the public origin", async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ALLOWED_IPDATA_RESPONSE } as Response);
		const handler = createLambdaHandler(environment({ fetch: fetchMock }));
		const base = {
			rawPath: "/api/referral-geo",
			method: "POST",
			body: JSON.stringify({ override: null }),
		};
		const crossSite = await handler(
			event({ ...base, headers: { origin: "https://evil.test", "content-type": "application/json" } }),
		);
		expect(crossSite.statusCode).toBe(403);
		const sameOrigin = await handler(
			event({
				...base,
				headers: {
					origin: "https://app.gatu.ai",
					"sec-fetch-site": "same-origin",
					"content-type": "application/json",
					[FORWARDED_HOST_HEADER]: "app.gatu.ai",
					[VIEWER_ADDRESS_HEADER]: "203.0.113.9:1",
				},
			}),
		);
		expect(sameOrigin.statusCode).toBe(200);
		expect(JSON.parse(sameOrigin.body)).toMatchObject({ status: "allowed", country: "GB", ttlMs: 60_000 });
	});

	it("accepts client error reports on both paths and answers everything else without rendering", async () => {
		const handler = createLambdaHandler(environment());
		const report = JSON.stringify({
			schema: 1,
			kind: "react_boundary",
			category: "runtime",
			errorName: "TypeError",
			route: "trade",
			frames: ["asset:10:2"],
			componentFrames: ["source:20:4"],
		});
		const write = vi.spyOn(console, "error").mockImplementation(() => {});
		for (const rawPath of ["/api/client-error-report", "/client-error-report"]) {
			const accepted = await handler(
				event({
					rawPath,
					method: "POST",
					body: report,
					headers: {
						origin: "https://app.gatu.ai",
						"sec-fetch-site": "same-origin",
						"content-type": "application/json",
						[FORWARDED_HOST_HEADER]: "app.gatu.ai",
					},
				}),
			);
			expect(accepted.statusCode, rawPath).toBe(202);
		}
		expect(write).toHaveBeenCalledTimes(2);
		write.mockRestore();

		expect((await handler(event({ rawPath: "/api/client-error-report" }))).statusCode).toBe(405);
		expect((await handler(event({ rawPath: "/mobile-agent-sync-ticket", method: "POST" }))).statusCode).toBe(503);
		expect((await handler(event({ rawPath: "/api/unknown" }))).statusCode).toBe(404);
		expect((await handler(event({ rawPath: "/trade/BTC" }))).statusCode).toBe(404);
		expect((await handler(event({ rawPath: "/api/leaderboard", method: "POST" }))).statusCode).toBe(405);
	});
});
