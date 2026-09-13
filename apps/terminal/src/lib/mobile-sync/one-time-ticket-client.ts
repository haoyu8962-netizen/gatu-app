import { createJsonPostHeaders } from "@/lib/api/payload-hash";
import {
	isMobileSyncTicketId,
	MOBILE_SYNC_TICKET_API_VERSION,
	MOBILE_SYNC_TICKET_TTL_MS,
	type MobileSyncTicketRequest,
} from "./one-time-ticket-policy";

const MOBILE_SYNC_TICKET_ENDPOINT = "/mobile-agent-sync-ticket";
const MOBILE_SYNC_CONSUMER_STORAGE_KEY = "gatu.mobile-sync.consumer.v1";
const CONSUMER_ID_BYTES = 16;
const CONSUMER_ID_RE = /^[0-9a-f]{32}$/;

export type MobileSyncTicketResult = "accepted" | "rejected" | "unavailable" | "incompatible";
export type MobileSyncTicketIssueResult =
	| { status: "accepted"; syncId: string; expiresAtMonotonicMs: number; expiresAtWallClockMs: number }
	| { status: "rejected" | "unavailable" | "incompatible" };

export function getOrCreateMobileSyncConsumerId(storage?: Storage): string | null {
	try {
		storage ??= window.sessionStorage;
		const existing = storage.getItem(MOBILE_SYNC_CONSUMER_STORAGE_KEY);
		if (existing && CONSUMER_ID_RE.test(existing)) return existing;

		const bytes = new Uint8Array(CONSUMER_ID_BYTES);
		globalThis.crypto.getRandomValues(bytes);
		const consumerId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
		storage.setItem(MOBILE_SYNC_CONSUMER_STORAGE_KEY, consumerId);
		return storage.getItem(MOBILE_SYNC_CONSUMER_STORAGE_KEY) === consumerId ? consumerId : null;
	} catch {
		return null;
	}
}

export async function issueMobileSyncTicket(signal?: AbortSignal): Promise<MobileSyncTicketIssueResult> {
	const requestStartedAtMs = performance.now();
	const requestStartedAtWallClockMs = Date.now();
	try {
		const response = await sendMobileSyncTicketRequest({ version: 2, operation: "issue" }, signal);
		if (response.status === 409 || response.status === 410) return { status: "rejected" };
		if (response.status === 400) return { status: "incompatible" };
		if (
			response.status !== 200 ||
			response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
		)
			return { status: "unavailable" };

		const registration = parseTicketRegistrationResponse(await response.json());
		const responseParsedAtMs = performance.now();
		if (!registration || signal?.aborted) return { status: "unavailable" };

		const roundTripMs = Math.max(0, responseParsedAtMs - requestStartedAtMs);
		const remainingMs = registration.expiresAtMs - registration.serverNowMs - roundTripMs;
		if (remainingMs <= 0) return { status: "rejected" };
		return {
			status: "accepted",
			syncId: registration.syncId,
			expiresAtMonotonicMs: responseParsedAtMs + remainingMs,
			expiresAtWallClockMs: requestStartedAtWallClockMs + registration.expiresAtMs - registration.serverNowMs,
		};
	} catch {
		return { status: "unavailable" };
	}
}

export function consumeMobileSyncTicket(
	syncId: string,
	consumerId: string,
	signal?: AbortSignal,
): Promise<MobileSyncTicketResult> {
	return requestMobileSyncTicket({ version: 2, operation: "consume", syncId, consumerId }, signal);
}

async function requestMobileSyncTicket(
	body: MobileSyncTicketRequest,
	signal?: AbortSignal,
): Promise<MobileSyncTicketResult> {
	try {
		const response = await sendMobileSyncTicketRequest(body, signal);
		if (signal?.aborted) return "unavailable";
		if (response.status === 204) return "accepted";
		if (response.status === 400) return "incompatible";
		return response.status === 409 || response.status === 410 ? "rejected" : "unavailable";
	} catch {
		return "unavailable";
	}
}

function sendMobileSyncTicketRequest(body: MobileSyncTicketRequest, signal?: AbortSignal): Promise<Response> {
	const json = JSON.stringify(body);
	return fetch(MOBILE_SYNC_TICKET_ENDPOINT, {
		method: "POST",
		headers: createJsonPostHeaders(json),
		body: json,
		cache: "no-store",
		credentials: "same-origin",
		redirect: "error",
		referrerPolicy: "no-referrer",
		signal,
	});
}

function parseTicketRegistrationResponse(
	value: unknown,
): { syncId: string; expiresAtMs: number; serverNowMs: number } | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const registration = value as Record<string, unknown>;
	if (
		registration.version !== MOBILE_SYNC_TICKET_API_VERSION ||
		!isMobileSyncTicketId(registration.syncId) ||
		Object.keys(registration).sort().join(",") !== "expiresAtMs,serverNowMs,syncId,version"
	)
		return null;
	if (!Number.isSafeInteger(registration.expiresAtMs) || !Number.isSafeInteger(registration.serverNowMs)) {
		return null;
	}
	const expiresAtMs = registration.expiresAtMs as number;
	const serverNowMs = registration.serverNowMs as number;
	const serverRemainingMs = expiresAtMs - serverNowMs;
	if (serverNowMs < 0 || expiresAtMs < 0 || serverRemainingMs <= 0 || serverRemainingMs > MOBILE_SYNC_TICKET_TTL_MS)
		return null;
	return { syncId: registration.syncId, expiresAtMs, serverNowMs };
}

export { MOBILE_SYNC_CONSUMER_STORAGE_KEY, MOBILE_SYNC_TICKET_ENDPOINT };
