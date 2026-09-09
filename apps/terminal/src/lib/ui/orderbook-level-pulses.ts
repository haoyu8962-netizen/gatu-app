import {
	collectOrderbookPrices,
	findNewOrderbookPrices,
	getOrderbookPriceKey,
	type OrderbookPriceSets,
	type OrderbookPulseSide,
	type OrderbookPulseSnapshot,
	type OrderbookVisibleLevel,
} from "@/lib/trade/orderbook-new-levels";

export const ORDERBOOK_LEVEL_PULSE_DURATION_MS = 800;
const PULSE_DELAY_SLOTS = [0, 8, 4, 3, 2, 5, 7, 1, 9, 6] as const;
const PULSE_DELAY_STEP_MS = 50;

export interface OrderbookLevelPulseEvent {
	readonly id: number;
	readonly side: OrderbookPulseSide;
	readonly priceKey: string;
	readonly createdAt: number;
	readonly delayMs: number;
	readonly expiresAt: number;
}

export interface OrderbookLevelPulseInput {
	readonly identity: string;
	readonly snapshot: OrderbookPulseSnapshot | undefined;
	readonly visibleLevels: readonly OrderbookVisibleLevel[];
	readonly viewKey: string;
	readonly active: boolean;
}

export interface OrderbookLevelPulseState {
	readonly identity: string;
	readonly viewKey: string;
	readonly events: ReadonlyMap<string, OrderbookLevelPulseEvent>;
}

interface ControllerOptions {
	now?: () => number;
	schedule?: (callback: () => void, delayMs: number) => () => void;
	environmentActive?: boolean;
}

const EMPTY_EVENTS: ReadonlyMap<string, OrderbookLevelPulseEvent> = new Map();
const EMPTY_STATE: OrderbookLevelPulseState = { identity: "", viewKey: "", events: EMPTY_EVENTS };

export function createOrderbookLevelPulseController({
	now = readMonotonicTime,
	schedule = scheduleCleanup,
	environmentActive: initialEnvironmentActive = true,
}: ControllerOptions = {}) {
	let identity = "";
	let viewKey = "";
	let environmentActive = initialEnvironmentActive;
	let previousPrices: OrderbookPriceSets | undefined;
	let previousSnapshot: OrderbookPulseSnapshot | undefined;
	let snapshot = EMPTY_STATE;
	let nextEventId = 0;
	let cancelCleanup: (() => void) | undefined;
	let cleanupAt: number | undefined;
	let cleanupGeneration = 0;
	const listeners = new Set<() => void>();

	function cancelTimer() {
		cleanupGeneration += 1;
		cancelCleanup?.();
		cancelCleanup = undefined;
		cleanupAt = undefined;
	}

	function scheduleNextCleanup() {
		let nextExpiry: number | undefined;
		for (const event of snapshot.events.values()) {
			if (nextExpiry === undefined || event.expiresAt < nextExpiry) nextExpiry = event.expiresAt;
		}
		if (nextExpiry === cleanupAt) return;
		cancelTimer();
		if (nextExpiry === undefined) return;
		cleanupAt = nextExpiry;
		const generation = cleanupGeneration;
		cancelCleanup = schedule(
			() => {
				if (generation !== cleanupGeneration) return;
				cancelCleanup = undefined;
				cleanupAt = undefined;
				const currentTime = now();
				removeEvents((event) => event.expiresAt <= currentTime);
				scheduleNextCleanup();
			},
			Math.max(0, nextExpiry - now()),
		);
	}

	function publish(events: ReadonlyMap<string, OrderbookLevelPulseEvent>) {
		if (events === snapshot.events) return;
		if (events.size === 0 && snapshot.events.size === 0) return;
		snapshot = events.size > 0 ? { identity, viewKey, events } : EMPTY_STATE;
		scheduleNextCleanup();
		for (const listener of listeners) listener();
	}

	function removeEvents(shouldRemove: (event: OrderbookLevelPulseEvent, key: string) => boolean) {
		let next: Map<string, OrderbookLevelPulseEvent> | undefined;
		for (const [key, event] of snapshot.events) {
			if (!shouldRemove(event, key)) continue;
			next ??= new Map(snapshot.events);
			next.delete(key);
		}
		if (next) publish(next);
	}

	function reset() {
		previousPrices = undefined;
		previousSnapshot = undefined;
		cancelTimer();
		publish(EMPTY_EVENTS);
	}

	function commit(input: OrderbookLevelPulseInput) {
		if (input.identity !== identity || input.viewKey !== viewKey) {
			reset();
			identity = input.identity;
			viewKey = input.viewKey;
		}
		if (!environmentActive || !input.active || !input.snapshot || !identity) {
			reset();
			return;
		}

		const visible = collectVisibleLevels(input.visibleLevels);
		const currentTime = now();
		const isNewSnapshot = input.snapshot !== previousSnapshot;
		const currentPrices = isNewSnapshot ? collectOrderbookPrices(input.snapshot) : previousPrices;
		if (!currentPrices) return;
		let events: Map<string, OrderbookLevelPulseEvent> | undefined;
		for (const [key, event] of snapshot.events) {
			if (event.expiresAt <= currentTime || !visible.has(key) || !currentPrices[event.side].has(event.priceKey)) {
				events ??= new Map(snapshot.events);
				events.delete(key);
			}
		}

		if (isNewSnapshot) {
			const added = findNewOrderbookPrices(previousPrices, currentPrices);
			for (const [key, level] of visible) {
				if (!added[level.side].has(level.priceKey)) continue;
				const delayMs = getOrderbookLevelPulseDelay(level.index);
				events ??= new Map(snapshot.events);
				events.set(key, {
					id: ++nextEventId,
					side: level.side,
					priceKey: level.priceKey,
					createdAt: currentTime,
					delayMs,
					expiresAt: currentTime + delayMs + ORDERBOOK_LEVEL_PULSE_DURATION_MS,
				});
			}
			previousPrices = currentPrices;
			previousSnapshot = input.snapshot;
		}
		if (events) publish(events);
	}

	function setEnvironmentActive(active: boolean) {
		if (environmentActive === active) return;
		environmentActive = active;
		reset();
	}

	function onAnimationEnd(id: number) {
		removeEvents((event) => event.id === id);
	}

	function subscribe(listener: () => void) {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	function getSnapshot() {
		return snapshot;
	}

	function getServerSnapshot() {
		return EMPTY_STATE;
	}

	return { commit, getServerSnapshot, getSnapshot, onAnimationEnd, reset, setEnvironmentActive, subscribe };
}

export function getOrderbookLevelPulseDelay(index: number): number {
	const slot = PULSE_DELAY_SLOTS[index % PULSE_DELAY_SLOTS.length] ?? 0;
	return slot * PULSE_DELAY_STEP_MS;
}

function collectVisibleLevels(levels: readonly OrderbookVisibleLevel[]) {
	const visible = new Map<string, { side: OrderbookPulseSide; priceKey: string; index: number }>();
	const sideIndexes = { bid: 0, ask: 0 };
	for (const level of levels) {
		const priceKey = getOrderbookPriceKey(level.price);
		if (priceKey === null) continue;
		const key = `${level.side}:${priceKey}`;
		if (visible.has(key)) continue;
		visible.set(key, { side: level.side, priceKey, index: sideIndexes[level.side]++ });
	}
	return visible;
}

function readMonotonicTime() {
	return performance.now();
}

function scheduleCleanup(callback: () => void, delayMs: number) {
	const timeout = setTimeout(callback, delayMs);
	return () => clearTimeout(timeout);
}
