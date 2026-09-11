export const MOBILE_SYNC_TICKET_TTL_MS = 60_000;
export const MOBILE_SYNC_TICKET_API_VERSION = 2;

export function isMobileSyncTicketId(value: unknown): value is string {
	return typeof value === "string" && /^[A-Za-z0-9_-]{21}[AQgw]$/.test(value);
}

export type MobileSyncTicketRequest =
	| { version: 2; operation: "issue" }
	| { version: 2; operation: "consume"; syncId: string; consumerId: string };
