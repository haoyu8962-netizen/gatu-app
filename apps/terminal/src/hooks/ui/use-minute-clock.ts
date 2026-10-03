import { useSyncExternalStore } from "react";

const MINUTE_MS = 60_000;

const listeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setTimeout> | undefined;

function startOfMinute(time: number): number {
	return Math.floor(time / MINUTE_MS) * MINUTE_MS;
}

function clearTick() {
	if (tickTimer === undefined) return;
	clearTimeout(tickTimer);
	tickTimer = undefined;
}

function scheduleTick() {
	clearTick();
	if (listeners.size === 0 || document.visibilityState === "hidden") return;
	const now = Date.now();
	tickTimer = setTimeout(handleClockChange, startOfMinute(now) + MINUTE_MS - now);
}

function handleClockChange() {
	for (const listener of listeners) listener();
	scheduleTick();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	if (listeners.size === 1) {
		document.addEventListener("visibilitychange", handleClockChange);
		scheduleTick();
	}
	return () => {
		listeners.delete(listener);
		if (listeners.size !== 0) return;
		document.removeEventListener("visibilitychange", handleClockChange);
		clearTick();
	};
}

function getSnapshot() {
	return startOfMinute(Date.now());
}

function getServerSnapshot() {
	return null;
}

export function useMinuteClock(): number | null {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
