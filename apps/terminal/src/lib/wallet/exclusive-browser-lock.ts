interface ExclusiveBrowserLockOptions<T> {
	name: string;
	signal?: AbortSignal;
	task: () => Promise<T>;
}

export async function runWithExclusiveBrowserLock<T>({
	name,
	signal,
	task,
}: ExclusiveBrowserLockOptions<T>): Promise<T | undefined> {
	if (signal?.aborted) return undefined;

	const lockManager = typeof navigator === "undefined" ? undefined : navigator.locks;
	if (!lockManager) return task();

	try {
		return (await lockManager.request(name, { mode: "exclusive", signal }, async () => {
			if (signal?.aborted) return undefined;
			return task();
		})) as T | undefined;
	} catch (error) {
		if (signal?.aborted) return undefined;
		throw error;
	}
}
