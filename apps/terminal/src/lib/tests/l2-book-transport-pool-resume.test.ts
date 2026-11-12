// @vitest-environment jsdom
import { type ISubscription, type ISubscriptionTransport, TransportError } from "@nktkas/hyperliquid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Options = Parameters<ISubscriptionTransport["subscribe"]>[3];
type Listener = (event: CustomEvent<unknown>) => void;

let createL2BookTransportPool: typeof import("../../../../../packages/hl-react/src/subscriptions/l2-book-transport-pool").createL2BookTransportPool;

class FakeSocket extends EventTarget {
	readyState = 1;
	buffered: string[] = [];
	send = vi.fn((data: string) => {
		if (this.readyState !== 1) this.buffered.push(data);
	});

	pong() {
		this.dispatchEvent(new MessageEvent("message", { data: '{"channel":"pong"}' }));
	}
}

function createTransport() {
	const registrations = new Set<{ listener: Listener; onError?: (error: TransportError) => void }>();
	return {
		socket: new FakeSocket(),
		close: vi.fn(() => {
			for (const registration of [...registrations]) {
				registrations.delete(registration);
				registration.onError?.(new TransportError("connection closed"));
			}
		}),
		subscribe: vi.fn(
			async <T>(
				_channel: string,
				_payload: unknown,
				listener: (event: CustomEvent<T>) => void,
				options?: Options,
			): Promise<ISubscription> => {
				const registration = { listener: listener as Listener, onError: options?.onError };
				registrations.add(registration);
				return {
					unsubscribe: async () => {
						registrations.delete(registration);
					},
				};
			},
		),
		emit: (coin: string) => {
			const event = new CustomEvent("l2Book", { detail: { coin, levels: [[], []], time: Date.now() } });
			for (const { listener } of [...registrations]) listener(event);
		},
	};
}

function createHarness() {
	const transports: ReturnType<typeof createTransport>[] = [];
	const pool = createL2BookTransportPool(() => {
		const transport = createTransport();
		transports.push(transport);
		return transport;
	});
	async function subscribe(payload: { coin: string; fast?: boolean }) {
		const onError = vi.fn();
		const listener = vi.fn();
		await pool.subscribe(false, { type: "l2Book", ...payload }, listener, { onError });
		return { listener, onError };
	}
	return { transports, subscribe };
}

function setHidden(hidden: boolean) {
	Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
	document.dispatchEvent(new Event("visibilitychange"));
}

function setOnline(online: boolean) {
	Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
	window.dispatchEvent(new Event(online ? "online" : "offline"));
}

describe("order book transports after the page or the network returns", () => {
	beforeEach(async () => {
		vi.resetModules();
		vi.useFakeTimers({ now: 0 });
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
		({ createL2BookTransportPool } = await import(
			"../../../../../packages/hl-react/src/subscriptions/l2-book-transport-pool"
		));
	});

	afterEach(() => {
		vi.useRealTimers();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
	});

	it("closes a transport that delivered no frame while hidden and lets its consumer subscribe again", async () => {
		const { transports, subscribe } = createHarness();
		const { onError } = await subscribe({ coin: "HYPE" });
		transports[0].emit("HYPE");

		setHidden(true);
		await vi.advanceTimersByTimeAsync(15_000);
		setHidden(false);

		expect(transports[0].close).toHaveBeenCalledOnce();
		expect(onError).toHaveBeenCalledOnce();

		await subscribe({ coin: "HYPE" });
		expect(transports).toHaveLength(2);
		expect(transports[1].close).not.toHaveBeenCalled();
	});

	it("keeps a transport that received a frame within its stream's quiet limit", async () => {
		const { transports, subscribe } = createHarness();
		const { onError } = await subscribe({ coin: "HYPE" });

		setHidden(true);
		await vi.advanceTimersByTimeAsync(10_000);
		transports[0].emit("HYPE");
		await vi.advanceTimersByTimeAsync(14_999);
		setHidden(false);

		expect(transports[0].close).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
	});

	it("counts a frame for another coin on the shared connection as proof that it is alive", async () => {
		const { transports, subscribe } = createHarness();
		const { listener } = await subscribe({ coin: "HYPE" });

		setHidden(true);
		await vi.advanceTimersByTimeAsync(14_000);
		transports[0].emit("BTC");
		await vi.advanceTimersByTimeAsync(14_000);
		setHidden(false);

		expect(listener).not.toHaveBeenCalled();
		expect(transports[0].close).not.toHaveBeenCalled();
	});

	it("applies the shorter quiet limit to fast books only", async () => {
		const { transports, subscribe } = createHarness();
		await subscribe({ coin: "HYPE" });
		await subscribe({ coin: "HYPE", fast: true });
		expect(transports).toHaveLength(2);

		setHidden(true);
		await vi.advanceTimersByTimeAsync(3_000);
		setHidden(false);

		expect(transports[0].close).not.toHaveBeenCalled();
		expect(transports[1].close).toHaveBeenCalledOnce();
	});

	it("closes silent transports when the network returns", async () => {
		const { transports, subscribe } = createHarness();
		const { onError } = await subscribe({ coin: "HYPE" });

		setOnline(false);
		await vi.advanceTimersByTimeAsync(15_000);
		expect(transports[0].close).not.toHaveBeenCalled();
		setOnline(true);

		expect(transports[0].close).toHaveBeenCalledOnce();
		expect(onError).toHaveBeenCalledOnce();
	});

	it("waits for the network when the page returns offline", async () => {
		const { transports, subscribe } = createHarness();
		await subscribe({ coin: "HYPE" });

		setHidden(true);
		setOnline(false);
		await vi.advanceTimersByTimeAsync(15_000);
		setHidden(false);
		expect(transports[0].close).not.toHaveBeenCalled();

		setOnline(true);
		expect(transports[0].close).toHaveBeenCalledOnce();
	});

	it("leaves transports alone when the page becomes visible without having been hidden", async () => {
		const { transports, subscribe } = createHarness();
		await subscribe({ coin: "HYPE" });

		await vi.advanceTimersByTimeAsync(60_000);
		setHidden(false);

		expect(transports[0].close).not.toHaveBeenCalled();
	});

	it("watches a transport opened after the pool was emptied by an earlier return", async () => {
		const { transports, subscribe } = createHarness();
		await subscribe({ coin: "HYPE" });
		setHidden(true);
		await vi.advanceTimersByTimeAsync(15_000);
		setHidden(false);
		expect(transports[0].close).toHaveBeenCalledOnce();

		const { onError } = await subscribe({ coin: "HYPE" });
		setHidden(true);
		await vi.advanceTimersByTimeAsync(15_000);
		setHidden(false);

		expect(transports[1].close).toHaveBeenCalledOnce();
		expect(onError).toHaveBeenCalledOnce();
	});

	it("sends a heartbeat to a transport that still looks alive and closes it when no answer follows", async () => {
		const { transports, subscribe } = createHarness();
		const { onError } = await subscribe({ coin: "HYPE" });

		setHidden(true);
		await vi.advanceTimersByTimeAsync(10_000);
		setHidden(false);
		expect(transports[0].socket.send).toHaveBeenCalledExactlyOnceWith('{"method":"ping"}');
		transports[0].emit("HYPE");
		transports[0].emit("BTC");
		await vi.advanceTimersByTimeAsync(2_499);
		expect(transports[0].close).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(transports[0].close).toHaveBeenCalledOnce();
		expect(onError).toHaveBeenCalledOnce();

		await subscribe({ coin: "HYPE" });
		expect(transports).toHaveLength(2);
	});

	it("keeps a transport that answers the heartbeat", async () => {
		const { transports, subscribe } = createHarness();
		const { onError } = await subscribe({ coin: "HYPE" });

		setHidden(true);
		await vi.advanceTimersByTimeAsync(10_000);
		setHidden(false);
		await vi.advanceTimersByTimeAsync(1_000);
		transports[0].socket.pong();
		await vi.advanceTimersByTimeAsync(5_000);

		expect(transports[0].close).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
	});

	it.each([
		["the page was hidden again", () => setHidden(true)],
		["the network dropped", () => setOnline(false)],
	])("does not close a transport whose heartbeat went unanswered after %s", async (_case, interrupt) => {
		const { transports, subscribe } = createHarness();
		await subscribe({ coin: "HYPE" });

		setHidden(true);
		setHidden(false);
		expect(transports[0].socket.send).toHaveBeenCalledOnce();
		interrupt();
		await vi.advanceTimersByTimeAsync(5_000);

		expect(transports[0].close).not.toHaveBeenCalled();
	});

	it.each([
		["the page is hidden", () => setHidden(true), () => setHidden(false)],
		["the network drops", () => setOnline(false), () => setOnline(true)],
	])(
		"gives a new heartbeat its full time when %s and returns before the old one ran out",
		async (_case, leave, back) => {
			const { transports, subscribe } = createHarness();
			await subscribe({ coin: "HYPE" });

			setHidden(true);
			setHidden(false);
			await vi.advanceTimersByTimeAsync(100);
			leave();
			await vi.advanceTimersByTimeAsync(2_300);
			back();
			expect(transports[0].socket.send).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(2_499);
			expect(transports[0].close).not.toHaveBeenCalled();

			transports[0].socket.pong();
			await vi.advanceTimersByTimeAsync(5_000);
			expect(transports[0].close).not.toHaveBeenCalled();
		},
	);

	it("does not time a heartbeat against a connection that is still opening", async () => {
		const { transports, subscribe } = createHarness();
		const { onError } = await subscribe({ coin: "HYPE" });
		transports[0].socket.readyState = 0;

		setHidden(true);
		setHidden(false);
		await vi.advanceTimersByTimeAsync(5_000);

		expect(transports[0].socket.send).not.toHaveBeenCalled();
		expect(transports[0].socket.buffered).toEqual([]);
		expect(transports[0].close).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
	});

	it("abandons the heartbeat of a transport that is closed for another reason", async () => {
		const { transports, subscribe } = createHarness();
		const { onError } = await subscribe({ coin: "HYPE" });
		const removeListener = vi.spyOn(transports[0].socket, "removeEventListener");

		setHidden(true);
		setHidden(false);
		transports[0].close();
		expect(onError).toHaveBeenCalledOnce();
		expect(removeListener).toHaveBeenCalledWith("message", expect.any(Function));
	});

	it("judges a transport opened in a background tab by the time since it was opened", async () => {
		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		const { transports, subscribe } = createHarness();
		await subscribe({ coin: "HYPE" });
		await subscribe({ coin: "HYPE", fast: true });

		await vi.advanceTimersByTimeAsync(5_000);
		setHidden(false);

		expect(transports[0].close).not.toHaveBeenCalled();
		expect(transports[1].close).toHaveBeenCalledOnce();
	});
});
