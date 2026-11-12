import zlib from "node:zlib";
import type { ISubscriptionTransport } from "@nktkas/hyperliquid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StoreModule = typeof import("@sairn/hl-react/store");
type ClientModule = typeof import("../../../../../packages/hl-react/src/subscriptions/compact-subscription-client");
type DecoderModule = typeof import("../../../../../packages/hl-react/src/subscriptions/compact-asset-ctxs");

let store: StoreModule;
let client: ClientModule;
let decoder: DecoderModule;

const KEY = JSON.stringify(["hl", "subscription", "fastAssetCtxs", {}]);
const BAD_FRAME = "!!not base64!!";
const GOOD_FRAME = zlib.deflateRawSync(Buffer.from(JSON.stringify({ BTC: { markPx: "1" } }))).toString("base64");

function createTransport(frames: string[]) {
	const transport = {
		subscribe: vi.fn(async (_channel: string, _payload: unknown, listener: (event: CustomEvent<unknown>) => void) => {
			const frame = frames.shift() ?? BAD_FRAME;
			setTimeout(() => listener(new CustomEvent("fastAssetCtxs", { detail: frame })), 0);
			return { unsubscribe: async () => {} };
		}),
	};
	return transport;
}

function subscribeThroughStore(transport: ReturnType<typeof createTransport>) {
	const hyperliquidStore = store.createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
	const subscriptionClient = new client.CompactSubscriptionClient({
		transport: transport as unknown as ISubscriptionTransport,
	});
	const listener = vi.fn();
	hyperliquidStore
		.getState()
		.acquireSubscription(KEY, (failureOptions) => subscriptionClient.fastAssetCtxs(listener, failureOptions));
	return { hyperliquidStore, listener };
}

describe("fast price frames that keep failing to decode", () => {
	beforeEach(async () => {
		vi.resetModules();
		// Node decompresses on the event loop, so setImmediate stays real.
		vi.useFakeTimers({ now: 0, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
		store = await import("@sairn/hl-react/store");
		client = await import("../../../../../packages/hl-react/src/subscriptions/compact-subscription-client");
		decoder = await import("../../../../../packages/hl-react/src/subscriptions/compact-asset-ctxs");
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("stops asking the server after three subscriptions in a row could not decode their snapshot", async () => {
		const transport = createTransport([]);
		const { hyperliquidStore, listener } = subscribeThroughStore(transport);

		await vi.advanceTimersByTimeAsync(60_000);

		expect(transport.subscribe).toHaveBeenCalledTimes(decoder.FAST_ASSET_CTXS_MAX_FAILURES);
		expect(decoder.isFastAssetCtxsDisabled()).toBe(true);
		expect(listener).not.toHaveBeenCalled();
		expect(hyperliquidStore.getState().subscriptions[KEY]?.status).not.toBe("active");
		hyperliquidStore.getState().releaseSubscription(KEY);
	});

	it("starts counting again after a snapshot decodes", async () => {
		const transport = createTransport([BAD_FRAME, BAD_FRAME, GOOD_FRAME]);
		const { hyperliquidStore, listener } = subscribeThroughStore(transport);

		await vi.advanceTimersByTimeAsync(3_000);
		await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce(), { timeout: 5_000 });
		expect(transport.subscribe).toHaveBeenCalledTimes(3);
		expect(decoder.isFastAssetCtxsDisabled()).toBe(false);
		hyperliquidStore.getState().releaseSubscription(KEY);

		const next = createTransport([BAD_FRAME, BAD_FRAME]);
		const second = subscribeThroughStore(next);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(next.subscribe).toHaveBeenCalledTimes(3);
		expect(decoder.isFastAssetCtxsDisabled()).toBe(true);
		second.hyperliquidStore.getState().releaseSubscription(KEY);
	});
});
