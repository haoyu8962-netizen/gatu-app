import { type ISubscriptionTransport, TransportError } from "@nktkas/hyperliquid";
import { type FrameReceipt, markFrameReceivedAt, receiveFrameNow } from "../internal/websocket/frame-receipt";
import { getNetworkState, subscribeNetworkStatus } from "../internal/websocket/network-status";
import { WS_RELIABILITY_LIMITS } from "../internal/websocket/reliability";
import { getReceiptAgeMs } from "../internal/websocket/staleness";
import { type ProbedWebSocket, probeLiveness } from "../internal/websocket/transport-monitor";
import { getVisibilityState, subscribeVisibility } from "../internal/websocket/visibility";

interface BookTransport extends ISubscriptionTransport {
	close(): void;
	/** The SDK `WebSocketTransport` socket; without it a transport is judged by its book frames alone. */
	socket?: ProbedWebSocket & { readonly readyState: number };
}

interface BookPayload {
	coin: string;
	nSigFigs: number | null;
	mantissa: number | null;
	fast: boolean;
}

interface RememberedFrame {
	event: CustomEvent<unknown>;
	receivedAt: number;
	receivedAtWall: number;
}

interface PoolEntry {
	transport: BookTransport;
	fast: boolean;
	lastFrame: FrameReceipt;
	leases: number;
	disposed: boolean;
	idleTimer?: ReturnType<typeof setTimeout>;
	stopProbe?: () => void;
	payloadLeases: Map<string, number>;
	latestFrames: Map<string, RememberedFrame>;
}

const MAX_CONNECTIONS = 4;
const MAX_NEW_CONNECTIONS = 24;
const WINDOW_MS = 60_000;
export const L2_BOOK_REPLAY_MAX_AGE_MS = 5_000;

function readBookPayload(payload: unknown): BookPayload {
	if (typeof payload !== "object" || payload === null || !("coin" in payload)) {
		throw new TransportError("Invalid order book subscription");
	}
	const book = payload as { coin: unknown; nSigFigs?: number | null; mantissa?: number | null; fast?: boolean };
	return {
		coin: String(book.coin),
		nSigFigs: book.nSigFigs ?? null,
		mantissa: book.mantissa ?? null,
		fast: book.fast === true,
	};
}

function getGroupingKey(isTestnet: boolean, book: BookPayload): string {
	return JSON.stringify([isTestnet, book.nSigFigs, book.mantissa, book.fast]);
}

function getPayloadKey(book: BookPayload): string {
	return JSON.stringify([book.coin, book.nSigFigs, book.mantissa, book.fast]);
}

function readFrameCoin(event: CustomEvent<unknown>): string | undefined {
	const detail = event.detail;
	if (typeof detail !== "object" || detail === null || !("coin" in detail)) return undefined;
	return typeof detail.coin === "string" ? detail.coin : undefined;
}

function getSilenceLimitMs(entry: PoolEntry): number {
	const { l2BookFastThresholdMs, perMethodThresholdMs } = WS_RELIABILITY_LIMITS.staleness;
	return entry.fast ? l2BookFastThresholdMs : perMethodThresholdMs.l2Book;
}

export function createL2BookTransportPool(createTransport: (isTestnet: boolean) => BookTransport) {
	const entries = new Map<string, PoolEntry>();
	let openedAt: number[] = [];
	let stopWatchingResume: (() => void) | undefined;

	function remove(key: string, entry: PoolEntry) {
		if (entry.disposed) return;
		entry.disposed = true;
		clearTimeout(entry.idleTimer);
		entry.stopProbe?.();
		entry.latestFrames.clear();
		if (entries.get(key) === entry) entries.delete(key);
		if (entries.size === 0) stopWatchingResume?.();
		entry.transport.close();
	}

	// A phone suspends the page in the background, and these sockets never reconnect on their own:
	// one that died without a close event would otherwise stay silent until the SDK keep-alive gives
	// up on it, up to forty seconds after the page is back. A transport that has delivered no book
	// frame for as long as its stream may stay quiet is closed when the page or the network returns;
	// its consumers fail and subscribe again on a new connection. Heartbeat answers and confirmations
	// do not count there: a connection that carries no book data is not worth keeping either. Every
	// other transport is sent a heartbeat and closed when no answer follows, because book frames the
	// kernel buffered while the page was suspended can arrive first and make a dead one look fresh.
	// Hiding the page, losing the network or starting a newer heartbeat abandons the pending one. A
	// socket that is still connecting would only buffer the heartbeat, so the answer time would measure
	// the handshake; it is left to the connection timeout and the silence rule.
	function closeSilentTransports() {
		if (getNetworkState() === "offline") return;
		for (const [key, entry] of [...entries]) {
			const { receivedAt, monotonicReceivedAt } = entry.lastFrame;
			const socket = entry.transport.socket;
			entry.stopProbe?.();
			if (getReceiptAgeMs(receivedAt, monotonicReceivedAt) >= getSilenceLimitMs(entry)) remove(key, entry);
			else if (socket?.readyState === 1)
				entry.stopProbe = probeLiveness(socket, WS_RELIABILITY_LIMITS.transport.resumeProbeTimeoutMs, (alive) => {
					entry.stopProbe = undefined;
					if (!alive) remove(key, entry);
				});
		}
	}

	function stopProbes() {
		for (const entry of entries.values()) entry.stopProbe?.();
	}

	function watchResume() {
		if (stopWatchingResume) return;
		let wasHidden = getVisibilityState() === "hidden";
		let wasOffline = getNetworkState() === "offline";
		const detachVisibility = subscribeVisibility((state) => {
			if (state === "hidden") {
				wasHidden = true;
				stopProbes();
				return;
			}
			if (!wasHidden) return;
			wasHidden = false;
			closeSilentTransports();
		});
		const detachNetwork = subscribeNetworkStatus((state) => {
			if (state === "offline") {
				wasOffline = true;
				stopProbes();
				return;
			}
			if (!wasOffline) return;
			wasOffline = false;
			closeSilentTransports();
		});
		stopWatchingResume = () => {
			stopWatchingResume = undefined;
			detachVisibility();
			detachNetwork();
		};
	}

	function acquire(isTestnet: boolean, book: BookPayload) {
		const key = getGroupingKey(isTestnet, book);
		const payloadKey = getPayloadKey(book);
		let entry = entries.get(key);
		if (!entry) {
			const now = performance.now();
			openedAt = openedAt.filter((time) => now - time < WINDOW_MS);
			if (openedAt.length >= MAX_NEW_CONNECTIONS) throw new TransportError("Order book connection rate limited");
			if (entries.size >= MAX_CONNECTIONS) {
				const idle = [...entries].find(([, candidate]) => candidate.leases === 0);
				if (!idle) throw new TransportError("Order book connection capacity reached");
				remove(...idle);
			}
			openedAt.push(now);
			entry = {
				transport: createTransport(isTestnet),
				fast: book.fast,
				lastFrame: receiveFrameNow(),
				leases: 0,
				disposed: false,
				payloadLeases: new Map(),
				latestFrames: new Map(),
			};
			entries.set(key, entry);
			watchResume();
		}
		const acquired = entry;
		clearTimeout(acquired.idleTimer);
		acquired.leases += 1;
		acquired.payloadLeases.set(payloadKey, (acquired.payloadLeases.get(payloadKey) ?? 0) + 1);
		let released = false;
		return {
			transport: acquired.transport,
			isActive: () => !acquired.disposed,
			markAlive: () => {
				acquired.lastFrame = receiveFrameNow();
			},
			remember: (event: CustomEvent<unknown>) => {
				if (acquired.disposed) return;
				acquired.latestFrames.set(payloadKey, { event, receivedAt: performance.now(), receivedAtWall: Date.now() });
			},
			latest: () => {
				const frame = acquired.latestFrames.get(payloadKey);
				if (!frame || performance.now() - frame.receivedAt > L2_BOOK_REPLAY_MAX_AGE_MS) return undefined;
				return frame;
			},
			release: (failed = false) => {
				if (released) return;
				released = true;
				acquired.leases -= 1;
				const payloadCount = (acquired.payloadLeases.get(payloadKey) ?? 1) - 1;
				if (payloadCount > 0) acquired.payloadLeases.set(payloadKey, payloadCount);
				else {
					acquired.payloadLeases.delete(payloadKey);
					acquired.latestFrames.delete(payloadKey);
				}
				if (failed) remove(key, acquired);
				else if (acquired.leases === 0 && !acquired.disposed)
					acquired.idleTimer = setTimeout(() => remove(key, acquired), WINDOW_MS);
			},
		};
	}

	async function subscribe<T>(
		isTestnet: boolean,
		payload: unknown,
		listener: (data: CustomEvent<T>) => void,
		options?: Parameters<ISubscriptionTransport["subscribe"]>[3],
	) {
		if (options?.signal?.aborted) throw new TransportError("Order book subscription aborted");
		const book = readBookPayload(payload);
		const lease = acquire(isTestnet, book);
		let released = false;
		let receivedLiveFrame = false;
		function release(failed = false) {
			if (released) return;
			released = true;
			lease.release(failed);
		}
		try {
			const subscription = await lease.transport.subscribe<T>(
				"l2Book",
				payload,
				(event) => {
					// The SDK dispatches every l2Book frame on the socket to every l2Book listener and
					// filters by coin only in its method wrapper, so the pool must not let another coin's
					// frame count as this payload's live frame or overwrite its remembered snapshot. Any
					// book frame still proves that the connection delivers data.
					if (released || !lease.isActive()) return;
					lease.markAlive();
					if (readFrameCoin(event) !== book.coin) return;
					receivedLiveFrame = true;
					lease.remember(event);
					listener(event);
				},
				{
					...options,
					onError: (error) => {
						if (released) return;
						release(true);
						options?.onError?.(error);
					},
				},
			);
			if (!lease.isActive()) {
				await subscription.unsubscribe();
				throw new TransportError("Order book connection closed before confirmation");
			}
			// A subscriber joining a stream the transport already confirmed would otherwise wait for
			// the next server push; the freshest frame of the same payload is its current state. Its
			// original receipt time travels with it so the store does not treat it as newer than it is.
			const replay = receivedLiveFrame ? undefined : lease.latest();
			if (replay) {
				markFrameReceivedAt(replay.event.detail, replay.receivedAtWall, replay.receivedAt);
				listener(replay.event as CustomEvent<T>);
			}
			return {
				unsubscribe: async () => {
					if (released) return;
					released = true;
					try {
						await subscription.unsubscribe();
					} catch (error) {
						lease.release(true);
						throw error;
					} finally {
						lease.release();
					}
				},
			};
		} catch (error) {
			release(!options?.signal?.aborted);
			throw error;
		}
	}

	return { subscribe };
}
