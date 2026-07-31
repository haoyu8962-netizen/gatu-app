import { MOBILE_SYNC_TICKET_TTL_MS } from "./one-time-ticket-policy";
import { MOBILE_SYNC_CLOCK_SKEW_MS, MOBILE_SYNC_PAYLOAD_TTL_MS } from "./sync-core";

const MOBILE_SYNC_TICKET_TOMBSTONE_TTL_MS = MOBILE_SYNC_PAYLOAD_TTL_MS + MOBILE_SYNC_CLOCK_SKEW_MS;
const MOBILE_SYNC_TICKET_MAX_BYTES = 256;
const MOBILE_SYNC_TICKET_MAX_ENTRIES = 20_000;
const MOBILE_SYNC_TICKET_RATE_WINDOW_MS = 60_000;
const MOBILE_SYNC_REGISTER_RATE_LIMIT = 20;
const MOBILE_SYNC_CONSUME_RATE_LIMIT = 60;
const MOBILE_SYNC_RATE_BUCKET_LIMIT = 4_096;
const SYNC_ID_RE = /^[A-Za-z0-9_-]{22}$/;
const CONSUMER_ID_RE = /^[0-9a-f]{32}$/;

type TicketStoreResult = "accepted" | "rejected" | "missing" | "full";
type TicketRegistrationStoreResult = { status: "accepted"; expiresAtMs: number } | { status: "rejected" | "full" };

interface MobileSyncTicket {
	consumerId: string | null;
	consumeExpiresAtMs: number;
	tombstoneExpiresAtMs: number;
}

export interface MobileSyncTicketStore {
	register(syncId: string, nowMs: number): TicketRegistrationStoreResult;
	consume(syncId: string, consumerId: string, nowMs: number): TicketStoreResult;
}

type MobileSyncTicketOperation = "register" | "consume";

interface MobileSyncTicketRateLimiter {
	consume(
		sourceKey: string,
		operation: MobileSyncTicketOperation,
		nowMs: number,
	): { allowed: boolean; retryAfterSeconds: number };
}

interface HandleMobileSyncTicketOptions {
	now?: () => number;
	store?: MobileSyncTicketStore;
	rateLimiter?: MobileSyncTicketRateLimiter;
	sourceKey?: string | null;
}

const serverTicketStore = createMobileSyncTicketStore();
const serverRateLimiter = createMobileSyncTicketRateLimiter(
	MOBILE_SYNC_REGISTER_RATE_LIMIT,
	MOBILE_SYNC_CONSUME_RATE_LIMIT,
	MOBILE_SYNC_TICKET_RATE_WINDOW_MS,
);

export async function handleMobileSyncTicket(
	request: Request,
	options: HandleMobileSyncTicketOptions = {},
): Promise<Response> {
	if (!isSameOriginRequest(request)) return responseWithStatus(403);
	if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
		return responseWithStatus(415);
	}

	const declaredLength = parseDeclaredContentLength(request.headers.get("content-length"));
	if (declaredLength === null) return responseWithStatus(400);
	if (declaredLength !== undefined && declaredLength > MOBILE_SYNC_TICKET_MAX_BYTES) {
		return responseWithStatus(413);
	}

	const body = await readJsonBody(request);
	if (!body) return responseWithStatus(400);

	const parsedRequest = parseTicketRequest(body);
	if (!parsedRequest) return responseWithStatus(400);
	const sourceKey = normalizeSourceKey(options.sourceKey);
	if (!sourceKey) return responseWithStatus(503, { "retry-after": "60" });

	const nowMs = (options.now ?? Date.now)();
	const rateLimit = (options.rateLimiter ?? serverRateLimiter).consume(sourceKey, parsedRequest.operation, nowMs);
	if (!rateLimit.allowed) {
		return responseWithStatus(429, { "retry-after": String(rateLimit.retryAfterSeconds) });
	}

	const store = options.store ?? serverTicketStore;
	if (parsedRequest.operation === "register") {
		return ticketRegistrationResultResponse(store.register(parsedRequest.syncId, nowMs), nowMs);
	}
	return ticketResultResponse(store.consume(parsedRequest.syncId, parsedRequest.consumerId, nowMs));
}

export function createMobileSyncTicketStore(
	maxEntries = MOBILE_SYNC_TICKET_MAX_ENTRIES,
	ttlMs = MOBILE_SYNC_TICKET_TTL_MS,
): MobileSyncTicketStore {
	const tickets = new Map<string, MobileSyncTicket>();

	function removeExpiredTombstones(nowMs: number) {
		for (const [syncId, ticket] of tickets) {
			if (ticket.tombstoneExpiresAtMs <= nowMs) tickets.delete(syncId);
		}
	}

	return {
		register(syncId, nowMs) {
			removeExpiredTombstones(nowMs);
			const existing = tickets.get(syncId);
			if (existing) {
				return existing.consumerId === null && existing.consumeExpiresAtMs > nowMs
					? { status: "accepted", expiresAtMs: existing.consumeExpiresAtMs }
					: { status: "rejected" };
			}
			if (tickets.size >= maxEntries) return { status: "full" };
			const expiresAtMs = nowMs + ttlMs;
			tickets.set(syncId, {
				consumerId: null,
				consumeExpiresAtMs: expiresAtMs,
				tombstoneExpiresAtMs: nowMs + MOBILE_SYNC_TICKET_TOMBSTONE_TTL_MS,
			});
			return { status: "accepted", expiresAtMs };
		},
		consume(syncId, consumerId, nowMs) {
			removeExpiredTombstones(nowMs);
			const ticket = tickets.get(syncId);
			if (!ticket) return "missing";
			if (ticket.consumerId === null) {
				if (ticket.consumeExpiresAtMs <= nowMs) return "missing";
				ticket.consumerId = consumerId;
				return "accepted";
			}
			return ticket.consumerId === consumerId ? "accepted" : "rejected";
		},
	};
}

export function createMobileSyncTicketRateLimiter(
	registerLimit: number,
	consumeLimit: number,
	windowMs: number,
): MobileSyncTicketRateLimiter {
	const buckets = new Map<string, { windowStartedAtMs: number; requestsInWindow: number }>();

	return {
		consume(sourceKey, operation, nowMs) {
			const bucketKey = `${operation}:${sourceKey}`;
			let bucket = buckets.get(bucketKey);
			if (!bucket || nowMs < bucket.windowStartedAtMs || nowMs - bucket.windowStartedAtMs >= windowMs) {
				for (const [key, candidate] of buckets) {
					if (nowMs < candidate.windowStartedAtMs || nowMs - candidate.windowStartedAtMs >= windowMs) {
						buckets.delete(key);
					}
				}
				if (!bucket && buckets.size >= MOBILE_SYNC_RATE_BUCKET_LIMIT) {
					return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1_000)) };
				}
				bucket = { windowStartedAtMs: nowMs, requestsInWindow: 0 };
				buckets.set(bucketKey, bucket);
			}
			const limit = operation === "register" ? registerLimit : consumeLimit;
			if (bucket.requestsInWindow >= limit) {
				return {
					allowed: false,
					retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowStartedAtMs + windowMs - nowMs) / 1_000)),
				};
			}
			bucket.requestsInWindow += 1;
			return { allowed: true, retryAfterSeconds: 0 };
		},
	};
}

function parseTicketRequest(
	value: Record<string, unknown>,
): { operation: "register"; syncId: string } | { operation: "consume"; syncId: string; consumerId: string } | null {
	if (
		value.operation === "register" &&
		typeof value.syncId === "string" &&
		SYNC_ID_RE.test(value.syncId) &&
		hasExactKeys(value, ["operation", "syncId"])
	) {
		return { operation: "register", syncId: value.syncId };
	}
	if (
		value.operation === "consume" &&
		typeof value.syncId === "string" &&
		SYNC_ID_RE.test(value.syncId) &&
		typeof value.consumerId === "string" &&
		CONSUMER_ID_RE.test(value.consumerId) &&
		hasExactKeys(value, ["consumerId", "operation", "syncId"])
	) {
		return { operation: "consume", syncId: value.syncId, consumerId: value.consumerId };
	}
	return null;
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
	const actualKeys = Object.keys(value).sort();
	return actualKeys.length === keys.length && actualKeys.every((key, index) => key === keys[index]);
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
	if (!request.body) return null;
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;

	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			if (!value) continue;
			totalBytes += value.byteLength;
			if (totalBytes > MOBILE_SYNC_TICKET_MAX_BYTES) {
				await reader.cancel();
				return null;
			}
			chunks.push(value);
		}

		const bytes = new Uint8Array(totalBytes);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

function isSameOriginRequest(request: Request): boolean {
	const origin = request.headers.get("origin");
	if (!origin || origin === "null") return false;
	if (request.headers.get("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin") return false;
	try {
		return origin === new URL(request.url).origin;
	} catch {
		return false;
	}
}

function normalizeSourceKey(value: string | null | undefined): string | null {
	if (!value) return null;
	const normalized = value.trim();
	return normalized.length > 0 && normalized.length <= 128 ? normalized : null;
}

function parseDeclaredContentLength(header: string | null): number | undefined | null {
	if (header === null) return undefined;
	if (!/^[0-9]+$/.test(header)) return null;
	const length = Number(header);
	return Number.isSafeInteger(length) ? length : null;
}

function ticketResultResponse(result: TicketStoreResult): Response {
	if (result === "accepted") return responseWithStatus(204);
	if (result === "rejected") return responseWithStatus(409);
	if (result === "missing") return responseWithStatus(410);
	return responseWithStatus(503, { "retry-after": "60" });
}

function ticketRegistrationResultResponse(result: TicketRegistrationStoreResult, serverNowMs: number): Response {
	if (result.status === "accepted") {
		return responseWithJson({
			expiresAtMs: result.expiresAtMs,
			serverNowMs,
		});
	}
	if (result.status === "rejected") return responseWithStatus(409);
	return responseWithStatus(503, { "retry-after": "60" });
}

function responseWithJson(body: Record<string, number>): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			"cache-control": "no-store",
			"content-type": "application/json",
			"referrer-policy": "no-referrer",
		},
	});
}

function responseWithStatus(status: number, extraHeaders: Record<string, string> = {}): Response {
	return new Response(null, {
		status,
		headers: {
			"cache-control": "no-store",
			"referrer-policy": "no-referrer",
			...extraHeaders,
		},
	});
}

export { MOBILE_SYNC_TICKET_MAX_BYTES, MOBILE_SYNC_TICKET_TTL_MS };
