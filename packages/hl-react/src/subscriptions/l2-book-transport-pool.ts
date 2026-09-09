import { type ISubscriptionTransport, TransportError } from "@nktkas/hyperliquid";

interface BookTransport extends ISubscriptionTransport {
	close(): void;
}

interface PoolEntry {
	transport: BookTransport;
	leases: number;
	disposed: boolean;
	idleTimer?: ReturnType<typeof setTimeout>;
}

const MAX_CONNECTIONS = 4;
const MAX_NEW_CONNECTIONS = 24;
const WINDOW_MS = 60_000;

function getGroupingKey(isTestnet: boolean, payload: unknown): string {
	if (typeof payload !== "object" || payload === null || !("coin" in payload)) {
		throw new TransportError("Invalid order book subscription");
	}
	const book = payload as { nSigFigs?: number | null; mantissa?: number | null; fast?: boolean };
	return JSON.stringify([isTestnet, book.nSigFigs ?? null, book.mantissa ?? null, book.fast === true]);
}

export function createL2BookTransportPool(createTransport: (isTestnet: boolean) => BookTransport) {
	const entries = new Map<string, PoolEntry>();
	let openedAt: number[] = [];

	function remove(key: string, entry: PoolEntry) {
		if (entry.disposed) return;
		entry.disposed = true;
		clearTimeout(entry.idleTimer);
		if (entries.get(key) === entry) entries.delete(key);
		entry.transport.close();
	}

	function acquire(isTestnet: boolean, payload: unknown) {
		const key = getGroupingKey(isTestnet, payload);
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
			entry = { transport: createTransport(isTestnet), leases: 0, disposed: false };
			entries.set(key, entry);
		}
		const acquired = entry;
		clearTimeout(acquired.idleTimer);
		acquired.leases += 1;
		let released = false;
		return {
			transport: acquired.transport,
			isActive: () => !acquired.disposed,
			release: (failed = false) => {
				if (released) return;
				released = true;
				acquired.leases -= 1;
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
		const lease = acquire(isTestnet, payload);
		let released = false;
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
					if (!released && lease.isActive()) listener(event);
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
