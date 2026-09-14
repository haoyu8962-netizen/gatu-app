import { type ISubscription, type ISubscriptionTransport, TransportError } from "@nktkas/hyperliquid";
import { l2Book } from "@nktkas/hyperliquid/api/subscription";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takeFrameReceivedAt } from "../../../../../packages/hl-react/src/internal/websocket/frame-receipt";
import {
	createL2BookTransportPool,
	L2_BOOK_REPLAY_MAX_AGE_MS,
} from "../../../../../packages/hl-react/src/subscriptions/l2-book-transport-pool";

type Options = Parameters<ISubscriptionTransport["subscribe"]>[3];

interface Registration {
	listener: (event: CustomEvent<unknown>) => void;
	confirm: () => void;
	fail: (error: unknown) => void;
}

function createTransport(isTestnet: boolean, initialAutoConfirm = true) {
	const listeners = new Set<Registration>();
	const previousListeners: Registration["listener"][] = [];
	const unsubscribe = vi.fn(async () => {});
	let autoConfirm = initialAutoConfirm;
	let closed = false;

	function fail(error: unknown = new TransportError("connection lost")) {
		for (const registration of [...listeners]) registration.fail(error);
	}

	return {
		isTestnet,
		close: vi.fn(() => {
			closed = true;
			fail(new TransportError("connection closed"));
		}),
		unsubscribe,
		subscribe: vi.fn(
			<T>(
				_channel: string,
				_payload: unknown,
				listener: (event: CustomEvent<T>) => void,
				options?: Options,
			): Promise<ISubscription> => {
				if (closed) return Promise.reject(new TransportError("connection closed"));
				return new Promise((resolve, reject) => {
					let confirmed = false;
					const callback = listener as Registration["listener"];
					const detachAbort = () => options?.signal?.removeEventListener("abort", abort);
					const registration: Registration = {
						listener: callback,
						confirm: () => {
							if (!listeners.has(registration) || confirmed) return;
							confirmed = true;
							detachAbort();
							resolve({
								unsubscribe: async () => {
									listeners.delete(registration);
									await unsubscribe();
								},
							});
						},
						fail: (error) => {
							if (!listeners.delete(registration)) return;
							detachAbort();
							if (confirmed) {
								try {
									options?.onError?.(
										error instanceof TransportError
											? error
											: new TransportError("subscription failed", { cause: error }),
									);
								} catch {}
							} else reject(error);
						},
					};
					function abort() {
						registration.fail(options?.signal?.reason);
					}
					listeners.add(registration);
					previousListeners.push(callback);
					options?.signal?.addEventListener("abort", abort, { once: true });
					if (options?.signal?.aborted) abort();
					else if (autoConfirm) registration.confirm();
				});
			},
		),
		emit: (payload: unknown) => {
			for (const { listener } of [...listeners]) listener(new CustomEvent("l2Book", { detail: payload }));
		},
		emitLate: (payload: unknown) => {
			for (const listener of previousListeners) listener(new CustomEvent("l2Book", { detail: payload }));
		},
		fail,
		confirm: () => {
			for (const registration of [...listeners]) registration.confirm();
		},
		setAutoConfirm: (enabled: boolean) => {
			autoConfirm = enabled;
		},
		listenerCount: () => listeners.size,
	};
}

function createHarness(autoConfirm = true) {
	const transports: ReturnType<typeof createTransport>[] = [];
	const pool = createL2BookTransportPool((isTestnet) => {
		const transport = createTransport(isTestnet, autoConfirm);
		transports.push(transport);
		return transport;
	});
	const transport: ISubscriptionTransport = {
		subscribe: (_channel, payload, listener, options) => pool.subscribe(false, payload, listener, options),
	};
	return { pool, transports, transport };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("public order book grouping transport isolation", () => {
	it("isolates real SDK listeners and keeps old grouping frames out of the new callback", async () => {
		const { transport, transports } = createHarness();
		const a = vi.fn();
		const b = vi.fn();
		const first = await l2Book({ transport }, { coin: "HYPE", nSigFigs: 5 }, a);
		const second = await l2Book({ transport }, { coin: "HYPE", nSigFigs: 3 }, b);
		transports[0].emit({ coin: "HYPE", levels: [[{ px: "83.955", sz: "1", n: 1 }], []], time: 1 });
		expect(a).toHaveBeenCalledOnce();
		expect(b).not.toHaveBeenCalled();
		transports[1].emit({ coin: "HYPE", levels: [[], []], time: 2 });
		expect(b).toHaveBeenCalledOnce();
		await first.unsubscribe();
		await second.unsubscribe();
	});

	it("reuses a grouping across coins and A to B to A without reopening a socket", async () => {
		const { pool, transports } = createHarness();
		const a = { coin: "HYPE", nSigFigs: 5 };
		const first = await pool.subscribe(false, a, vi.fn());
		const shared = await pool.subscribe(false, { ...a, coin: "BTC" }, vi.fn());
		await first.unsubscribe();
		const b = await pool.subscribe(false, { ...a, nSigFigs: 3 }, vi.fn());
		const returned = await pool.subscribe(false, a, vi.fn());
		expect(transports).toHaveLength(2);
		expect(transports[0].subscribe).toHaveBeenCalledTimes(3);
		await shared.unsubscribe();
		await b.unsubscribe();
		await returned.unsubscribe();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(transports.every((entry) => entry.close.mock.calls.length === 1)).toBe(true);
	});

	it("separates mantissa, fast and network identities", async () => {
		const { pool, transports } = createHarness();
		const params = { coin: "HYPE", nSigFigs: 5, mantissa: 2 };
		await pool.subscribe(false, params, vi.fn());
		await pool.subscribe(false, { ...params, mantissa: 5 }, vi.fn());
		await pool.subscribe(false, { ...params, fast: true }, vi.fn());
		await pool.subscribe(true, params, vi.fn());
		expect(transports).toHaveLength(4);
		expect(transports[3].isTestnet).toBe(true);
	});

	it("never evicts active consumers when the bounded pool is full", async () => {
		const { pool, transports } = createHarness();
		for (const nSigFigs of [2, 3, 4, 5]) await pool.subscribe(false, { coin: "HYPE", nSigFigs }, vi.fn());
		await expect(pool.subscribe(false, { coin: "HYPE" }, vi.fn())).rejects.toThrow("capacity");
		expect(transports).toHaveLength(4);
		expect(transports.every((entry) => entry.close.mock.calls.length === 0)).toBe(true);
	});

	it("reclaims only idle transports and limits new connection attempts", async () => {
		const { pool, transports } = createHarness();
		for (const isTestnet of [false, true]) {
			for (const fast of [false, true]) {
				for (const nSigFigs of [null, 2, 3, 4, 5]) {
					const sub = await pool.subscribe(isTestnet, { coin: "HYPE", nSigFigs, fast }, vi.fn());
					await sub.unsubscribe();
				}
				const sub = await pool.subscribe(isTestnet, { coin: "HYPE", nSigFigs: 5, mantissa: 2, fast }, vi.fn());
				await sub.unsubscribe();
			}
		}
		expect(transports).toHaveLength(24);
		await expect(pool.subscribe(false, { coin: "HYPE", nSigFigs: 5, mantissa: 5 }, vi.fn())).rejects.toThrow(
			"rate limited",
		);
		expect(transports.filter((entry) => entry.close.mock.calls.length === 0)).toHaveLength(4);
		await vi.advanceTimersByTimeAsync(60_000);
		await pool.subscribe(false, { coin: "HYPE", nSigFigs: 5, mantissa: 5 }, vi.fn());
		expect(transports).toHaveLength(25);
	});

	it("releases failed subscriptions once and suppresses subsequent old frames", async () => {
		const { pool, transports } = createHarness();
		const listener = vi.fn();
		const onError = vi.fn();
		const sub = await pool.subscribe(false, { coin: "HYPE" }, listener, { onError });
		transports[0].fail();
		transports[0].fail();
		transports[0].emit({ coin: "HYPE" });
		await sub.unsubscribe();
		expect(onError).toHaveBeenCalledOnce();
		expect(listener).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(transports[0].close).toHaveBeenCalledOnce();
	});

	it("does not acquire a connection for already aborted requests", async () => {
		const { pool, transports } = createHarness();
		await expect(pool.subscribe(false, { coin: "HYPE" }, vi.fn(), { signal: AbortSignal.abort() })).rejects.toThrow(
			"aborted",
		);
		expect(transports).toHaveLength(0);
	});

	it("releases the lease even when asynchronous unsubscribe fails", async () => {
		const { pool, transports } = createHarness();
		const listener = vi.fn();
		const sub = await pool.subscribe(false, { coin: "HYPE" }, listener);
		transports[0].unsubscribe.mockRejectedValueOnce(new Error("unsubscribe failed"));
		await expect(sub.unsubscribe()).rejects.toThrow("unsubscribe failed");
		transports[0].emit({ coin: "HYPE" });
		expect(listener).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(transports[0].close).toHaveBeenCalledOnce();
	});

	it("cancels a pending confirmation without retaining its listener or discarding a healthy transport", async () => {
		const { pool, transports } = createHarness(false);
		const controller = new AbortController();
		const listener = vi.fn();
		const onError = vi.fn();
		const pending = pool.subscribe(false, { coin: "HYPE" }, listener, { signal: controller.signal, onError });
		const rejected = expect(pending).rejects.toThrow("cancelled confirmation");
		controller.abort(new Error("cancelled confirmation"));
		await rejected;
		expect(transports[0].listenerCount()).toBe(0);
		expect(transports[0].close).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
		transports[0].emitLate({ coin: "HYPE" });
		expect(listener).not.toHaveBeenCalled();

		const replacementListener = vi.fn();
		const replacement = pool.subscribe(false, { coin: "HYPE" }, replacementListener);
		transports[0].confirm();
		const subscription = await replacement;
		expect(transports).toHaveLength(1);
		transports[0].emit({ coin: "HYPE" });
		expect(replacementListener).toHaveBeenCalledOnce();
		await subscription.unsubscribe();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(transports[0].close).toHaveBeenCalledOnce();
	});

	it("discards an initial subscription failure and retries on a fresh transport", async () => {
		const { pool, transports } = createHarness(false);
		const onError = vi.fn();
		const failure = new TransportError("first confirmation failed");
		const first = pool.subscribe(false, { coin: "HYPE" }, vi.fn(), { onError });
		const rejected = expect(first).rejects.toBe(failure);
		transports[0].fail(failure);
		await rejected;
		expect(onError).not.toHaveBeenCalled();
		expect(transports[0].listenerCount()).toBe(0);
		expect(transports[0].close).toHaveBeenCalledOnce();

		const retry = pool.subscribe(false, { coin: "HYPE" }, vi.fn());
		expect(transports).toHaveLength(2);
		transports[1].confirm();
		await retry;
		expect(transports[1].close).not.toHaveBeenCalled();
	});

	it("preserves another confirmed market when a shared pending request is aborted", async () => {
		const { pool, transports } = createHarness();
		const activeListener = vi.fn();
		const activeError = vi.fn();
		const active = await pool.subscribe(false, { coin: "HYPE" }, activeListener, { onError: activeError });
		transports[0].setAutoConfirm(false);
		const controller = new AbortController();
		const pending = pool.subscribe(false, { coin: "BTC" }, vi.fn(), { signal: controller.signal });
		const rejected = expect(pending).rejects.toThrow("cancel BTC");
		controller.abort(new Error("cancel BTC"));
		await rejected;
		expect(transports[0].listenerCount()).toBe(1);
		expect(transports[0].close).not.toHaveBeenCalled();
		expect(activeError).not.toHaveBeenCalled();
		transports[0].emit({ coin: "HYPE" });
		expect(activeListener).toHaveBeenCalledOnce();

		transports[0].setAutoConfirm(true);
		const next = await pool.subscribe(false, { coin: "ETH" }, vi.fn());
		expect(transports).toHaveLength(1);
		await active.unsubscribe();
		await next.unsubscribe();
	});

	it("fails every shared consumer on close and allows a new transport to recover", async () => {
		const { pool, transports } = createHarness();
		const firstListener = vi.fn();
		const secondListener = vi.fn();
		const firstError = vi.fn();
		const secondError = vi.fn();
		const first = await pool.subscribe(false, { coin: "HYPE" }, firstListener, { onError: firstError });
		const second = await pool.subscribe(false, { coin: "BTC" }, secondListener, { onError: secondError });
		transports[0].setAutoConfirm(false);
		const pendingError = vi.fn();
		const pending = pool.subscribe(false, { coin: "ETH" }, vi.fn(), { onError: pendingError });
		const rejected = expect(pending).rejects.toBeInstanceOf(TransportError);
		transports[0].fail();
		await rejected;
		expect(firstError).toHaveBeenCalledOnce();
		expect(secondError).toHaveBeenCalledOnce();
		expect(firstError.mock.calls[0]?.[0]).toBeInstanceOf(TransportError);
		expect(secondError.mock.calls[0]?.[0]).toBeInstanceOf(TransportError);
		expect(pendingError).not.toHaveBeenCalled();
		expect(transports[0].listenerCount()).toBe(0);
		expect(transports[0].close).toHaveBeenCalledOnce();

		const recoveredListener = vi.fn();
		await pool.subscribe(false, { coin: "HYPE" }, recoveredListener);
		expect(transports).toHaveLength(2);
		await first.unsubscribe();
		await second.unsubscribe();
		transports[0].emitLate({ coin: "HYPE" });
		transports[1].emit({ coin: "HYPE" });
		expect(firstListener).not.toHaveBeenCalled();
		expect(secondListener).not.toHaveBeenCalled();
		expect(recoveredListener).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(transports[1].close).not.toHaveBeenCalled();
	});

	it("ignores a cancelled idle timer and old releases after the same grouping is recreated", async () => {
		const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
		const { pool, transports } = createHarness();
		const first = await pool.subscribe(false, { coin: "HYPE" }, vi.fn());
		await first.unsubscribe();
		const oldTimer = timeoutSpy.mock.calls.at(-1)?.[0];
		const active = await pool.subscribe(false, { coin: "HYPE" }, vi.fn());
		transports[0].fail();
		await pool.subscribe(false, { coin: "HYPE" }, vi.fn());
		expect(transports).toHaveLength(2);
		if (typeof oldTimer !== "function") throw new Error("Missing pool idle timer");
		oldTimer();
		await first.unsubscribe();
		await active.unsubscribe();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(transports[0].close).toHaveBeenCalledOnce();
		expect(transports[1].close).not.toHaveBeenCalled();
	});

	it("keeps the connection attempt budget intact when the wall clock jumps", async () => {
		const { pool, transports } = createHarness();
		for (let index = 0; index < 24; index += 1) {
			const sub = await pool.subscribe(false, { coin: "HYPE" }, vi.fn());
			transports[index].fail();
			await sub.unsubscribe();
		}
		const initialWallTime = Date.now();
		for (const jumpMs of [86_400_000, -86_400_000]) {
			vi.setSystemTime(initialWallTime + jumpMs);
			await expect(pool.subscribe(false, { coin: "HYPE" }, vi.fn())).rejects.toThrow("rate limited");
		}
		expect(transports).toHaveLength(24);
		await vi.advanceTimersByTimeAsync(60_000);
		await pool.subscribe(false, { coin: "HYPE" }, vi.fn());
		expect(transports).toHaveLength(25);
	});
});

describe("freshest-frame replay for late subscribers", () => {
	it("replays the freshest frame of the same payload to a subscriber joining a confirmed stream", async () => {
		const { pool, transports } = createHarness();
		const first = vi.fn();
		await pool.subscribe(false, { coin: "HYPE" }, first);
		transports[0].emit({ coin: "HYPE", levels: [[], []], time: 1 });
		const freshest = { coin: "HYPE", levels: [[{ px: "1", sz: "1", n: 1 }], []], time: 2 };
		transports[0].emit(freshest);
		const late = vi.fn();
		await pool.subscribe(false, { coin: "HYPE" }, late);
		expect(late).toHaveBeenCalledOnce();
		expect(late.mock.calls[0][0].detail).toEqual(freshest);
		expect(first).toHaveBeenCalledTimes(2);
		expect(transports).toHaveLength(1);
	});

	it("does not replay across coins or after the replay window closes", async () => {
		const { pool, transports } = createHarness();
		await pool.subscribe(false, { coin: "HYPE" }, vi.fn());
		transports[0].emit({ coin: "HYPE", levels: [[], []], time: 1 });
		const otherCoin = vi.fn();
		await pool.subscribe(false, { coin: "BTC" }, otherCoin);
		expect(otherCoin).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(L2_BOOK_REPLAY_MAX_AGE_MS + 1);
		const stale = vi.fn();
		await pool.subscribe(false, { coin: "HYPE" }, stale);
		expect(stale).not.toHaveBeenCalled();
	});

	it("skips the replay for a subscriber that already received a live frame while pending", async () => {
		const { pool, transports } = createHarness(false);
		const pendingFirst = pool.subscribe(false, { coin: "HYPE" }, vi.fn());
		transports[0].confirm();
		await pendingFirst;
		transports[0].emit({ coin: "HYPE", levels: [[], []], time: 1 });
		const late = vi.fn();
		const pendingLate = pool.subscribe(false, { coin: "HYPE" }, late);
		transports[0].emit({ coin: "HYPE", levels: [[], []], time: 2 });
		transports[0].confirm();
		await pendingLate;
		expect(late).toHaveBeenCalledOnce();
		expect(late.mock.calls[0][0].detail.time).toBe(2);
	});

	it("keeps other coins on the shared transport out of a payload's live and remembered frames", async () => {
		const { pool, transports } = createHarness();
		const hype = vi.fn();
		const btc = vi.fn();
		await pool.subscribe(false, { coin: "HYPE" }, hype);
		await pool.subscribe(false, { coin: "BTC" }, btc);
		const hypeFrame = { coin: "HYPE", levels: [[], []], time: 1 };
		transports[0].emit(hypeFrame);
		transports[0].emit({ coin: "BTC", levels: [[], []], time: 2 });
		expect(hype).toHaveBeenCalledOnce();
		expect(btc).toHaveBeenCalledOnce();
		const late = vi.fn();
		await pool.subscribe(false, { coin: "HYPE" }, late);
		expect(late).toHaveBeenCalledOnce();
		expect(late.mock.calls[0][0].detail).toEqual(hypeFrame);
	});

	it("hands the replayed frame over with its original receipt time", async () => {
		const { pool, transports } = createHarness();
		await pool.subscribe(false, { coin: "HYPE" }, vi.fn());
		const receivedAt = Date.now();
		transports[0].emit({ coin: "HYPE", levels: [[], []], time: 1 });
		await vi.advanceTimersByTimeAsync(2_000);
		const late = vi.fn();
		await pool.subscribe(false, { coin: "HYPE" }, late);
		expect(late).toHaveBeenCalledOnce();
		expect(takeFrameReceivedAt(late.mock.calls[0][0].detail)).toBe(receivedAt);
		expect(Date.now() - receivedAt).toBeGreaterThanOrEqual(2_000);
	});

	it("forgets the frame once the payload's last lease releases", async () => {
		const { pool, transports } = createHarness();
		const first = await pool.subscribe(false, { coin: "HYPE" }, vi.fn());
		const keepAlive = await pool.subscribe(false, { coin: "BTC" }, vi.fn());
		transports[0].emit({ coin: "HYPE", levels: [[], []], time: 1 });
		await first.unsubscribe();
		const late = vi.fn();
		await pool.subscribe(false, { coin: "HYPE" }, late);
		expect(late).not.toHaveBeenCalled();
		await keepAlive.unsubscribe();
	});
});
