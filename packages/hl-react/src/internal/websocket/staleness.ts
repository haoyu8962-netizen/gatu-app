type StalenessListener = (isStale: boolean) => void;

type KeyEntry = {
	lastMessageAt: number | undefined;
	thresholdMs: number;
	isStale: boolean;
	listeners: Set<StalenessListener>;
};

export type StalenessWatchdog = {
	register: (key: string, thresholdMs: number) => void;
	unregister: (key: string) => void;
	arm: (key: string, at?: number) => void;
	markFresh: (key: string, at?: number) => void;
	isStale: (key: string) => boolean;
	getLastMessageAt: (key: string) => number | undefined;
	subscribe: (key: string, listener: StalenessListener) => () => void;
	destroy: () => void;
};

export function createStalenessWatchdog(checkIntervalMs: number): StalenessWatchdog {
	const keys = new Map<string, KeyEntry>();
	let intervalId: ReturnType<typeof setInterval> | undefined;

	function startInterval() {
		if (intervalId !== undefined) return;
		intervalId = setInterval(tick, checkIntervalMs);
	}

	function stopInterval() {
		if (intervalId === undefined) return;
		clearInterval(intervalId);
		intervalId = undefined;
	}

	function tick() {
		const now = Date.now();
		for (const [, entry] of keys) {
			if (entry.lastMessageAt === undefined) continue;
			const stale = now - entry.lastMessageAt > entry.thresholdMs;
			if (stale !== entry.isStale) {
				entry.isStale = stale;
				for (const listener of entry.listeners) {
					listener(stale);
				}
			}
		}
	}

	// Register tracks the key but does NOT start the interval. Callers normally
	// begin monitoring on the first payload; known periodic streams may begin at
	// subscription acknowledgement to enforce a first-frame deadline.
	function register(key: string, thresholdMs: number) {
		if (keys.has(key)) return;
		keys.set(key, {
			lastMessageAt: undefined,
			thresholdMs,
			isStale: false,
			listeners: new Set(),
		});
	}

	function unregister(key: string) {
		keys.delete(key);
		if (keys.size === 0) stopInterval();
	}

	// `at` is when the frame was actually received; a frame handed over late (a replayed order book
	// snapshot) must not look fresher than it is, so staleness is judged from that time, not from now.
	function arm(key: string, at = Date.now()) {
		const entry = keys.get(key);
		if (!entry) return;
		entry.lastMessageAt = at;
		if (intervalId === undefined && keys.size > 0) {
			startInterval();
		}
		entry.isStale = Date.now() - at > entry.thresholdMs;
	}

	function markFresh(key: string, at = Date.now()) {
		const entry = keys.get(key);
		if (!entry) return;
		const wasStale = entry.isStale;
		arm(key, at);
		if (wasStale && !entry.isStale) {
			for (const listener of entry.listeners) {
				listener(false);
			}
		}
	}

	function isStale(key: string): boolean {
		return keys.get(key)?.isStale ?? false;
	}

	function getLastMessageAt(key: string): number | undefined {
		return keys.get(key)?.lastMessageAt;
	}

	function subscribe(key: string, listener: StalenessListener): () => void {
		const entry = keys.get(key);
		if (!entry) return () => {};
		entry.listeners.add(listener);
		return () => {
			entry.listeners.delete(listener);
		};
	}

	function destroy() {
		stopInterval();
		keys.clear();
	}

	return { register, unregister, arm, markFresh, isStale, getLastMessageAt, subscribe, destroy };
}

export type { StalenessListener };
