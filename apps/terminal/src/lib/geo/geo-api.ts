import { isSameOriginRequest, readBoundedBody } from "@/lib/error-reporting/server";
import { toClientIpKey } from "@/lib/geo/client-ip-key";
import { resolveDevelopmentGeoVerdict } from "@/lib/geo/development-geo";
import {
	createDevelopmentReferralActionGeoDecision,
	deriveReferralActionGeoDecisionFromParsed,
	type GeoUnavailableReason,
	type ReferralActionGeoDecision,
	toGeoVerdict,
} from "@/lib/geo/geo-contracts";
import { type ParsedIpdataGeo, parseIpdataGeoResponse } from "@/lib/geo/ipdata-geo";
import { createUpstreamBudget, type UpstreamBudget } from "@/lib/geo/upstream-budget";
import { createFixedWindowIpLimiter } from "@/lib/server/fixed-window-ip-limiter";

const IPDATA_BASE = "https://api.ipdata.co";
const GEO_CACHE_TTL_MS = 10 * 60 * 1000;
const GEO_CACHE_MAX_ENTRIES = 5_000;
const GEO_LOOKUP_TIMEOUT_MS = 5_000;
// Referral decisions bypass the verdict cache on purpose; this caps what one client can make IPdata answer.
const REFERRAL_GEO_LIMIT_PER_WINDOW = 12;
const REFERRAL_GEO_WINDOW_MS = 60_000;
const REFERRAL_GEO_LIMITER_MAX_ENTRIES = 5_000;
const REFERRAL_GEO_BODY_MAX_BYTES = 1_024;
/**
 * IPdata lookups each instance may start on cache misses, shared by both routes. A Lambda instance
 * serves one request at a time and an uncached lookup takes ~0.1-0.5 s, so a flood can drive one
 * instance to several hundred lookups a minute; ordinary visitors make one lookup per /64 per cache
 * TTL. Set generously (two a second, a two-minute burst) until live traffic says otherwise.
 */
export const GEO_UPSTREAM_BUDGET_BURST = 120;
export const GEO_UPSTREAM_BUDGET_PER_MINUTE = 120;
/**
 * Lookups one network (IPv4 /24, IPv6 /48) may cause per instance before it alone is refused, so one network
 * that rotates addresses cannot spend the budget every other visitor depends on.
 */
export const GEO_NETWORK_BUDGET_BURST = 20;
export const GEO_NETWORK_BUDGET_PER_MINUTE = 20;
const GEO_NETWORK_BUDGETS_MAX = 5_000;
/** Failure log lines per instance per minute; the next line after a full window counts the dropped ones. */
export const GEO_FAILURE_LOGS_PER_MINUTE = 60;
const NO_STORE_HEADERS = { "cache-control": "no-store" } as const;

export type GeoApiUnavailableReason = GeoUnavailableReason;

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
	/** Receives one JSON line per failed lookup; defaults to `console.warn`. */
	log?: (line: string) => void;
}

export interface GeoApiHandlers {
	geo: (request: Request) => Promise<Response>;
	referralActionGeo: (request: Request) => Promise<Response>;
}

type GeoRoute = "geo" | "referral-geo";
type ProviderFailure = {
	reason: GeoApiUnavailableReason;
	clientPrefix: string | null;
	upstreamStatus: number | null;
	retryAfterSeconds?: number;
};
type ProviderLookup = { parsed: ParsedIpdataGeo } | ProviderFailure;
type CacheEntry = { parsed: ParsedIpdataGeo; atMs: number };

function readOverride(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
	return Response.json(body, { status, headers: { ...NO_STORE_HEADERS, ...extraHeaders } });
}

function methodNotAllowed(allow: string): Response {
	return Response.json({ error: "Method not allowed" }, { status: 405, headers: { ...NO_STORE_HEADERS, allow } });
}

async function readJsonBody(
	request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
	const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
	try {
		const text = await readBoundedBody(request, REFERRAL_GEO_BODY_MAX_BYTES);
		if (text === null) return { ok: false, status: 413 };
		if (!contentType.startsWith("application/json")) return { ok: true, value: undefined };
		return { ok: true, value: text.trim() === "" ? undefined : JSON.parse(text) };
	} catch {
		return { ok: false, status: 400 };
	}
}

function readBodyOverride(value: unknown): string | null {
	if (typeof value !== "object" || value === null) return null;
	return readOverride((value as { override?: unknown }).override);
}

function pruneCache(cache: Map<string, CacheEntry>, nowMs: number): void {
	if (cache.size < GEO_CACHE_MAX_ENTRIES) return;
	for (const [key, entry] of cache) {
		if (nowMs - entry.atMs >= GEO_CACHE_TTL_MS) cache.delete(key);
	}
	if (cache.size < GEO_CACHE_MAX_ENTRIES) return;
	const oldest = cache.keys().next();
	if (!oldest.done) cache.delete(oldest.value);
}

export function createGeoApiHandlers(environment: GeoApiEnvironment): GeoApiHandlers {
	const cache = new Map<string, CacheEntry>();
	const referralLimiter = createFixedWindowIpLimiter({
		limit: REFERRAL_GEO_LIMIT_PER_WINDOW,
		windowMs: REFERRAL_GEO_WINDOW_MS,
		maxEntries: REFERRAL_GEO_LIMITER_MAX_ENTRIES,
	});
	const upstreamBudget = createUpstreamBudget({
		burst: GEO_UPSTREAM_BUDGET_BURST,
		perMinute: GEO_UPSTREAM_BUDGET_PER_MINUTE,
	});
	const networkBudgets = new Map<string, UpstreamBudget>();
	const now = environment.now ?? Date.now;
	const log = environment.log ?? ((line: string) => console.warn(line));
	let logWindowStartedAtMs = Number.NEGATIVE_INFINITY;
	let logsInWindow = 0;
	let suppressedLogs = 0;

	function logFailure(route: GeoRoute, failure: ProviderFailure, nowMs: number): void {
		if (nowMs - logWindowStartedAtMs >= 60_000 || nowMs < logWindowStartedAtMs) {
			logWindowStartedAtMs = nowMs;
			logsInWindow = 0;
		}
		if (logsInWindow >= GEO_FAILURE_LOGS_PER_MINUTE) {
			suppressedLogs += 1;
			return;
		}
		logsInWindow += 1;
		const suppressed = suppressedLogs;
		suppressedLogs = 0;
		log(
			JSON.stringify({
				event: "geo_lookup_failure",
				route,
				reason: failure.reason,
				cacheHit: false,
				upstreamStatus: failure.upstreamStatus,
				clientPrefix: failure.clientPrefix,
				...(suppressed > 0 ? { suppressed } : {}),
			}),
		);
	}

	function fetchIpdata(ip: string, apiKey: string, init: RequestInit): Promise<Response> {
		const fetchImplementation = environment.fetch ?? globalThis.fetch;
		return fetchImplementation(
			`${IPDATA_BASE}/${encodeURIComponent(ip)}?api-key=${apiKey}&fields=country_code,region_code,threat`,
			{ ...init, signal: AbortSignal.timeout(GEO_LOOKUP_TIMEOUT_MS) },
		);
	}

	async function lookupProvider(request: Request, useCache: boolean, nowMs: number): Promise<ProviderLookup> {
		const apiKey = environment.ipdataApiKey();
		const ip = environment.resolveClientIp(request);
		const clientKey = ip ? toClientIpKey(ip) : undefined;
		const clientPrefix = clientKey?.logPrefix ?? null;
		if (!apiKey) return { reason: "missing_config", clientPrefix, upstreamStatus: null };
		if (!ip || !clientKey) return { reason: "missing_ip", clientPrefix, upstreamStatus: null };

		if (useCache) {
			const cached = cache.get(clientKey.exact);
			if (cached && nowMs - cached.atMs < GEO_CACHE_TTL_MS) return { parsed: cached.parsed };
		}

		let networkBudget = networkBudgets.get(clientKey.network);
		if (!networkBudget) {
			if (networkBudgets.size >= GEO_NETWORK_BUDGETS_MAX) networkBudgets.clear();
			networkBudget = createUpstreamBudget({
				burst: GEO_NETWORK_BUDGET_BURST,
				perMinute: GEO_NETWORK_BUDGET_PER_MINUTE,
			});
			networkBudgets.set(clientKey.network, networkBudget);
		}
		const networkAllowance = networkBudget.take(nowMs);
		const budget = networkAllowance.allowed ? upstreamBudget.take(nowMs) : networkAllowance;
		if (!budget.allowed) {
			return {
				reason: "budget_exhausted",
				clientPrefix,
				upstreamStatus: null,
				retryAfterSeconds: budget.retryAfterSeconds,
			};
		}

		// IPdata answers for the exact address it is given, and its proxy flags belong to that address,
		// so the verdict is looked up and cached per address; only the limiter keys are widened.
		let payload: unknown;
		let upstreamStatus: number | null = null;
		try {
			const response = await fetchIpdata(ip, apiKey, useCache ? {} : { cache: "no-store" });
			upstreamStatus = response.status;
			if (!response.ok) return { reason: "provider_error", clientPrefix, upstreamStatus };
			payload = await response.json();
		} catch {
			return { reason: "provider_error", clientPrefix, upstreamStatus };
		}

		const parsed = parseIpdataGeoResponse(payload);
		if (!parsed) return { reason: "invalid_response", clientPrefix, upstreamStatus };
		if (useCache) {
			pruneCache(cache, nowMs);
			cache.set(clientKey.exact, { parsed, atMs: nowMs });
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

		const nowMs = now();
		const lookup = await lookupProvider(request, true, nowMs);
		if ("reason" in lookup) {
			logFailure("geo", lookup, nowMs);
			const retryAfter: Record<string, string> =
				lookup.retryAfterSeconds === undefined ? {} : { "retry-after": String(lookup.retryAfterSeconds) };
			return jsonResponse({ error: "Geo restriction check unavailable", reason: lookup.reason }, 503, retryAfter);
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
		if (clientIp && !referralLimiter.consume(toClientIpKey(clientIp).key, checkedAt).allowed) {
			return jsonResponse({ error: "Too many requests" }, 429);
		}

		if (environment.development) {
			return jsonResponse(createDevelopmentReferralActionGeoDecision(override, checkedAt));
		}

		const lookup = await lookupProvider(request, false, checkedAt);
		if ("reason" in lookup) {
			logFailure("referral-geo", lookup, checkedAt);
			const decision: ReferralActionGeoDecision = { checkedAt, reason: lookup.reason, status: "unavailable" };
			return jsonResponse(decision);
		}
		return jsonResponse(deriveReferralActionGeoDecisionFromParsed(lookup.parsed, checkedAt));
	}

	return { geo, referralActionGeo };
}
