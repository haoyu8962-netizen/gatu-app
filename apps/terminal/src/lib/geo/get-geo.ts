import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { type GeoVerdict, isTradeRestricted } from "@/config/geo";

const IPDATA_BASE = "https://api.ipdata.co";
const CACHE_TTL_MS = 10 * 60 * 1000;
const UNKNOWN: GeoVerdict = { country: null, tradeRestricted: false, proxy: false };

const cache = new Map<string, { verdict: GeoVerdict; atMs: number }>();

interface IpDataResponse {
	country_code?: string;
	region_code?: string;
	threat?: { is_proxy?: boolean; is_tor?: boolean; is_anonymous?: boolean };
}

async function lookupIpData(ip: string, apiKey: string): Promise<GeoVerdict> {
	const response = await fetch(
		`${IPDATA_BASE}/${encodeURIComponent(ip)}?api-key=${apiKey}&fields=country_code,region_code,threat`,
	);
	if (!response.ok) throw new Error(`ipdata ${response.status}`);
	const data = (await response.json()) as IpDataResponse;
	const country = data.country_code ?? null;
	const region = data.region_code ?? null;
	const proxy = Boolean(data.threat?.is_proxy || data.threat?.is_tor || data.threat?.is_anonymous);
	return { country, tradeRestricted: isTradeRestricted(country, region) || proxy, proxy };
}

// Resolves the visitor's jurisdiction server-side: the client IP never leaves the server and
// the API key stays out of the client bundle. Browsing is never blocked — this only tells the
// client whether to allow trading. Fails open (undetermined → not restricted); switch to
// fail-closed if compliance requires. In dev, an `override` of "US" or "CA-ON" (country or
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
		if (!apiKey || !ip) return UNKNOWN;

		const now = Date.now();
		const cached = cache.get(ip);
		if (cached && now - cached.atMs < CACHE_TTL_MS) return cached.verdict;

		try {
			const verdict = await lookupIpData(ip, apiKey);
			cache.set(ip, { verdict, atMs: now });
			return verdict;
		} catch {
			return UNKNOWN;
		}
	});
