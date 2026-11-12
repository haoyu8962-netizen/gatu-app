import zlib from "node:zlib";
import type { ISubscriptionTransport } from "@nktkas/hyperliquid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHyperliquidStore } from "../../../../../packages/hl-react/src/store";
import { FastAssetCtxsLockedError } from "../../../../../packages/hl-react/src/subscriptions/compact-asset-ctxs";
import { CompactSubscriptionClient } from "../../../../../packages/hl-react/src/subscriptions/compact-subscription-client";

const KEY = JSON.stringify(["hl", "subscription", "fastAssetCtxs", {}]);
const BAD_FRAME = "!!not base64!!";

function encode(value: unknown): string {
	return zlib.deflateRawSync(Buffer.from(JSON.stringify(value))).toString("base64");
}

function createTransport(frames: () => string[]) {
	const listeners: ((event: CustomEvent<unknown>) => void)[] = [];
	return {
		listeners,
		subscribe: vi.fn(async (_channel: string, _payload: unknown, listener: (event: CustomEvent<unknown>) => void) => {
			listeners.push(listener);
			setTimeout(() => {
				for (const frame of frames()) listener(new CustomEvent("fastAssetCtxs", { detail: frame }));
			}, 0);
			return { unsubscribe: async () => {} };
		}),
	};
}

function createClient(transport: ReturnType<typeof createTransport>) {
	return new CompactSubscriptionClient({ transport: transport as unknown as ISubscriptionTransport });
}

async function expectLocked(transport: ReturnType<typeof createTransport>) {
	await expect(createClient(transport).fastAssetCtxs(vi.fn())).rejects.toBeInstanceOf(FastAssetCtxsLockedError);
	expect(transport.subscribe).toHaveBeenCalledOnce();
}

describe("a fast price stream that fails", () => {
	beforeEach(() => {
		// Node decompresses on the event loop, so setImmediate stays real.
		vi.useFakeTimers({ now: 0, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("locks the channel on that transport after one undecodable frame while the store backs off locally", async () => {
		const transport = createTransport(() => [BAD_FRAME]);
		const client = createClient(transport);
		const store = createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
		const attempts: number[] = [];
		store.getState().acquireSubscription(KEY, (failureOptions) => {
			attempts.push(Date.now());
			return client.fastAssetCtxs(vi.fn(), failureOptions);
		});

		await vi.advanceTimersByTimeAsync(20_000);

		expect(transport.subscribe).toHaveBeenCalledOnce();
		expect(attempts.length).toBeGreaterThanOrEqual(5);
		const gaps = attempts.slice(1).map((time, index) => time - attempts[index]);
		for (let index = 1; index < 4; index += 1) expect(gaps[index]).toBeGreaterThan(gaps[index - 1]);
		store.getState().releaseSubscription(KEY);
	});

	it("locks the channel when the listener throws", async () => {
		const transport = createTransport(() => [encode({ BTC: { markPx: "1" } })]);
		const onError = vi.fn();
		const listener = vi.fn(() => {
			throw new Error("consumer failed");
		});
		await createClient(transport).fastAssetCtxs(listener, { onError });
		await vi.advanceTimersByTimeAsync(0);
		await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
		expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(FastAssetCtxsLockedError);

		await expectLocked(transport);
	});

	it("locks the channel when the decode backlog overflows", async () => {
		const frame = encode({ BTC: { markPx: "1" } });
		const transport = createTransport(() => Array.from({ length: 80 }, () => frame));
		const onError = vi.fn();
		await createClient(transport).fastAssetCtxs(vi.fn(), { onError });
		await vi.advanceTimersByTimeAsync(0);
		await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
		expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(FastAssetCtxsLockedError);

		await expectLocked(transport);
	});

	it("keeps the lock to the transport that failed", async () => {
		const failed = createTransport(() => [BAD_FRAME]);
		const onError = vi.fn();
		await createClient(failed).fastAssetCtxs(vi.fn(), { onError });
		await vi.advanceTimersByTimeAsync(0);
		await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());

		const healthy = createTransport(() => [encode({ BTC: { markPx: "1" } })]);
		const listener = vi.fn();
		await createClient(healthy).fastAssetCtxs(listener);
		await vi.advanceTimersByTimeAsync(0);
		await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

		await expectLocked(failed);
	});

	it("keeps the lock when another subscription on the same transport still decodes frames", async () => {
		const transport = createTransport(() => []);
		const client = createClient(transport);
		const healthyListener = vi.fn();
		const onError = vi.fn();
		await client.fastAssetCtxs(healthyListener);
		await client.fastAssetCtxs(vi.fn(), { onError });
		const [healthy, failing] = transport.listeners;

		failing?.(new CustomEvent("fastAssetCtxs", { detail: BAD_FRAME }));
		await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
		healthy?.(new CustomEvent("fastAssetCtxs", { detail: encode({ BTC: { markPx: "1" } }) }));
		await vi.waitFor(() => expect(healthyListener).toHaveBeenCalledOnce());

		await expect(client.fastAssetCtxs(vi.fn())).rejects.toBeInstanceOf(FastAssetCtxsLockedError);
		expect(transport.subscribe).toHaveBeenCalledTimes(2);
	});

	it("passes a transport failure through without locking the channel", async () => {
		const transport = createTransport(() => []);
		const transportError = new Error("connection closed");
		transport.subscribe.mockImplementationOnce(async () => {
			throw transportError;
		});
		const client = createClient(transport);

		await expect(client.fastAssetCtxs(vi.fn())).rejects.toBe(transportError);
		await expect(client.fastAssetCtxs(vi.fn())).resolves.toBeDefined();
		expect(transport.subscribe).toHaveBeenCalledTimes(2);
	});
});
