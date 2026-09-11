import { afterEach, describe, expect, it, vi } from "vitest";
import {
	consumeMobileSyncTicket,
	getOrCreateMobileSyncConsumerId,
	issueMobileSyncTicket,
} from "../mobile-sync/one-time-ticket-client";

class MemoryStorage implements Storage {
	private readonly values = new Map<string, string>();

	get length() {
		return this.values.size;
	}

	clear() {
		this.values.clear();
	}

	getItem(key: string) {
		return this.values.get(key) ?? null;
	}

	key(index: number) {
		return [...this.values.keys()][index] ?? null;
	}

	removeItem(key: string) {
		this.values.delete(key);
	}

	setItem(key: string, value: string) {
		this.values.set(key, value);
	}
}

describe("mobile sync consumer identity", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("persists a stable per-session id for idempotent consume retries", () => {
		const storage = new MemoryStorage();
		const first = getOrCreateMobileSyncConsumerId(storage);
		const second = getOrCreateMobileSyncConsumerId(storage);

		expect(first).toMatch(/^[0-9a-f]{32}$/);
		expect(second).toBe(first);
	});

	it("fails closed when the session id cannot be persisted", () => {
		const storage = new MemoryStorage();
		storage.setItem = () => {
			throw new Error("blocked");
		};

		expect(getOrCreateMobileSyncConsumerId(storage)).toBeNull();
	});
});

describe("mobile sync ticket registration", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("maps the server deadline to a conservative monotonic deadline", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ version: 2, syncId: "A".repeat(22), expiresAtMs: 160_000, serverNowMs: 100_000 }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(performance, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(3_000);
		vi.spyOn(Date, "now").mockReturnValue(10_000);

		await expect(issueMobileSyncTicket()).resolves.toEqual({
			status: "accepted",
			syncId: "A".repeat(22),
			expiresAtMonotonicMs: 61_000,
			expiresAtWallClockMs: 70_000,
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"/mobile-agent-sync-ticket",
			expect.objectContaining({
				body: JSON.stringify({ version: 2, operation: "issue" }),
				cache: "no-store",
				credentials: "same-origin",
				method: "POST",
			}),
		);
	});

	it("preserves a shorter server lifetime", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({ version: 2, syncId: "A".repeat(22), expiresAtMs: 130_000, serverNowMs: 100_000 }),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			),
		);
		vi.spyOn(performance, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(3_000);
		vi.spyOn(Date, "now").mockReturnValue(10_000);

		await expect(issueMobileSyncTicket()).resolves.toEqual({
			status: "accepted",
			syncId: "A".repeat(22),
			expiresAtMonotonicMs: 31_000,
			expiresAtWallClockMs: 40_000,
		});
	});

	it("rejects a ticket whose remaining lifetime was consumed by the request", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({ version: 2, syncId: "A".repeat(22), expiresAtMs: 130_000, serverNowMs: 100_000 }),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			),
		);
		vi.spyOn(performance, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(31_000);

		await expect(issueMobileSyncTicket()).resolves.toEqual({
			status: "rejected",
		});
	});

	it("fails closed on malformed or overlong registration metadata", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(performance, "now")
			.mockReturnValueOnce(1_000)
			.mockReturnValueOnce(1_001)
			.mockReturnValueOnce(2_000)
			.mockReturnValueOnce(2_001);
		fetchMock
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({ version: 2, syncId: "A".repeat(22), expiresAtMs: 160_001, serverNowMs: 100_000 }),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({ version: 2, syncId: "A".repeat(22), expiresAtMs: "160000", serverNowMs: 100_000 }),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			);

		await expect(issueMobileSyncTicket()).resolves.toEqual({
			status: "unavailable",
		});
		await expect(issueMobileSyncTicket()).resolves.toEqual({
			status: "unavailable",
		});
	});
});

describe("strict ticket transport", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});
	it.each([
		[204, "accepted"],
		[200, "unavailable"],
		[202, "unavailable"],
		[400, "incompatible"],
		[409, "rejected"],
		[410, "rejected"],
		[503, "unavailable"],
	])("only accepts consume 204, status %s", async (status, result) => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: status as number })));
		await expect(consumeMobileSyncTicket("A".repeat(22), "11".repeat(16))).resolves.toBe(result);
	});
	it.each([{ version: 1 }, { syncId: "B".repeat(22) }, { extra: true }, { serverNowMs: -1 }, { expiresAtMs: 60_002 }])(
		"rejects malformed issue metadata %j",
		async (change) => {
			vi.stubGlobal(
				"fetch",
				vi
					.fn()
					.mockResolvedValue(
						Response.json({ version: 2, syncId: "A".repeat(22), serverNowMs: 1, expiresAtMs: 60_001, ...change }),
					),
			);
			await expect(issueMobileSyncTicket()).resolves.toEqual({ status: "unavailable" });
		},
	);
	it("fails closed on network errors, redirects and late aborted responses", async () => {
		const controller = new AbortController();
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new TypeError("redirect"))
			.mockImplementationOnce(async () => {
				controller.abort();
				return new Response(null, { status: 204 });
			});
		vi.stubGlobal("fetch", fetchMock);
		await expect(issueMobileSyncTicket()).resolves.toEqual({ status: "unavailable" });
		await expect(consumeMobileSyncTicket("A".repeat(22), "11".repeat(16), controller.signal)).resolves.toBe(
			"unavailable",
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"/mobile-agent-sync-ticket",
			expect.objectContaining({ redirect: "error", referrerPolicy: "no-referrer" }),
		);
	});
	it("fails closed when the sessionStorage getter throws", () => {
		vi.stubGlobal("window", {
			get sessionStorage() {
				throw new Error("blocked");
			},
		});
		expect(getOrCreateMobileSyncConsumerId()).toBeNull();
	});
	it.each(["<html>fallback</html>", '{"ok":true}'])(
		"does not consume an unexpected HTTP 200 body: %s",
		async (body) => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
			await expect(consumeMobileSyncTicket("A".repeat(22), "11".repeat(16))).resolves.toBe("unavailable");
		},
	);
});
