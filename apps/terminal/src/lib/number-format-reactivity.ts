import { useSyncExternalStore } from "react";

let revision = 0;
const listeners = new Set<() => void>();

function getSnapshot(): number {
	return revision;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function notifyNumberFormatChange(): void {
	revision += 1;
	for (const listener of listeners) listener();
}

export function useNumberFormatRevision(): number {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
