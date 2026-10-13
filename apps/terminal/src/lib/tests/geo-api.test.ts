import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeoApiHandlers, type GeoApiEnvironment } from "@/lib/geo/geo-api";
import { getGeo } from "@/lib/geo/get-geo";
import { getReferralActionGeo } from "@/lib/geo/get-referral-action-geo";

const ORIGIN = "https://sairn.ai";
const THREAT_CLEAR = { is_anonymous: false, is_proxy: false, is_tor: false };
const ALLOWED_IPDATA_RESPONSE = { country_code: "GB", region_code: "ENG", threat: THREAT_CLEAR };
const PROXY_IPDATA_RESPONSE = { country_code: "GB", region_code: "ENG", threat: { ...THREAT_CLEAR, is_proxy: true } };
const ONTARIO_IPDATA_RESPONSE = { country_code: "CA", region_code: "ON", threat: THREAT_CLEAR };
const CANADA_WITHOUT_REGION = { country_code: "CA", region_code: null, threat: THREAT_CLEAR };

function ipdataResponse(body: unknown, ok = true): Response {
	return { ok, json: async () => body } as unknown as Response;
}

function geoRequest(search = "", init?: RequestInit): Request {
	return new Request(`${ORIGIN}/api/geo${search}`, init);
}

function referralRequest(body?: unknown, headers: Record<string, string> = {}, rawBody?: string): Request {
	return new Request(`${ORIGIN}/api/referral-geo`, {
		method: "POST",
		headers: { origin: ORIGIN, "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers },
		body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
	});
}

function createEnvironment(overrides: Partial<GeoApiEnvironment> = {}): GeoApiEnvironment {
	return {
		development: false,
		ipdataApiKey: () => "test-ipdata-key",
		resolveClientIp: () => "198.51.100.10",
		now: () => 1_000,
		...overrides,
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("geo API handlers in development", () => {
	const fetchMock = vi.fn();
	const handlers = createGeoApiHandlers(createEnvironment({ development: true, fetch: fetchMock }));

	it("uses the default local verdict and honors restricted overrides without IPdata", async () => {
		await expect(handlers.geo(geoRequest()).then((response) => response.json())).resolves.toEqual({
			country: "GB",
			proxy: false,
			tradeRestricted: false,
		});
		await expect(handlers.geo(geoRequest("?override=US")).then((response) => response.json())).resolves.toMatchObject({
			country: "US",
			tradeRestricted: true,
		});
		const invalid = await handlers.geo(geoRequest("?override=not-a-country"));
		expect(invalid.status).toBe(400);
		await expect(invalid.json()).resolves.toMatchObject({ reason: "invalid_override" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("derives referral decisions from the override without IPdata", async () => {
		await expect(
			handlers.referralActionGeo(referralRequest({ override: null })).then((r) => r.json()),
		).resolves.toMatchObject({ country: "GB", status: "allowed", ttlMs: 60_000, checkedAt: 1_000 });
		await expect(
			handlers.referralActionGeo(referralRequest({ override: "CA-ON" })).then((r) => r.json()),
		).resolves.toMatchObject({ country: "CA", reason: "jurisdiction", status: "blocked" });
		await expect(
			handlers.referralActionGeo(referralRequest({ override: "not-a-country" })).then((r) => r.json()),
		).resolves.toMatchObject({ reason: "invalid_response", status: "unavailable" });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("geo API handlers in production", () => {
	it("rejects the wrong method and fails closed without configuration or a client IP", async () => {
		const fetchMock = vi.fn();
		const missingKey = createGeoApiHandlers(createEnvironment({ ipdataApiKey: () => undefined, fetch: fetchMock }));
		const wrongMethod = await missingKey.geo(geoRequest("", { method: "POST" }));
		expect(wrongMethod.status).toBe(405);
		const noKey = await missingKey.geo(geoRequest("?override=GB"));
		expect(noKey.status).toBe(503);
		await expect(noKey.json()).resolves.toMatchObject({
			error: "Geo restriction check unavailable",
			reason: "missing_config",
		});

		const missingIp = createGeoApiHandlers(createEnvironment({ resolveClientIp: () => undefined, fetch: fetchMock }));
		const noIp = await missingIp.geo(geoRequest());
		expect(noIp.status).toBe(503);
		await expect(noIp.json()).resolves.toMatchObject({ reason: "missing_ip" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("ignores overrides, queries IPdata once per IP within the cache window and keeps regions", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(ipdataResponse(ALLOWED_IPDATA_RESPONSE))
			.mockResolvedValueOnce(ipdataResponse(ONTARIO_IPDATA_RESPONSE));
		const ips = ["198.51.100.10", "198.51.100.10", "198.51.100.11"];
		let call = 0;
		const handlers = createGeoApiHandlers(
			createEnvironment({ fetch: fetchMock, resolveClientIp: () => ips[call++] ?? "198.51.100.11" }),
		);

		const first = await handlers.geo(geoRequest("?override=US"));
		expect(first.headers.get("cache-control")).toBe("no-store");
		await expect(first.json()).resolves.toEqual({ country: "GB", proxy: false, tradeRestricted: false });
		await expect(handlers.geo(geoRequest()).then((r) => r.json())).resolves.toEqual({
			country: "GB",
			proxy: false,
			tradeRestricted: false,
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
			"https://api.ipdata.co/198.51.100.10?api-key=test-ipdata-key",
		);

		await expect(handlers.geo(geoRequest()).then((r) => r.json())).resolves.toEqual({
			country: "CA",
			proxy: false,
			tradeRestricted: true,
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("reports provider failures, invalid payloads and proxies", async () => {
		const failing = createGeoApiHandlers(
			createEnvironment({ fetch: vi.fn().mockResolvedValue(ipdataResponse({}, false)) }),
		);
		const failure = await failing.geo(geoRequest());
		expect(failure.status).toBe(503);
		await expect(failure.json()).resolves.toMatchObject({ reason: "provider_error" });

		const throwing = createGeoApiHandlers(createEnvironment({ fetch: vi.fn().mockRejectedValue(new Error("boom")) }));
		await expect(throwing.geo(geoRequest()).then((r) => r.json())).resolves.toMatchObject({ reason: "provider_error" });

		const invalid = createGeoApiHandlers(
			createEnvironment({ fetch: vi.fn().mockResolvedValue(ipdataResponse(CANADA_WITHOUT_REGION)) }),
		);
		await expect(invalid.geo(geoRequest()).then((r) => r.json())).resolves.toMatchObject({
			reason: "invalid_response",
		});

		const proxied = createGeoApiHandlers(
			createEnvironment({ fetch: vi.fn().mockResolvedValue(ipdataResponse(PROXY_IPDATA_RESPONSE)) }),
		);
		await expect(proxied.geo(geoRequest()).then((r) => r.json())).resolves.toEqual({
			country: "GB",
			proxy: true,
			tradeRestricted: true,
		});
	});

	it("requires same-origin POSTs for referral decisions and never serves them from the cache", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(ipdataResponse(ALLOWED_IPDATA_RESPONSE))
			.mockResolvedValueOnce(ipdataResponse(PROXY_IPDATA_RESPONSE));
		const handlers = createGeoApiHandlers(createEnvironment({ fetch: fetchMock }));

		expect((await handlers.referralActionGeo(geoRequest("", { method: "GET" }))).status).toBe(405);
		const crossSite = await handlers.referralActionGeo(
			referralRequest({ override: null }, { origin: "https://evil.test" }),
		);
		expect(crossSite.status).toBe(403);
		const malformed = await handlers.referralActionGeo(referralRequest(undefined, {}, "{not json"));
		expect(malformed.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();

		await expect(
			handlers.referralActionGeo(referralRequest({ override: "US" })).then((r) => r.json()),
		).resolves.toMatchObject({ country: "GB", status: "allowed", ttlMs: 60_000, checkedAt: 1_000 });
		await expect(handlers.referralActionGeo(referralRequest()).then((r) => r.json())).resolves.toMatchObject({
			country: "GB",
			reason: "proxy",
			status: "blocked",
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
	});

	it("limits referral decisions per client IP and rejects oversized bodies before touching IPdata", async () => {
		const fetchMock = vi.fn(async () => ipdataResponse(ALLOWED_IPDATA_RESPONSE));
		let nowMs = 1_000;
		const handlers = createGeoApiHandlers(createEnvironment({ fetch: fetchMock, now: () => nowMs }));

		for (let i = 0; i < 12; i++) expect((await handlers.referralActionGeo(referralRequest())).status).toBe(200);
		expect((await handlers.referralActionGeo(referralRequest())).status).toBe(429);
		expect(fetchMock).toHaveBeenCalledTimes(12);

		const other = createEnvironment({ fetch: fetchMock, now: () => nowMs, resolveClientIp: () => "203.0.113.9" });
		expect((await createGeoApiHandlers(other).referralActionGeo(referralRequest())).status).toBe(200);

		nowMs += 60_000;
		expect((await handlers.referralActionGeo(referralRequest())).status).toBe(200);

		const oversized = await handlers.referralActionGeo(
			referralRequest(undefined, {}, `{"override":"${"x".repeat(2_000)}"}`),
		);
		expect(oversized.status).toBe(413);
		const oversizedText = await handlers.referralActionGeo(
			referralRequest(undefined, { "content-type": "text/plain" }, "x".repeat(2_000)),
		);
		expect(oversizedText.status).toBe(413);
		expect(
			(await handlers.referralActionGeo(referralRequest(undefined, { "content-type": "text/plain" }, "x"))).status,
		).toBe(200);
	});

	it("reports unavailable referral decisions inside the response body", async () => {
		const handlers = createGeoApiHandlers(createEnvironment({ ipdataApiKey: () => undefined }));
		const response = await handlers.referralActionGeo(referralRequest({ override: null }));
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			checkedAt: 1_000,
			reason: "missing_config",
			status: "unavailable",
		});
	});
});

describe("geo API clients", () => {
	it("fetches the same-origin geo endpoint and validates the verdict", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ country: "GB", proxy: false, tradeRestricted: false }))
			.mockResolvedValueOnce(Response.json({ country: "US", proxy: false, tradeRestricted: true }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getGeo({ data: { override: null } })).resolves.toEqual({
			country: "GB",
			proxy: false,
			tradeRestricted: false,
		});
		await expect(getGeo({ data: { override: "US" } })).resolves.toMatchObject({ country: "US", tradeRestricted: true });
		expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/geo");
		expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/geo?override=US");
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store", credentials: "omit", mode: "same-origin" });
	});

	it("fails closed on error responses and malformed verdicts", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce(Response.json({ error: "Invalid development geo override" }, { status: 400 }))
				.mockResolvedValueOnce(Response.json({ error: "Geo restriction check unavailable" }, { status: 503 }))
				.mockResolvedValueOnce(Response.json({ country: 42 })),
		);

		await expect(getGeo({ data: { override: "zz" } })).rejects.toThrow("Invalid development geo override");
		await expect(getGeo({ data: { override: null } })).rejects.toThrow("Geo restriction check unavailable");
		await expect(getGeo({ data: { override: null } })).rejects.toThrow("Geo restriction check unavailable");
	});

	it("posts referral geo checks as same-origin JSON and validates the decision", async () => {
		const decision = { checkedAt: 5, country: "GB", status: "allowed", ttlMs: 60_000 };
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(Response.json(decision))
			.mockResolvedValueOnce(Response.json({ error: "Forbidden" }, { status: 403 }))
			.mockResolvedValueOnce(Response.json({ status: "allowed" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getReferralActionGeo({ data: { override: "GB" } })).resolves.toEqual(decision);
		expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/referral-geo");
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
			method: "POST",
			body: JSON.stringify({ override: "GB" }),
			mode: "same-origin",
		});
		await expect(getReferralActionGeo({ data: { override: null } })).rejects.toThrow("Referral geo check unavailable");
		await expect(getReferralActionGeo({ data: { override: null } })).rejects.toThrow("Referral geo check unavailable");
	});
});
