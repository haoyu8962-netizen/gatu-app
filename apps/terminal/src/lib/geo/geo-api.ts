import { isSameOriginRequest, readBoundedBody } from "@/lib/error-reporting/server";
import { resolveDevelopmentGeoVerdict } from "@/lib/geo/development-geo";
import {
	createDevelopmentReferralActionGeoDecision,
	deriveReferralActionGeoDecisionFromParsed,
	type ReferralActionGeoDecision,
	toGeoVerdict,
} from "@/lib/geo/geo-contracts";
import { type ParsedIpdataGeo, parseIpdataGeoResponse } from "@/lib/geo/ipdata-geo";

const IPDATA_BASE = "https://api.ipdata.co";
const GEO_CACHE_TTL_MS = 10 * 60 * 1000;
const GEO_CACHE_MAX_ENTRIES = 5_000;
const GEO_LOOKUP_TIMEOUT_MS = 5_000;
// Referral decisions bypass the verdict cache on purpose; this caps what one client can make IPdata answer.
const REFERRAL_GEO_LIMIT_PER_WINDOW = 12;
const REFERRAL_GEO_WINDOW_MS = 60_000;
const REFERRAL_GEO_LIMITER_MAX_ENTRIES = 5_000;
const REFERRAL_GEO_BODY_MAX_BYTES = 1_024;
const NO_STORE_HEADERS = { "cache-control": "no-store" } as const;

export type GeoApiUnavailableReason = "invalid_response" | "missing_config" | "missing_ip" | "provider_error";

/**
 * Everything the handlers need from the host runtime. A Nitro route, a Cloudflare Worker or a
 * Lambda adapter supplies these; the handlers themselves only use Web-standard APIs.
 */
export interface GeoApiEnvironment {
	/** True only for local development servers: enables `override` and the default GB verdict. */
	development: boolean;
	/** Read per request so a host that injects secrets after module evaluation still works. */
	ipdataApiKey: () => string | undefined;
	/** The caller's IP as established by the trusted proxy chain; undefined when unavailable. */
	resolveClientIp: (request: Request) => string | undefined;
	fetch?: typeof globalThis.fetch;
	now?: () => number;
}

export interface GeoApiHandlers {
	geo: (request: Request) => Promise<Response>;
	referralActionGeo: (request: Request) => Promise<Response>;
}

type ProviderLookup = { parsed: ParsedIpdataGeo } | { reason: GeoApiUnavailableReason };
type CacheEntry = { parsed: ParsedIpdataGeo; atMs: number };
type LimiterEntry = { windowStartedAtMs: number; count: number };

function readOverride(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function jsonResponse(body: unknown, status = 200): Response {
	return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

function methodNotAllowed(allow: string): Response {
	return Response.json({ error: "Method not allowed" }, { status: 405, headers: { ...NO_STORE_HEADERS, allow } });
}

async function readJsonBody(
	request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
	const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
	if (!contentType.startsWith("application/json")) return { ok: true, value: undefined };
	try {
		const text = await readBoundedBody(request, REFERRAL_GEO_BODY_MAX_BYTES);
		if (text === null) return { ok: false, status: 413 };
		return { ok: true, value: text.trim() === "" ? undefined : JSON.parse(text) };
	} catch {
		return { ok: false, status: 400 };
	}
}

function consumeReferralGeoBudget(limiter: Map<string, LimiterEntry>, ip: string, nowMs: number): boolean {
	const entry = limiter.get(ip);
	if (!entry || nowMs - entry.windowStartedAtMs >= REFERRAL_GEO_WINDOW_MS || nowMs < entry.windowStartedAtMs) {
		if (limiter.size >= REFERRAL_GEO_LIMITER_MAX_ENTRIES) {
			for (const [key, value] of limiter) {
				if (nowMs - value.windowStartedAtMs >= REFERRAL_GEO_WINDOW_MS) limiter.delete(key);
			}
			if (limiter.size >= REFERRAL_GEO_LIMITER_MAX_ENTRIES) {
				const oldest = limiter.keys().next();
				if (!oldest.done) limiter.delete(oldest.value);
			}
		}
		limiter.set(ip, { windowStartedAtMs: nowMs, count: 1 });
		return true;
	}
	if (entry.count >= REFERRAL_GEO_LIMIT_PER_WINDOW) return false;
	entry.count += 1;
	return true;
}

function readBodyOverride(value: unknown): string | null {
	if (typeof value !== "object" || value === null) return null;
	return readOverride((value as { override?: unknown }).override);
}

function pruneCache(cache: Map<string, CacheEntry>, nowMs: number): void {
	if (cache.size < GEO_CACHE_MAX_ENTRIES) return;
	for (const [ip, entry] of cache) {
		if (nowMs - entry.atMs >= GEO_CACHE_TTL_MS) cache.delete(ip);
	}
	if (cache.size < GEO_CACHE_MAX_ENTRIES) return;
	const oldest = cache.keys().next();
	if (!oldest.done) cache.delete(oldest.value);
}

export function createGeoApiHandlers(environment: GeoApiEnvironment): GeoApiHandlers {
	const cache = new Map<string, CacheEntry>();
	const referralLimiter = new Map<string, LimiterEntry>();
	const now = environment.now ?? Date.now;

	function fetchIpdata(ip: string, apiKey: string, init: RequestInit): Promise<Response> {
		const fetchImplementation = environment.fetch ?? globalThis.fetch;
		return fetchImplementation(
			`${IPDATA_BASE}/${encodeURIComponent(ip)}?api-key=${apiKey}&fields=country_code,region_code,threat`,
			{ ...init, signal: AbortSignal.timeout(GEO_LOOKUP_TIMEOUT_MS) },
		);
	}

	async function lookupProvider(request: Request, useCache: boolean): Promise<ProviderLookup> {
		const apiKey = environment.ipdataApiKey();
		if (!apiKey) return { reason: "missing_config" };
		const ip = environment.resolveClientIp(request);
		if (!ip) return { reason: "missing_ip" };

		const nowMs = now();
		if (useCache) {
			const cached = cache.get(ip);
			if (cached && nowMs - cached.atMs < GEO_CACHE_TTL_MS) return { parsed: cached.parsed };
		}

		let payload: unknown;
		try {
			const response = await fetchIpdata(ip, apiKey, useCache ? {} : { cache: "no-store" });
			if (!response.ok) return { reason: "provider_error" };
			payload = await response.json();
		} catch {
			return { reason: "provider_error" };
		}

		const parsed = parseIpdataGeoResponse(payload);
		if (!parsed) return { reason: "invalid_response" };
		if (useCache) {
			pruneCache(cache, nowMs);
			cache.set(ip, { parsed, atMs: nowMs });
		}
		return { parsed };
	}

	async function geo(request: Request): Promise<Response> {
		if (request.method !== "GET") return methodNotAllowed("GET");
		const override = readOverride(new URL(request.url).searchParams.get("override"));

		if (environment.development) {
			const verdict = resolveDevelopmentGeoVerdict({ enabled: true, override });
			if (!verdict) return jsonResponse({ error: "Invalid development geo override", reason: "invalid_override" }, 400);
			return jsonResponse(verdict);
		}

		const lookup = await lookupProvider(request, true);
		if ("reason" in lookup) {
			return jsonResponse({ error: "Geo restriction check unavailable", reason: lookup.reason }, 503);
		}
		return jsonResponse(toGeoVerdict(lookup.parsed));
	}

	async function referralActionGeo(request: Request): Promise<Response> {
		if (request.method !== "POST") return methodNotAllowed("POST");
		if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
		const body = await readJsonBody(request);
		if (!body.ok) {
			return jsonResponse(
				{ error: body.status === 413 ? "Request body too large" : "Invalid request body" },
				body.status,
			);
		}
		const override = readBodyOverride(body.value);
		const checkedAt = now();
		const clientIp = environment.resolveClientIp(request);
		if (clientIp && !consumeReferralGeoBudget(referralLimiter, clientIp, checkedAt)) {
			return jsonResponse({ error: "Too many requests" }, 429);
		}

		if (environment.development) {
			return jsonResponse(createDevelopmentReferralActionGeoDecision(override, checkedAt));
		}

		const lookup = await lookupProvider(request, false);
		if ("reason" in lookup) {
			const decision: ReferralActionGeoDecision = { checkedAt, reason: lookup.reason, status: "unavailable" };
			return jsonResponse(decision);
		}
		return jsonResponse(deriveReferralActionGeoDecisionFromParsed(lookup.parsed, checkedAt));
	}

	return { geo, referralActionGeo };
}
