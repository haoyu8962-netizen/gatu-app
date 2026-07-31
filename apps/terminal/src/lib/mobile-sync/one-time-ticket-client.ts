const MOBILE_SYNC_TICKET_ENDPOINT = "/mobile-agent-sync-ticket";
const MOBILE_SYNC_CONSUMER_STORAGE_KEY = "gatu.mobile-sync.consumer.v1";
const CONSUMER_ID_BYTES = 16;
const CONSUMER_ID_RE = /^[0-9a-f]{32}$/;

export type MobileSyncTicketResult = "accepted" | "rejected" | "unavailable";

export function getOrCreateMobileSyncConsumerId(storage: Storage = window.sessionStorage): string | null {
	try {
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

export function registerMobileSyncTicket(syncId: string, signal?: AbortSignal): Promise<MobileSyncTicketResult> {
	return requestMobileSyncTicket({ operation: "register", syncId }, signal);
}

export function consumeMobileSyncTicket(
	syncId: string,
	consumerId: string,
	signal?: AbortSignal,
): Promise<MobileSyncTicketResult> {
	return requestMobileSyncTicket({ operation: "consume", syncId, consumerId }, signal);
}

async function requestMobileSyncTicket(
	body: { operation: "register"; syncId: string } | { operation: "consume"; syncId: string; consumerId: string },
	signal?: AbortSignal,
): Promise<MobileSyncTicketResult> {
	try {
		const response = await fetch(MOBILE_SYNC_TICKET_ENDPOINT, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
			cache: "no-store",
			credentials: "same-origin",
			redirect: "error",
			referrerPolicy: "no-referrer",
			signal,
		});
		if (response.ok) return "accepted";
		return response.status === 409 || response.status === 410 ? "rejected" : "unavailable";
	} catch {
		return "unavailable";
	}
}

export { MOBILE_SYNC_CONSUMER_STORAGE_KEY, MOBILE_SYNC_TICKET_ENDPOINT };
