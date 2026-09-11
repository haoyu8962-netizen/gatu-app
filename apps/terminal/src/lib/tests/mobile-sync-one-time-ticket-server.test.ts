import { describe, expect, it, vi } from "vitest";
import { resolveMobilePairingFeatureFlags } from "@/config/mobile-pairing";
import {
	createMobileSyncTicketRateLimiter,
	createMobileSyncTicketStore,
	handleMobileSyncTicket,
	MOBILE_SYNC_TICKET_MAX_BYTES,
} from "../mobile-sync/one-time-ticket-server";

const ORIGIN = "https://app.gatu.test";
const OTHER_ORIGIN = "https://testnet.gatu.test";
const SYNC_ID = "A".repeat(22);
const CONSUMER_A = "11".repeat(16);
const CONSUMER_B = "22".repeat(16);
const ISSUE = { version: 2, operation: "issue" };
const consume = (consumerId = CONSUMER_A, syncId = SYNC_ID) => ({
	version: 2,
	operation: "consume",
	syncId,
	consumerId,
});

function createRequest(body: unknown, headers: Record<string, string> = {}, origin = ORIGIN): Request {
	return new Request(`${origin}/mobile-agent-sync-ticket`, {
		method: "POST",
		headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin", ...headers },
		body: JSON.stringify(body),
	});
}

function setup(maxEntries = 8) {
	return {
		now: () => 1_000,
		sourceKey: "203.0.113.10",
		store: createMobileSyncTicketStore(maxEntries, 60_000, () => SYNC_ID),
		rateLimiter: createMobileSyncTicketRateLimiter(20, 60, 60_000),
		features: resolveMobilePairingFeatureFlags({
			VITE_MOBILE_PAIRING_CREATE_ENABLED: "true",
			VITE_MOBILE_PAIRING_IMPORT_ENABLED: "true",
		}),
	};
}

describe("mobile sync one-time ticket server", () => {
	it("issues server IDs and atomically admits one consumer with idempotent retries", async () => {
		const options = setup();
		const issued = await handleMobileSyncTicket(createRequest(ISSUE), options);
		expect(issued.status).toBe(200);
		expect(await issued.json()).toEqual({ version: 2, syncId: SYNC_ID, serverNowMs: 1_000, expiresAtMs: 61_000 });
		const responses = await Promise.all(
			[CONSUMER_A, CONSUMER_B].map((id) => handleMobileSyncTicket(createRequest(consume(id)), options)),
		);
		expect(responses.map((r) => r.status).sort()).toEqual([204, 409]);
		const winner = responses[0].status === 204 ? CONSUMER_A : CONSUMER_B;
		options.now = () => 61_000;
		expect((await handleMobileSyncTicket(createRequest(consume(winner)), options)).status).toBe(204);
		expect((await handleMobileSyncTicket(createRequest(consume(winner), {}, OTHER_ORIGIN), options)).status).toBe(410);
		options.now = () => 661_000;
		expect((await handleMobileSyncTicket(createRequest(consume(winner)), options)).status).toBe(410);
	});

	it("expires first consumption at the exact deadline and rejects old registration even after lost state", async () => {
		const options = setup();
		await handleMobileSyncTicket(createRequest(ISSUE), options);
		options.now = () => 61_000;
		expect((await handleMobileSyncTicket(createRequest(consume()), options)).status).toBe(410);
		options.store = createMobileSyncTicketStore();
		for (const id of [CONSUMER_A, CONSUMER_B])
			expect((await handleMobileSyncTicket(createRequest(consume(id)), options)).status).toBe(410);
		for (const body of [
			{ operation: "register", syncId: SYNC_ID },
			{ version: 2, operation: "register", syncId: SYNC_ID },
		]) {
			expect((await handleMobileSyncTicket(createRequest(body), options)).status).toBe(400);
		}
	});

	it.each([
		["false", "false", 503, 503],
		["true", "false", 503, 503],
		["false", "true", 503, 410],
		["true", "true", 200, 410],
	] as const)("compiles gate semantics %s/%s", async (create, imported, issueStatus, consumeStatus) => {
		const options = setup();
		options.features = resolveMobilePairingFeatureFlags({
			VITE_MOBILE_PAIRING_CREATE_ENABLED: create,
			VITE_MOBILE_PAIRING_IMPORT_ENABLED: imported,
		});
		expect((await handleMobileSyncTicket(createRequest(consume()), options)).status).toBe(consumeStatus);
		expect((await handleMobileSyncTicket(createRequest(ISSUE), options)).status).toBe(issueStatus);
		expect(
			(await handleMobileSyncTicket(createRequest({ operation: "register", syncId: SYNC_ID }), options)).status,
		).toBe(400);
	});

	it("checks the feature before accessing the store", async () => {
		const options = setup();
		options.features = resolveMobilePairingFeatureFlags({});
		const issue = vi.spyOn(options.store, "issue");
		const response = await handleMobileSyncTicket(createRequest(ISSUE), options);
		expect(response.status).toBe(503);
		expect(response.headers.get("retry-after")).toBe("60");
		expect(issue).not.toHaveBeenCalled();
	});

	it.each([
		[{ operation: "issue" }, {}, 400],
		[{ ...ISSUE, syncId: SYNC_ID }, {}, 400],
		[{ ...consume(), syncId: "B".repeat(22) }, {}, 400],
		[ISSUE, { origin: "https://evil.test" }, 403],
		[ISSUE, { origin: "null" }, 403],
		[ISSUE, { "sec-fetch-site": "cross-site" }, 403],
		[ISSUE, { "content-type": "text/plain" }, 415],
		[ISSUE, { "content-length": "no" }, 400],
		[ISSUE, { "content-length": String(MOBILE_SYNC_TICKET_MAX_BYTES + 1) }, 413],
		[{ ...ISSUE, extra: "X".repeat(256) }, {}, 400],
	] as const)("rejects invalid requests %# without caching", async (body, headers, status) => {
		const response = await handleMobileSyncTicket(createRequest(body, headers), setup());
		expect(response.status).toBe(status);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(response.headers.get("referrer-policy")).toBe("no-referrer");
	});

	it("bounds capacity and RNG collisions without renewing or overwriting an existing ticket", async () => {
		const options = setup(1);
		await handleMobileSyncTicket(createRequest(ISSUE), options);
		expect((await handleMobileSyncTicket(createRequest(ISSUE), options)).status).toBe(503);
		expect((await handleMobileSyncTicket(createRequest(consume()), options)).status).toBe(204);
		const generator = vi.fn(() => SYNC_ID);
		const store = createMobileSyncTicketStore(8, 60_000, generator);
		expect(store.issue(ORIGIN, 0).status).toBe("accepted");
		expect(store.issue(ORIGIN, 20_000).status).toBe("full");
		expect(generator).toHaveBeenCalledTimes(9);
		expect(store.consume(ORIGIN, SYNC_ID, CONSUMER_A, 60_000)).toBe("missing");
		expect(
			createMobileSyncTicketStore(8, 60_000, () => {
				throw new Error("rng");
			}).issue(ORIGIN, 0).status,
		).toBe("full");
	});

	it("validates before charging separate per-source issue and consume limits", async () => {
		const options = setup();
		options.rateLimiter = createMobileSyncTicketRateLimiter(1, 1, 60_000);
		expect((await handleMobileSyncTicket(createRequest({ ...ISSUE, syncId: SYNC_ID }), options)).status).toBe(400);
		expect((await handleMobileSyncTicket(createRequest(ISSUE), options)).status).toBe(200);
		const limited = await handleMobileSyncTicket(createRequest(ISSUE), options);
		expect(limited.status).toBe(429);
		expect(limited.headers.get("retry-after")).toBe("60");
		expect((await handleMobileSyncTicket(createRequest(consume()), options)).status).toBe(204);
		expect((await handleMobileSyncTicket(createRequest(consume()), options)).status).toBe(429);
		expect(
			(await handleMobileSyncTicket(createRequest(consume()), { ...options, sourceKey: "203.0.113.11" })).status,
		).toBe(204);
		expect((await handleMobileSyncTicket(createRequest(ISSUE), { ...options, sourceKey: null })).status).toBe(503);
	});

	it("uses canonical unpredictable IDs in the default issuer", () => {
		const store = createMobileSyncTicketStore();
		const first = store.issue(ORIGIN, 0);
		const second = store.issue(ORIGIN, 0);
		expect(first).toMatchObject({ status: "accepted", syncId: expect.stringMatching(/^[A-Za-z0-9_-]{21}[AQgw]$/) });
		expect(second).not.toEqual(first);
	});
});
