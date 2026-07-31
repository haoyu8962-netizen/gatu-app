import { afterEach, describe, expect, it, vi } from "vitest";
import { getOrCreateMobileSyncConsumerId, registerMobileSyncTicket } from "../mobile-sync/one-time-ticket-client";

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
			new Response(JSON.stringify({ expiresAtMs: 160_000, serverNowMs: 100_000 }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(performance, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(3_000);
		vi.spyOn(Date, "now").mockReturnValue(10_000);

		await expect(registerMobileSyncTicket("A".repeat(22))).resolves.toEqual({
			status: "accepted",
			expiresAtMonotonicMs: 61_000,
			expiresAtWallClockMs: 70_000,
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"/mobile-agent-sync-ticket",
			expect.objectContaining({
				body: JSON.stringify({ operation: "register", syncId: "A".repeat(22) }),
				cache: "no-store",
				credentials: "same-origin",
				method: "POST",
			}),
		);
	});

	it("preserves a repeated ticket's shorter server lifetime", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ expiresAtMs: 130_000, serverNowMs: 100_000 }), {
					status: 200,
				}),
			),
		);
		vi.spyOn(performance, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(3_000);
		vi.spyOn(Date, "now").mockReturnValue(10_000);

		await expect(registerMobileSyncTicket("A".repeat(22))).resolves.toEqual({
			status: "accepted",
			expiresAtMonotonicMs: 31_000,
			expiresAtWallClockMs: 40_000,
		});
	});

	it("rejects a ticket whose remaining lifetime was consumed by the request", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ expiresAtMs: 130_000, serverNowMs: 100_000 }), {
					status: 200,
				}),
			),
		);
		vi.spyOn(performance, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(31_000);

		await expect(registerMobileSyncTicket("A".repeat(22))).resolves.toEqual({
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
				new Response(JSON.stringify({ expiresAtMs: 160_001, serverNowMs: 100_000 }), {
					status: 200,
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ expiresAtMs: "160000", serverNowMs: 100_000 }), {
					status: 200,
				}),
			);

		await expect(registerMobileSyncTicket("A".repeat(22))).resolves.toEqual({
			status: "unavailable",
		});
		await expect(registerMobileSyncTicket("B".repeat(22))).resolves.toEqual({
			status: "unavailable",
		});
	});
});
