const MOBILE_SYNC_TICKET_TTL_MS = 6e4;
const MOBILE_SYNC_TICKET_ENDPOINT = "/mobile-agent-sync-ticket";
const MOBILE_SYNC_CONSUMER_STORAGE_KEY = "gatu.mobile-sync.consumer.v1";
const CONSUMER_ID_BYTES = 16;
const CONSUMER_ID_RE = /^[0-9a-f]{32}$/;
export function getOrCreateMobileSyncConsumerId(storage = window.sessionStorage) {
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
export async function registerMobileSyncTicket(syncId, signal) {
  const requestStartedAtMs = performance.now();
  const requestStartedAtWallClockMs = Date.now();
  try {
    const response = await sendMobileSyncTicketRequest({ operation: "register", syncId }, signal);
    if (response.status === 409 || response.status === 410) return { status: "rejected" };
    if (response.status !== 200) return { status: "unavailable" };
    const registration = parseTicketRegistrationResponse(await response.json());
    const responseParsedAtMs = performance.now();
    if (!registration) return { status: "unavailable" };
    const roundTripMs = Math.max(0, responseParsedAtMs - requestStartedAtMs);
    const remainingMs = registration.expiresAtMs - registration.serverNowMs - roundTripMs;
    if (remainingMs <= 0) return { status: "rejected" };
    return {
      status: "accepted",
      expiresAtMonotonicMs: responseParsedAtMs + remainingMs,
      expiresAtWallClockMs: requestStartedAtWallClockMs + registration.expiresAtMs - registration.serverNowMs
    };
  } catch {
    return { status: "unavailable" };
  }
}
export function consumeMobileSyncTicket(syncId, consumerId, signal) {
  return requestMobileSyncTicket({ operation: "consume", syncId, consumerId }, signal);
}
async function requestMobileSyncTicket(body, signal) {
  try {
    const response = await sendMobileSyncTicketRequest(body, signal);
    if (response.ok) return "accepted";
    return response.status === 409 || response.status === 410 ? "rejected" : "unavailable";
  } catch {
    return "unavailable";
  }
}
function sendMobileSyncTicketRequest(body, signal) {
  return fetch(MOBILE_SYNC_TICKET_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal
  });
}
function parseTicketRegistrationResponse(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const registration = value;
  if (!Number.isSafeInteger(registration.expiresAtMs) || !Number.isSafeInteger(registration.serverNowMs)) {
    return null;
  }
  const expiresAtMs = registration.expiresAtMs;
  const serverNowMs = registration.serverNowMs;
  const serverRemainingMs = expiresAtMs - serverNowMs;
  if (serverRemainingMs <= 0 || serverRemainingMs > MOBILE_SYNC_TICKET_TTL_MS) return null;
  return { expiresAtMs, serverNowMs };
}
export { MOBILE_SYNC_CONSUMER_STORAGE_KEY, MOBILE_SYNC_TICKET_ENDPOINT };
