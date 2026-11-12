import { describe, expect, it, vi } from "vitest";
import { toClientIpKey } from "@/lib/geo/client-ip-key";
import {
	GEO_UPSTREAM_BUDGET_BURST as BURST,
	createGeoApiHandlers,
	GEO_NETWORK_BUDGET_BURST,
	type GeoApiEnvironment,
	GEO_UPSTREAM_BUDGET_PER_MINUTE as PER_MINUTE,
} from "@/lib/geo/geo-api";
import { referralActionGeoDecisionSchema } from "@/lib/geo/geo-contracts";
import { getGeo } from "@/lib/geo/get-geo";

const ORIGIN = "https://sairn.ai";
const ALLOWED_IPDATA_RESPONSE = {
	country_code: "GB",
	region_code: "ENG",
	threat: { is_anonymous: false, is_proxy: false, is_tor: false },
};

function ipdataResponse(body: unknown, status = 200): Response {
	return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function geoRequest(): Request {
	return new Request(`${ORIGIN}/api/geo`);
}

function referralRequest(): Request {
	return new Request(`${ORIGIN}/api/referral-geo`, {
		method: "POST",
		headers: { origin: ORIGIN, "sec-fetch-site": "same-origin", "content-type": "application/json" },
		body: JSON.stringify({ override: null }),
	});
}

interface Harness {
	handlers: ReturnType<typeof createGeoApiHandlers>;
	fetchMock: ReturnType<typeof vi.fn>;
	log: ReturnType<typeof vi.fn>;
	setIp: (ip: string | undefined) => void;
	advance: (ms: number) => void;
}

function createHarness(overrides: Partial<GeoApiEnvironment> = {}): Harness {
	let ip: string | undefined = "198.51.100.10";
	let nowMs = 1_000_000;
	const fetchMock = vi.fn(async () => ipdataResponse(ALLOWED_IPDATA_RESPONSE));
	const log = vi.fn();
	const environment = {
		development: false,
		ipdataApiKey: () => "test-ipdata-key",
		resolveClientIp: () => ip,
		fetch: fetchMock as unknown as typeof fetch,
		now: () => nowMs,
		log,
		...overrides,
	} as GeoApiEnvironment;
	return {
		handlers: createGeoApiHandlers(environment),
		fetchMock,
		log,
		setIp: (next) => {
			ip = next;
		},
		advance: (ms) => {
			nowMs += ms;
		},
	};
}

function queriedAddress(fetchMock: ReturnType<typeof vi.fn>, call: number): string {
	const url = new URL(String(fetchMock.mock.calls[call]?.[0]));
	return decodeURIComponent(url.pathname.slice(1));
}

function loggedEvents(log: ReturnType<typeof vi.fn>): Record<string, unknown>[] {
	return log.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
}

describe("geo verdicts per address, lookups per network", () => {
	it("answers one address from a single IPdata lookup, however it is spelled", async () => {
		const harness = createHarness();
		for (const ip of ["2001:db8:aa:1::1", "2001:0db8:00aa:0001:0:0:0:1", "2001:DB8:AA:1::1"]) {
			harness.setIp(ip);
			expect((await harness.handlers.geo(geoRequest())).status).toBe(200);
		}
		expect(harness.fetchMock).toHaveBeenCalledTimes(1);
	});

	it("never hands one address the proxy verdict of a neighbour in its /64", async () => {
		const harness = createHarness();
		harness.setIp("2001:db8:aa:1::1");
		expect(await (await harness.handlers.geo(geoRequest())).json()).toMatchObject({ proxy: false });

		harness.fetchMock.mockResolvedValueOnce(
			ipdataResponse({ ...ALLOWED_IPDATA_RESPONSE, threat: { is_tor: true, is_proxy: true, is_anonymous: true } }),
		);
		harness.setIp("2001:db8:aa:1::2");
		expect(await (await harness.handlers.geo(geoRequest())).json()).toMatchObject({
			proxy: true,
			tradeRestricted: true,
		});
		expect(harness.fetchMock).toHaveBeenCalledTimes(2);
		expect(queriedAddress(harness.fetchMock, 1)).toBe("2001:db8:aa:1::2");
	});

	it("refuses one network that rotates addresses without spending the budget of other visitors", async () => {
		const harness = createHarness();
		const statuses: number[] = [];
		for (let i = 0; i < GEO_NETWORK_BUDGET_BURST + 30; i++) {
			harness.setIp(`2001:db8:cc:${(i + 1).toString(16)}::1`);
			statuses.push((await harness.handlers.geo(geoRequest())).status);
		}
		expect(statuses.filter((status) => status === 200)).toHaveLength(GEO_NETWORK_BUDGET_BURST);
		expect(statuses.slice(GEO_NETWORK_BUDGET_BURST).every((status) => status === 503)).toBe(true);
		expect(harness.fetchMock).toHaveBeenCalledTimes(GEO_NETWORK_BUDGET_BURST);

		harness.setIp("203.0.113.7");
		expect((await harness.handlers.geo(geoRequest())).status).toBe(200);
		harness.setIp("2001:db8:dd:1::1");
		expect((await harness.handlers.geo(geoRequest())).status).toBe(200);
	});

	it("looks up each /64 separately and keeps IPv4 addresses whole", async () => {
		const harness = createHarness();
		for (const ip of ["2001:db8:aa:1::1", "2001:db8:aa:2::1", "198.51.100.10", "198.51.100.11"]) {
			harness.setIp(ip);
			await harness.handlers.geo(geoRequest());
		}
		expect(harness.fetchMock).toHaveBeenCalledTimes(4);
		expect([0, 1, 2, 3].map((call) => queriedAddress(harness.fetchMock, call))).toEqual([
			"2001:db8:aa:1::1",
			"2001:db8:aa:2::1",
			"198.51.100.10",
			"198.51.100.11",
		]);
	});

	it("treats an IPv4-mapped IPv6 address as its IPv4 address", async () => {
		const harness = createHarness();
		harness.setIp("198.51.100.10");
		await harness.handlers.geo(geoRequest());
		harness.setIp("::ffff:198.51.100.10");
		await harness.handlers.geo(geoRequest());
		harness.setIp("::ffff:c633:640b");
		await harness.handlers.geo(geoRequest());
		expect(harness.fetchMock).toHaveBeenCalledTimes(2);
		expect(queriedAddress(harness.fetchMock, 1)).toBe("::ffff:c633:640b");
	});

	it("limits referral decisions per /64 instead of per address", async () => {
		const harness = createHarness();
		for (let i = 0; i < 12; i++) {
			harness.setIp(`2001:db8:bb:1::${(i + 1).toString(16)}`);
			expect((await harness.handlers.referralActionGeo(referralRequest())).status).toBe(200);
		}
		harness.setIp("2001:db8:bb:1::ff");
		expect((await harness.handlers.referralActionGeo(referralRequest())).status).toBe(429);
		harness.setIp("2001:db8:bb:2::1");
		expect((await harness.handlers.referralActionGeo(referralRequest())).status).toBe(200);
	});
});

describe("geo upstream budget per instance", () => {
	async function exhaust(harness: Harness): Promise<void> {
		for (let i = 0; i < BURST; i++) {
			harness.setIp(`2001:db8:${(i + 1).toString(16)}::1`);
			expect((await harness.handlers.geo(geoRequest())).status).toBe(200);
		}
	}

	it("fails closed with an unavailable reason once the budget is spent, and recovers as it refills", async () => {
		const harness = createHarness();
		await exhaust(harness);
		expect(harness.fetchMock).toHaveBeenCalledTimes(BURST);

		harness.setIp("203.0.113.50");
		const rejected = await harness.handlers.geo(geoRequest());
		expect(rejected.status).toBe(503);
		expect(rejected.headers.get("cache-control")).toBe("no-store");
		expect(Number(rejected.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
		await expect(rejected.json()).resolves.toEqual({
			error: "Geo restriction check unavailable",
			reason: "budget_exhausted",
		});
		expect(harness.fetchMock).toHaveBeenCalledTimes(BURST);

		harness.setIp("2001:db8:1::1");
		expect((await harness.handlers.geo(geoRequest())).status).toBe(200);
		expect(harness.fetchMock).toHaveBeenCalledTimes(BURST);

		harness.advance(Math.ceil(60_000 / PER_MINUTE));
		harness.setIp("203.0.113.50");
		expect((await harness.handlers.geo(geoRequest())).status).toBe(200);
		expect(harness.fetchMock).toHaveBeenCalledTimes(BURST + 1);
		harness.setIp("203.0.113.51");
		expect((await harness.handlers.geo(geoRequest())).status).toBe(503);
	});

	it("the client treats a budget rejection as unavailable", async () => {
		const harness = createHarness();
		await exhaust(harness);
		harness.setIp("203.0.113.50");
		const rejected = await harness.handlers.geo(geoRequest());
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rejected));
		try {
			await expect(getGeo({ data: { override: null } })).rejects.toThrow("Geo restriction check unavailable");
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("reports referral decisions as unavailable while the shared budget is spent", async () => {
		const harness = createHarness();
		await exhaust(harness);
		harness.setIp("203.0.113.50");
		const response = await harness.handlers.referralActionGeo(referralRequest());
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		const body = await response.json();
		expect(body).toEqual({ checkedAt: 1_000_000, reason: "budget_exhausted", status: "unavailable" });
		expect(referralActionGeoDecisionSchema.safeParse(body)).toMatchObject({
			success: true,
			data: { status: "unavailable" },
		});
		expect(harness.fetchMock).toHaveBeenCalledTimes(BURST);
	});
});

describe("geo failure logs", () => {
	it("writes one JSON line per failure with the reason, upstream status and a prefix, never the address or key", async () => {
		const harness = createHarness({
			fetch: vi.fn(async () => ipdataResponse({ message: "quota" }, 403)) as unknown as typeof fetch,
		});
		harness.setIp("198.51.100.77");
		const response = await harness.handlers.geo(geoRequest());
		expect(response.status).toBe(503);
		expect(response.headers.get("cache-control")).toBe("no-store");

		harness.setIp("2001:db8:cc:1:2:3:4:5");
		await harness.handlers.referralActionGeo(referralRequest());

		expect(harness.log).toHaveBeenCalledTimes(2);
		const [geoLine, referralLine] = loggedEvents(harness.log);
		expect(geoLine).toEqual({
			event: "geo_lookup_failure",
			route: "geo",
			reason: "provider_error",
			cacheHit: false,
			upstreamStatus: 403,
			clientPrefix: "198.51.100.0/24",
		});
		expect(referralLine).toMatchObject({
			event: "geo_lookup_failure",
			route: "referral-geo",
			reason: "provider_error",
			upstreamStatus: 403,
			clientPrefix: "2001:db8:cc::/48",
		});
		const raw = harness.log.mock.calls.map((call) => String(call[0])).join("\n");
		expect(raw).not.toContain("198.51.100.77");
		expect(raw).not.toContain("2001:db8:cc:1");
		expect(raw).not.toContain("test-ipdata-key");
	});

	it("logs configuration, network and budget failures and stays quiet on success", async () => {
		const missingKey = createHarness({ ipdataApiKey: () => undefined });
		await missingKey.handlers.geo(geoRequest());
		expect(loggedEvents(missingKey.log)).toEqual([
			expect.objectContaining({ reason: "missing_config", upstreamStatus: null }),
		]);

		const missingIp = createHarness();
		missingIp.setIp(undefined);
		await missingIp.handlers.geo(geoRequest());
		expect(loggedEvents(missingIp.log)).toEqual([
			expect.objectContaining({ reason: "missing_ip", clientPrefix: null }),
		]);

		const network = createHarness({ fetch: vi.fn().mockRejectedValue(new Error("boom")) });
		await network.handlers.geo(geoRequest());
		expect(loggedEvents(network.log)).toEqual([
			expect.objectContaining({ reason: "provider_error", upstreamStatus: null }),
		]);

		const quiet = createHarness();
		await quiet.handlers.geo(geoRequest());
		await quiet.handlers.geo(geoRequest());
		expect(quiet.log).not.toHaveBeenCalled();

		const exhausted = createHarness();
		for (let i = 0; i < BURST; i++) {
			exhausted.setIp(`2001:db8:${(i + 1).toString(16)}::1`);
			await exhausted.handlers.geo(geoRequest());
		}
		exhausted.setIp("203.0.113.50");
		await exhausted.handlers.geo(geoRequest());
		expect(loggedEvents(exhausted.log)).toEqual([
			expect.objectContaining({ reason: "budget_exhausted", clientPrefix: "203.0.113.0/24" }),
		]);
	});

	it("caps failure lines per minute and reports how many were dropped", async () => {
		const harness = createHarness({ ipdataApiKey: () => undefined });
		for (let i = 0; i < 200; i++) await harness.handlers.geo(geoRequest());
		const capped = harness.log.mock.calls.length;
		expect(capped).toBeLessThan(200);
		harness.advance(60_000);
		await harness.handlers.geo(geoRequest());
		const last = loggedEvents(harness.log).at(-1);
		expect(last).toMatchObject({ reason: "missing_config", suppressed: 200 - capped });
	});
});

describe("client IP keys", () => {
	it("keeps IPv4 whole, folds IPv6 to its /64 and unwraps IPv4-mapped addresses", () => {
		expect(toClientIpKey("198.51.100.10")).toEqual({
			key: "198.51.100.10",
			exact: "198.51.100.10",
			network: "198.51.100.0/24",
			logPrefix: "198.51.100.0/24",
		});
		expect(toClientIpKey("::ffff:198.51.100.10")).toEqual(toClientIpKey("198.51.100.10"));
		expect(toClientIpKey("::FFFF:C633:640A")).toEqual(toClientIpKey("198.51.100.10"));
		expect(toClientIpKey("2001:0DB8:0:1:aaaa:bbbb:cccc:dddd")).toEqual({
			key: "2001:db8:0:1::/64",
			exact: "2001:db8:0:1:aaaa:bbbb:cccc:dddd",
			network: "2001:db8:0::/48",
			logPrefix: "2001:db8:0::/48",
		});
		expect(toClientIpKey("2001:db8::1").key).toBe("2001:db8:0:0::/64");
		expect(toClientIpKey("fe80::1%eth0").key).toBe("fe80:0:0:0::/64");
		expect(toClientIpKey("2001:db8:0:2::1").key).not.toBe(toClientIpKey("2001:db8:0:1::1").key);
	});

	it("never merges unparseable values with real addresses", () => {
		for (const value of ["999.1.1.1", "2001:db8::1::2", "1:2:3:4:5:6:7:8:9", "not-an-ip", "12345::"]) {
			const raw = `raw:${value.toLowerCase()}`;
			expect(toClientIpKey(value)).toEqual({ key: raw, exact: raw, network: raw, logPrefix: null });
		}
	});
});
