type VisibilityState = "visible" | "hidden";
type VisibilityListener = (state: VisibilityState) => void;

let listeners: Set<VisibilityListener> | undefined;
let currentState: VisibilityState = "visible";

function handleVisibilityChange() {
	const next: VisibilityState = document.hidden ? "hidden" : "visible";
	if (next === currentState) return;
	currentState = next;
	notify();
}

function handlePageShow(event: PageTransitionEvent) {
	if (!event.persisted) return;
	currentState = "visible";
	notify();
}

function handleFreeze() {
	currentState = "hidden";
	notify();
}

function handleResume() {
	currentState = "visible";
	notify();
}

function notify() {
	if (!listeners) return;
	for (const listener of listeners) {
		listener(currentState);
	}
}

function attach() {
	document.addEventListener("visibilitychange", handleVisibilityChange);
	window.addEventListener("pageshow", handlePageShow);
	document.addEventListener("freeze", handleFreeze);
	document.addEventListener("resume", handleResume);
	currentState = document.hidden ? "hidden" : "visible";
}

function detach() {
	document.removeEventListener("visibilitychange", handleVisibilityChange);
	window.removeEventListener("pageshow", handlePageShow);
	document.removeEventListener("freeze", handleFreeze);
	document.removeEventListener("resume", handleResume);
}

export function subscribeVisibility(listener: VisibilityListener): () => void {
	if (typeof document === "undefined") {
		return () => {};
	}

	if (!listeners) {
		listeners = new Set();
		attach();
	}
	listeners.add(listener);

	return () => {
		listeners?.delete(listener);
		if (listeners?.size === 0) {
			detach();
			listeners = undefined;
		}
	};
}

export function getVisibilityState(): VisibilityState {
	if (typeof document === "undefined") return "visible";
	return currentState;
}

export function __setVisibilityState(state: VisibilityState): void {
	if (state === currentState) return;
	currentState = state;
	notify();
}

export type { VisibilityState, VisibilityListener };
