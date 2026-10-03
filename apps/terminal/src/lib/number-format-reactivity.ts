let revision = 0;
const listeners = new Set<() => void>();

export function getNumberFormatRevision(): number {
	return revision;
}

export function subscribeNumberFormatChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function notifyNumberFormatChange(): void {
	revision += 1;
	for (const listener of listeners) listener();
}
