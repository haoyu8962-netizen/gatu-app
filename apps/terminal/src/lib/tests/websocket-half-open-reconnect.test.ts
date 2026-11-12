import { WebSocketTransport } from "@nktkas/hyperliquid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A browser socket whose peer has gone silent: `close()` starts the closing handshake and the
 * `close` event never arrives (Chromium fires it after sixty seconds). `patches/@nktkas__rews@4.1.0.patch`
 * makes the reconnecting socket stop waiting for it; without the patch every case here fails.
 */
class HalfOpenSocket extends EventTarget {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;
	static instances: HalfOpenSocket[] = [];

	readyState = HalfOpenSocket.CONNECTING;
	binaryType = "blob";
	bufferedAmount = 0;
	readonly sent: string[] = [];
	readonly close = vi.fn(() => {
		this.readyState = HalfOpenSocket.CLOSING;
	});

	constructor(readonly url: string) {
		super();
		HalfOpenSocket.instances.push(this);
	}

	send(data: string) {
		this.sent.push(data);
	}

	open() {
		this.readyState = HalfOpenSocket.OPEN;
		this.dispatchEvent(new Event("open"));
	}

	finishClosing() {
		this.readyState = HalfOpenSocket.CLOSED;
		this.dispatchEvent(new Event("close"));
	}
}

async function waitForSockets(count: number) {
	await vi.waitFor(() => expect(HalfOpenSocket.instances).toHaveLength(count));
	return HalfOpenSocket.instances[count - 1];
}

describe("reconnecting a half-open WebSocket", () => {
	const transports: WebSocketTransport[] = [];

	function createTransport(maxRetries: number, reconnectionDelay: number | ((attempt: number) => number) = 60_000) {
		const transport = new WebSocketTransport({
			isTestnet: true,
			reconnect: { maxRetries, connectionTimeout: 10_000, reconnectionDelay },
		});
		transports.push(transport);
		return transport;
	}

	beforeEach(() => {
		HalfOpenSocket.instances = [];
		vi.stubGlobal("WebSocket", HalfOpenSocket);
	});

	afterEach(() => {
		for (const transport of transports.splice(0)) transport.close();
		vi.unstubAllGlobals();
	});

	it("opens the replacement at once instead of waiting for the dead socket's close event", async () => {
		const transport = createTransport(Number.POSITIVE_INFINITY);
		const first = await waitForSockets(1);
		first.open();
		const closed = vi.fn();
		const opened = vi.fn();
		transport.socket.addEventListener("close", closed);
		transport.socket.addEventListener("open", opened);

		transport.socket.reconnect();
		const second = await waitForSockets(2);

		expect(first.close).toHaveBeenCalledOnce();
		expect(closed).toHaveBeenCalledOnce();
		expect(transport.socket.readyState).toBe(HalfOpenSocket.CONNECTING);

		second.open();
		expect(opened).toHaveBeenCalledOnce();
		expect(transport.socket.readyState).toBe(HalfOpenSocket.OPEN);
	});

	it("ignores the dead socket once it finally closes", async () => {
		const transport = createTransport(Number.POSITIVE_INFINITY);
		const first = await waitForSockets(1);
		first.open();
		transport.socket.reconnect();
		const second = await waitForSockets(2);
		second.open();
		const closed = vi.fn();
		transport.socket.addEventListener("close", closed);

		first.finishClosing();
		await Promise.resolve();

		expect(closed).not.toHaveBeenCalled();
		expect(HalfOpenSocket.instances).toHaveLength(2);
		expect(transport.socket.readyState).toBe(HalfOpenSocket.OPEN);
	});

	it("resubscribes on the replacement connection", async () => {
		const transport = createTransport(Number.POSITIVE_INFINITY);
		const first = await waitForSockets(1);
		first.open();
		const subscription = { type: "allMids" };
		const confirmation = transport.subscribe("allMids", subscription, () => {});
		first.dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({ channel: "subscriptionResponse", data: { method: "subscribe", subscription } }),
			}),
		);
		await confirmation;

		transport.socket.reconnect();
		const second = await waitForSockets(2);
		second.open();

		expect(second.sent).toContain(JSON.stringify({ method: "subscribe", subscription }));
	});

	it("keeps a frame buffered before the drop and sends it once on the replacement", async () => {
		const transport = createTransport(Number.POSITIVE_INFINITY);
		const first = await waitForSockets(1);
		transport.socket.send("queued");
		expect(first.sent).toEqual([]);

		transport.socket.reconnect();
		const second = await waitForSockets(2);
		second.open();

		expect(first.sent).toEqual([]);
		expect(second.sent.filter((frame) => frame === "queued")).toHaveLength(1);
	});

	it("leaves the retry count alone, so the next real failure backs off as before", async () => {
		const attempts: number[] = [];
		const transport = createTransport(Number.POSITIVE_INFINITY, (attempt) => {
			attempts.push(attempt);
			return 60_000;
		});
		const first = await waitForSockets(1);
		first.finishClosing();
		await vi.waitFor(() => expect(attempts).toEqual([0]));

		transport.socket.reconnect();
		const second = await waitForSockets(2);
		second.open();
		transport.socket.reconnect();
		const third = await waitForSockets(3);
		third.finishClosing();

		await vi.waitFor(() => expect(attempts).toEqual([0, 1]));
	});

	it("fails the consumers of a closed order book transport without waiting for the close event", async () => {
		const transport = createTransport(0);
		transport.resubscribe = false;
		const first = await waitForSockets(1);
		first.open();
		const subscription = { type: "l2Book", coin: "BTC" };
		const onError = vi.fn();
		const confirmation = transport.subscribe("l2Book", subscription, () => {}, { onError });
		first.dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({ channel: "subscriptionResponse", data: { method: "subscribe", subscription } }),
			}),
		);
		await confirmation;

		transport.close();
		await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());

		expect(first.close).toHaveBeenCalled();
		expect(HalfOpenSocket.instances).toHaveLength(1);
	});
});
