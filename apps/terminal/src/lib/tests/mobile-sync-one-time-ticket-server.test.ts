import { describe, expect, it } from "vitest";
import {
	createMobileSyncTicketRateLimiter,
	createMobileSyncTicketStore,
	handleMobileSyncTicket,
	MOBILE_SYNC_TICKET_MAX_BYTES,
	MOBILE_SYNC_TICKET_TTL_MS,
} from "../mobile-sync/one-time-ticket-server";

const ORIGIN = "https://app.gatu.test";
const SYNC_ID = "A".repeat(22);
const CONSUMER_A = "11".repeat(16);
const CONSUMER_B = "22".repeat(16);
const SOURCE_KEY = "203.0.113.10";

function createRequest(body: unknown, headers: Record<string, string> = {}): Request {
	return new Request(`${ORIGIN}/mobile-agent-sync-ticket`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			origin: ORIGIN,
			"sec-fetch-site": "same-origin",
			...headers,
		},
		body: JSON.stringify(body),
	});
}

describe("mobile sync one-time ticket server", () => {
	it("lets one device consume a registered QR and makes that device's retry idempotent", async () => {
		const store = createMobileSyncTicketStore();
		const options = { now: () => 1_000, sourceKey: SOURCE_KEY, store };

		expect(
			(await handleMobileSyncTicket(createRequest({ operation: "register", syncId: SYNC_ID }), options)).status,
		).toBe(200);
		expect(
			(
				await handleMobileSyncTicket(
					createRequest({ operation: "consume", syncId: SYNC_ID, consumerId: CONSUMER_A }),
					options,
				)
			).status,
		).toBe(204);
		expect(
			(
				await handleMobileSyncTicket(
					createRequest({ operation: "consume", syncId: SYNC_ID, consumerId: CONSUMER_A }),
					options,
				)
			).status,
		).toBe(204);
		expect(
			(
				await handleMobileSyncTicket(
					createRequest({ operation: "consume", syncId: SYNC_ID, consumerId: CONSUMER_B }),
					options,
				)
			).status,
		).toBe(409);
		expect(
			(await handleMobileSyncTicket(createRequest({ operation: "register", syncId: SYNC_ID }), options)).status,
		).toBe(409);
	});

	it("returns the authoritative deadline without extending it on repeated registration", async () => {
		let nowMs = 2_000;
		const store = createMobileSyncTicketStore();
		const options = { now: () => nowMs, sourceKey: SOURCE_KEY, store };

		const firstResponse = await handleMobileSyncTicket(
			createRequest({ operation: "register", syncId: SYNC_ID }),
			options,
		);
		expect(firstResponse.status).toBe(200);
		expect(firstResponse.headers.get("cache-control")).toBe("no-store");
		expect(await firstResponse.json()).toEqual({
			expiresAtMs: 2_000 + MOBILE_SYNC_TICKET_TTL_MS,
			serverNowMs: 2_000,
		});

		nowMs += 10_000;
		const repeatedResponse = await handleMobileSyncTicket(
			createRequest({ operation: "register", syncId: SYNC_ID }),
			options,
		);
		expect(repeatedResponse.status).toBe(200);
		expect(await repeatedResponse.json()).toEqual({
			expiresAtMs: 2_000 + MOBILE_SYNC_TICKET_TTL_MS,
			serverNowMs: 12_000,
		});
	});

	it("atomically admits only one of two concurrent devices", async () => {
		const store = createMobileSyncTicketStore();
		const options = { now: () => 2_000, sourceKey: SOURCE_KEY, store };
		await handleMobileSyncTicket(createRequest({ operation: "register", syncId: SYNC_ID }), options);

		const responses = await Promise.all([
			handleMobileSyncTicket(createRequest({ operation: "consume", syncId: SYNC_ID, consumerId: CONSUMER_A }), options),
			handleMobileSyncTicket(createRequest({ operation: "consume", syncId: SYNC_ID, consumerId: CONSUMER_B }), options),
		]);

		expect(responses.map((response) => response.status).sort()).toEqual([204, 409]);
	});

	it("keeps a non-reregisterable tombstone for the full encrypted-envelope lifetime", async () => {
		let nowMs = 3_000;
		const store = createMobileSyncTicketStore(8, 100);
		const options = { now: () => nowMs, sourceKey: SOURCE_KEY, store };
		await handleMobileSyncTicket(createRequest({ operation: "register", syncId: SYNC_ID }), options);

		nowMs += 100;
		expect(
			(
				await handleMobileSyncTicket(
					createRequest({ operation: "consume", syncId: SYNC_ID, consumerId: CONSUMER_A }),
					options,
				)
			).status,
		).toBe(410);
		expect(
			(await handleMobileSyncTicket(createRequest({ operation: "register", syncId: SYNC_ID }), options)).status,
		).toBe(409);

		nowMs = 3_000 + 11 * 60_000;
		expect(
			(await handleMobileSyncTicket(createRequest({ operation: "register", syncId: SYNC_ID }), options)).status,
		).toBe(200);
	});

	it("fails closed after server state is replaced", async () => {
		const response = await handleMobileSyncTicket(
			createRequest({ operation: "consume", syncId: SYNC_ID, consumerId: CONSUMER_A }),
			{
				now: () => 4_000,
				sourceKey: SOURCE_KEY,
				store: createMobileSyncTicketStore(),
			},
		);
		expect(response.status).toBe(410);
	});

	it("rejects cross-origin, malformed, extra-field, and oversized requests", async () => {
		expect(
			(
				await handleMobileSyncTicket(
					createRequest({ operation: "register", syncId: SYNC_ID }, { origin: "https://evil.test" }),
					{ sourceKey: SOURCE_KEY },
				)
			).status,
		).toBe(403);
		expect(
			(
				await handleMobileSyncTicket(createRequest({ operation: "register", syncId: "short" }), {
					sourceKey: SOURCE_KEY,
				})
			).status,
		).toBe(400);
		expect(
			(
				await handleMobileSyncTicket(
					createRequest({ operation: "register", syncId: SYNC_ID, privateKey: "must-not-be-accepted" }),
					{ sourceKey: SOURCE_KEY },
				)
			).status,
		).toBe(400);
		expect(
			(
				await handleMobileSyncTicket(
					createRequest(
						{ operation: "register", syncId: SYNC_ID },
						{ "content-length": String(MOBILE_SYNC_TICKET_MAX_BYTES + 1) },
					),
					{ sourceKey: SOURCE_KEY },
				)
			).status,
		).toBe(413);
	});

	it("fails closed when the bounded store is full", async () => {
		const store = createMobileSyncTicketStore(1);
		const options = { now: () => 5_000, sourceKey: SOURCE_KEY, store };
		await handleMobileSyncTicket(createRequest({ operation: "register", syncId: SYNC_ID }), options);

		const response = await handleMobileSyncTicket(
			createRequest({ operation: "register", syncId: "B".repeat(22) }),
			options,
		);
		expect(response.status).toBe(503);
		expect(response.headers.get("retry-after")).toBe("60");
	});

	it("validates before charging separate per-source register and consume limits", async () => {
		const store = createMobileSyncTicketStore();
		const rateLimiter = createMobileSyncTicketRateLimiter(1, 1, 60_000);
		const options = { now: () => 6_000, rateLimiter, sourceKey: SOURCE_KEY, store };

		expect(
			(await handleMobileSyncTicket(createRequest({ operation: "register", syncId: "short" }), options)).status,
		).toBe(400);
		expect(
			(await handleMobileSyncTicket(createRequest({ operation: "register", syncId: SYNC_ID }), options)).status,
		).toBe(200);
		expect(
			(await handleMobileSyncTicket(createRequest({ operation: "register", syncId: "B".repeat(22) }), options)).status,
		).toBe(429);
		expect(
			(
				await handleMobileSyncTicket(createRequest({ operation: "register", syncId: "B".repeat(22) }), {
					...options,
					sourceKey: "203.0.113.11",
				})
			).status,
		).toBe(200);
		expect(
			(
				await handleMobileSyncTicket(
					createRequest({ operation: "consume", syncId: SYNC_ID, consumerId: CONSUMER_A }),
					options,
				)
			).status,
		).toBe(204);
	});

	it("fails closed when the trusted proxy source is unavailable", async () => {
		const response = await handleMobileSyncTicket(createRequest({ operation: "register", syncId: SYNC_ID }));
		expect(response.status).toBe(503);
	});
});
