import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let motionQuery: MediaQueryList | undefined;

function notifyMotionChange() {
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	if (!motionQuery && typeof window !== "undefined" && typeof window.matchMedia === "function") {
		motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		motionQuery.addEventListener("change", notifyMotionChange);
	}
	return () => {
		listeners.delete(listener);
		if (listeners.size !== 0) return;
		motionQuery?.removeEventListener("change", notifyMotionChange);
		motionQuery = undefined;
	};
}

function getSnapshot() {
	return motionQuery?.matches ?? true;
}

function getServerSnapshot() {
	return true;
}

export function usePrefersReducedMotion() {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
