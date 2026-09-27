type StalenessListener = (isStale: boolean) => void;

type KeyEntry = {
	lastMessageAt: number | undefined;
	monotonicLastMessageAt: number | undefined;
	thresholdMs: number;
	isStale: boolean;
	listeners: Set<StalenessListener>;
};

export type StalenessWatchdog = {
	register: (key: string, thresholdMs: number) => void;
	unregister: (key: string) => void;
	arm: (key: string, at?: number, monotonicAt?: number) => void;
	markFresh: (key: string, at?: number, monotonicAt?: number) => void;
	isStale: (key: string) => boolean;
	getLastMessageAt: (key: string) => number | undefined;
	subscribe: (key: string, listener: StalenessListener) => () => void;
	destroy: () => void;
};

/**
 * Age of a receipt for staleness decisions. The monotonic age keeps growing when the system clock
 * is set back; the wall-clock age can only make the verdict stricter, so a forward clock jump (or a
 * device sleep that `performance.now()` may not count) still ages the data as before. A negative
 * wall-clock age alone never makes a receipt stale.
 */
export function getReceiptAgeMs(
	receivedAt: number,
	monotonicReceivedAt: number,
	now = Date.now(),
	monotonicNow = performance.now(),
): number {
	return Math.max(now - receivedAt, monotonicNow - monotonicReceivedAt);
}

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
		const monotonicNow = performance.now();
		for (const [, entry] of keys) {
			if (entry.lastMessageAt === undefined || entry.monotonicLastMessageAt === undefined) continue;
			const stale =
				getReceiptAgeMs(entry.lastMessageAt, entry.monotonicLastMessageAt, now, monotonicNow) > entry.thresholdMs;
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
			monotonicLastMessageAt: undefined,
			thresholdMs,
			isStale: false,
			listeners: new Set(),
		});
	}

	function unregister(key: string) {
		keys.delete(key);
		if (keys.size === 0) stopInterval();
	}

	// `at` and `monotonicAt` are when the frame was actually received; a frame handed over late (a
	// replayed order book snapshot) must not look fresher than it is, so staleness is judged from that
	// receipt, not from now.
	function arm(key: string, at = Date.now(), monotonicAt = performance.now()) {
		const entry = keys.get(key);
		if (!entry) return;
		entry.lastMessageAt = at;
		entry.monotonicLastMessageAt = monotonicAt;
		if (intervalId === undefined && keys.size > 0) {
			startInterval();
		}
		entry.isStale = getReceiptAgeMs(at, monotonicAt) > entry.thresholdMs;
	}

	function markFresh(key: string, at = Date.now(), monotonicAt = performance.now()) {
		const entry = keys.get(key);
		if (!entry) return;
		const wasStale = entry.isStale;
		arm(key, at, monotonicAt);
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
