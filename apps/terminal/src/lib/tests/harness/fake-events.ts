type EventMap = Record<string, unknown>;
type Listener<T = unknown> = (data: T) => void;

export function createFakeEventDispatcher<T extends EventMap>() {
	const listeners = new Map<keyof T, Set<Listener>>();

	function on<K extends keyof T>(event: K, listener: Listener<T[K]>) {
		let set = listeners.get(event);
		if (!set) {
			set = new Set();
			listeners.set(event, set);
		}
		set.add(listener as Listener);
		return () => {
			set?.delete(listener as Listener);
		};
	}

	function emit<K extends keyof T>(event: K, data: T[K]) {
		const set = listeners.get(event);
		if (set) {
			for (const listener of set) {
				listener(data);
			}
		}
	}

	function clear() {
		listeners.clear();
	}

	function listenerCount<K extends keyof T>(event: K): number {
		return listeners.get(event)?.size ?? 0;
	}

	return { on, emit, clear, listenerCount };
}
