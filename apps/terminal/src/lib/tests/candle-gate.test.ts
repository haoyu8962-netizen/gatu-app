import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	CANDLE_GATE_BACKOFF_MS,
	CANDLE_GATE_MIN_OPEN_MS,
	CandleRateLimitError,
	getCandleGateRetryAt,
	requestCandleSnapshot,
	resetCandleGates,
	subscribeCandleGate,
} from "@/lib/chart/candle-gate";

const infoClient = vi.hoisted(() => ({
	candleSnapshot: vi.fn(),
}));

vi.mock("@/lib/hyperliquid", () => ({
	getInfoClient: () => infoClient,
}));

function rateLimitError(retryAfter: string | null = null): Error {
	return Object.assign(new Error("429 Too Many Requests"), {
		response: {
			status: 429,
			headers: { get: (name: string) => (name === "retry-after" ? retryAfter : null) },
		},
	});
}

function snapshotParams(startTime = 1_000, endTime = 2_000) {
	return { coin: "HYPE", interval: "1m" as const, startTime, endTime };
}

describe("candle snapshot gate", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetCandleGates();
		infoClient.candleSnapshot.mockReset().mockResolvedValue([]);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("joins identical concurrent requests into one underlying request", async () => {
		let resolveSnapshot: ((value: unknown[]) => void) | undefined;
		infoClient.candleSnapshot.mockImplementationOnce(
			() =>
				new Promise<unknown[]>((resolve) => {
					resolveSnapshot = resolve;
				}),
		);

		const first = requestCandleSnapshot(snapshotParams());
		const second = requestCandleSnapshot(snapshotParams());

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);
		resolveSnapshot?.([{ t: 1_000 }]);
		await expect(first).resolves.toEqual([{ t: 1_000 }]);
		await expect(second).resolves.toEqual([{ t: 1_000 }]);

		await expect(requestCandleSnapshot(snapshotParams())).resolves.toEqual([]);
		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(2);
	});

	it("opens after a 429 and rejects queued requests without sending HTTP", async () => {
		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError());

		await expect(requestCandleSnapshot(snapshotParams())).rejects.toBeInstanceOf(CandleRateLimitError);
		expect(getCandleGateRetryAt()).toBe(Date.now() + CANDLE_GATE_BACKOFF_MS[0]);

		const blocked = requestCandleSnapshot(snapshotParams(3_000, 4_000));
		await expect(blocked).rejects.toMatchObject({
			name: "CandleRateLimitError",
			retryAt: Date.now() + CANDLE_GATE_BACKOFF_MS[0],
		});
		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);
	});

	it("honors Retry-After in seconds and as an HTTP date", async () => {
		vi.setSystemTime(Date.UTC(2026, 7, 20, 12));
		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError("3"));
		await expect(requestCandleSnapshot(snapshotParams())).rejects.toMatchObject({
			retryAt: Date.now() + 3_000,
		});

		await vi.advanceTimersByTimeAsync(3_000);
		const httpDate = new Date(Date.now() + 30_000).toUTCString();
		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError(httpDate));
		await expect(requestCandleSnapshot(snapshotParams())).rejects.toMatchObject({
			retryAt: Date.now() + 30_000,
		});
	});

	it("keeps the gate observably open when Retry-After is zero or in the past", async () => {
		vi.setSystemTime(Date.UTC(2026, 7, 20, 12));
		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError("0"));
		await expect(requestCandleSnapshot(snapshotParams())).rejects.toMatchObject({
			retryAt: Date.now() + CANDLE_GATE_MIN_OPEN_MS,
		});
		expect(getCandleGateRetryAt()).toBe(Date.now() + CANDLE_GATE_MIN_OPEN_MS);

		await vi.advanceTimersByTimeAsync(CANDLE_GATE_MIN_OPEN_MS);
		const pastDate = new Date(Date.now() - 30_000).toUTCString();
		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError(pastDate));
		await expect(requestCandleSnapshot(snapshotParams())).rejects.toMatchObject({
			retryAt: Date.now() + CANDLE_GATE_MIN_OPEN_MS,
		});
		expect(getCandleGateRetryAt()).toBe(Date.now() + CANDLE_GATE_MIN_OPEN_MS);
	});

	it("escalates the backoff on consecutive 429s and resets it after a success", async () => {
		for (const expectedBackoffMs of [...CANDLE_GATE_BACKOFF_MS, CANDLE_GATE_BACKOFF_MS.at(-1)]) {
			infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError());
			await expect(requestCandleSnapshot(snapshotParams())).rejects.toMatchObject({
				retryAt: Date.now() + (expectedBackoffMs ?? 0),
			});
			await vi.advanceTimersByTimeAsync(expectedBackoffMs ?? 0);
		}

		await expect(requestCandleSnapshot(snapshotParams())).resolves.toEqual([]);
		expect(getCandleGateRetryAt()).toBeNull();

		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError());
		await expect(requestCandleSnapshot(snapshotParams())).rejects.toMatchObject({
			retryAt: Date.now() + CANDLE_GATE_BACKOFF_MS[0],
		});
	});

	it("lets exactly one probe through after the cooldown expires", async () => {
		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError());
		await expect(requestCandleSnapshot(snapshotParams())).rejects.toBeInstanceOf(CandleRateLimitError);
		await vi.advanceTimersByTimeAsync(CANDLE_GATE_BACKOFF_MS[0]);

		let resolveProbe: ((value: unknown[]) => void) | undefined;
		infoClient.candleSnapshot.mockImplementationOnce(
			() =>
				new Promise<unknown[]>((resolve) => {
					resolveProbe = resolve;
				}),
		);

		const probe = requestCandleSnapshot(snapshotParams());
		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(2);

		await expect(requestCandleSnapshot(snapshotParams(3_000, 4_000))).rejects.toBeInstanceOf(CandleRateLimitError);
		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(2);

		resolveProbe?.([]);
		await expect(probe).resolves.toEqual([]);
		expect(getCandleGateRetryAt()).toBeNull();

		await expect(requestCandleSnapshot(snapshotParams(3_000, 4_000))).resolves.toEqual([]);
		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(3);
	});

	it("does not open the gate for non-429 failures", async () => {
		infoClient.candleSnapshot.mockRejectedValueOnce(new Error("network down"));
		await expect(requestCandleSnapshot(snapshotParams())).rejects.toThrow("network down");
		expect(getCandleGateRetryAt()).toBeNull();

		await expect(requestCandleSnapshot(snapshotParams())).resolves.toEqual([]);
		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(2);
	});

	it("allows a fresh probe after a non-429 probe failure", async () => {
		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError());
		await expect(requestCandleSnapshot(snapshotParams())).rejects.toBeInstanceOf(CandleRateLimitError);
		await vi.advanceTimersByTimeAsync(CANDLE_GATE_BACKOFF_MS[0]);

		infoClient.candleSnapshot.mockRejectedValueOnce(new Error("network down"));
		await expect(requestCandleSnapshot(snapshotParams())).rejects.toThrow("network down");
		expect(getCandleGateRetryAt()).toBeNull();

		await expect(requestCandleSnapshot(snapshotParams())).resolves.toEqual([]);
		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(3);
	});

	it("ignores a stale success that was issued before the gate opened", async () => {
		let resolveSlow: ((value: unknown[]) => void) | undefined;
		infoClient.candleSnapshot
			.mockImplementationOnce(
				() =>
					new Promise<unknown[]>((resolve) => {
						resolveSlow = resolve;
					}),
			)
			.mockRejectedValueOnce(rateLimitError());

		const slow = requestCandleSnapshot(snapshotParams(1_000, 2_000));
		await expect(requestCandleSnapshot(snapshotParams(3_000, 4_000))).rejects.toBeInstanceOf(CandleRateLimitError);
		const retryAt = getCandleGateRetryAt();
		expect(retryAt).not.toBeNull();

		resolveSlow?.([]);
		await expect(slow).resolves.toEqual([]);

		expect(getCandleGateRetryAt()).toBe(retryAt);
	});

	it("escalates the backoff once for a burst of concurrent 429s", async () => {
		let rejectFirst: ((reason: Error) => void) | undefined;
		let rejectSecond: ((reason: Error) => void) | undefined;
		infoClient.candleSnapshot
			.mockImplementationOnce(
				() =>
					new Promise<unknown[]>((_resolve, reject) => {
						rejectFirst = reject;
					}),
			)
			.mockImplementationOnce(
				() =>
					new Promise<unknown[]>((_resolve, reject) => {
						rejectSecond = reject;
					}),
			);

		const first = requestCandleSnapshot(snapshotParams(1_000, 2_000));
		const second = requestCandleSnapshot(snapshotParams(3_000, 4_000));

		rejectFirst?.(rateLimitError());
		await expect(first).rejects.toBeInstanceOf(CandleRateLimitError);
		const retryAt = getCandleGateRetryAt();
		expect(retryAt).toBe(Date.now() + CANDLE_GATE_BACKOFF_MS[0]);

		rejectSecond?.(rateLimitError());
		await expect(second).rejects.toMatchObject({ name: "CandleRateLimitError", retryAt });
		expect(getCandleGateRetryAt()).toBe(retryAt);
	});

	it("releases the half-open probe slot when the SDK throws synchronously", async () => {
		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError());
		await expect(requestCandleSnapshot(snapshotParams())).rejects.toBeInstanceOf(CandleRateLimitError);
		await vi.advanceTimersByTimeAsync(CANDLE_GATE_BACKOFF_MS[0]);

		infoClient.candleSnapshot.mockImplementationOnce(() => {
			throw new Error("validation");
		});
		await expect(requestCandleSnapshot(snapshotParams())).rejects.toThrow("validation");

		await expect(requestCandleSnapshot(snapshotParams())).resolves.toEqual([]);
	});

	it("isolates listener exceptions from request consumers", async () => {
		const throwingListener = vi.fn(() => {
			throw new Error("listener boom");
		});
		const healthyListener = vi.fn();
		const unsubscribeThrowing = subscribeCandleGate(throwingListener);
		const unsubscribeHealthy = subscribeCandleGate(healthyListener);

		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError());
		await expect(requestCandleSnapshot(snapshotParams())).rejects.toBeInstanceOf(CandleRateLimitError);
		expect(healthyListener).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(CANDLE_GATE_BACKOFF_MS[0]);
		await expect(requestCandleSnapshot(snapshotParams())).resolves.toEqual([]);
		expect(healthyListener).toHaveBeenCalledTimes(2);

		unsubscribeThrowing();
		unsubscribeHealthy();
	});

	it("notifies subscribers when the gate opens and closes", async () => {
		const listener = vi.fn();
		const unsubscribe = subscribeCandleGate(listener);

		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError());
		await expect(requestCandleSnapshot(snapshotParams())).rejects.toBeInstanceOf(CandleRateLimitError);
		expect(listener).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(CANDLE_GATE_BACKOFF_MS[0]);
		await expect(requestCandleSnapshot(snapshotParams())).resolves.toEqual([]);
		expect(listener).toHaveBeenCalledTimes(2);

		unsubscribe();
		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError());
		await expect(requestCandleSnapshot(snapshotParams())).rejects.toBeInstanceOf(CandleRateLimitError);
		expect(listener).toHaveBeenCalledTimes(2);
	});
});
