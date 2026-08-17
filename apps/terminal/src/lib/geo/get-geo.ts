import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { type GeoVerdict, isTradeRestricted } from "@/config/geo";
import { parseIpdataGeoResponse } from "@/lib/geo/ipdata-geo";

const IPDATA_BASE = "https://api.ipdata.co";
const CACHE_TTL_MS = 10 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 5_000;

const cache = new Map<string, { verdict: GeoVerdict; atMs: number }>();

async function lookupIpData(ip: string, apiKey: string): Promise<GeoVerdict> {
	const response = await fetch(
		`${IPDATA_BASE}/${encodeURIComponent(ip)}?api-key=${apiKey}&fields=country_code,region_code,threat`,
		{ signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
	);
	if (!response.ok) throw new Error(`ipdata ${response.status}`);
	const parsed = parseIpdataGeoResponse(await response.json());
	if (!parsed) throw new Error("Invalid IPdata response");
	return { country: parsed.country, tradeRestricted: parsed.tradeRestricted, proxy: parsed.proxy };
}

// Resolves the visitor's jurisdiction server-side: the client IP never leaves the server and
// the API key stays out of the client bundle. Browsing is never blocked — this only tells the
// client whether to allow trading. An undetermined lookup fails closed for funds actions while
// browsing remains available. In dev, an `override` of "US" or "CA-ON" (country or
// country-region) can be passed to simulate a jurisdiction.
export const getGeo = createServerFn({ method: "GET" })
	.validator((input: { override?: string | null } | undefined): { override: string | null } => ({
		override: input?.override ?? null,
	}))
	.handler(async ({ data }): Promise<GeoVerdict> => {
		if (import.meta.env.DEV && data.override) {
			const [country, region] = data.override.toUpperCase().split("-");
			return { country, tradeRestricted: isTradeRestricted(country, region), proxy: false };
		}

		const apiKey = process.env.IPDATA_API_KEY;
		const ip = getRequestIP({ xForwardedFor: true });
		if (!apiKey || !ip) throw new Error("Geo restriction check unavailable");

		const now = Date.now();
		const cached = cache.get(ip);
		if (cached && now - cached.atMs < CACHE_TTL_MS) return cached.verdict;

		const verdict = await lookupIpData(ip, apiKey);
		cache.set(ip, { verdict, atMs: now });
		return verdict;
	});
