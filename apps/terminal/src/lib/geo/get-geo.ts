import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { type GeoVerdict, isTradeRestrictedCountry } from "@/config/geo";

const IPDATA_BASE = "https://api.ipdata.co";
const CACHE_TTL_MS = 10 * 60 * 1000;
const UNKNOWN: GeoVerdict = { country: null, tradeRestricted: false, proxy: false };

const cache = new Map<string, { verdict: GeoVerdict; atMs: number }>();

interface IpDataResponse {
	country_code?: string;
	threat?: { is_proxy?: boolean; is_tor?: boolean; is_anonymous?: boolean };
}

async function lookupIpData(ip: string, apiKey: string): Promise<GeoVerdict> {
	const response = await fetch(`${IPDATA_BASE}/${encodeURIComponent(ip)}?api-key=${apiKey}&fields=country_code,threat`);
	if (!response.ok) throw new Error(`ipdata ${response.status}`);
	const data = (await response.json()) as IpDataResponse;
	const country = data.country_code ?? null;
	const proxy = Boolean(data.threat?.is_proxy || data.threat?.is_tor || data.threat?.is_anonymous);
	return { country, tradeRestricted: isTradeRestrictedCountry(country) || proxy, proxy };
}

// Resolves the visitor's jurisdiction server-side: the client IP never leaves the server and
// the API key stays out of the client bundle. Browsing is never blocked — this only tells the
// client whether to allow trading. Fails open (undetermined → not restricted); switch to
// fail-closed if compliance requires. In dev, an `override` country can be passed to simulate.
export const getGeo = createServerFn({ method: "GET" })
	.inputValidator((input: { override?: string | null } | undefined): { override: string | null } => ({
		override: input?.override ?? null,
	}))
	.handler(async ({ data }): Promise<GeoVerdict> => {
		if (import.meta.env.DEV && data.override) {
			const country = data.override.toUpperCase();
			return { country, tradeRestricted: isTradeRestrictedCountry(country), proxy: false };
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
