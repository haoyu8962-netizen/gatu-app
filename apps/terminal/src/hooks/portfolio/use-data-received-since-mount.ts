import { useState } from "react";

/**
 * Whether a query has delivered data since this hook started reading `key`. TanStack's
 * `isFetchedAfterMount` also turns true after a failed request, so it cannot tell data cached before the
 * mount from data received since; the `dataUpdatedAt` seen when the key was first read can.
 */
export function useDataReceivedSinceMount(key: string, dataUpdatedAt: number): boolean {
	const [baseline, setBaseline] = useState({ key, dataUpdatedAt });
	if (baseline.key !== key) {
		setBaseline({ key, dataUpdatedAt });
		return false;
	}
	return dataUpdatedAt > baseline.dataUpdatedAt;
}
