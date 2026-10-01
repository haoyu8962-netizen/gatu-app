import { PERSISTED_QUERY_PREFIX } from "@sairn/hl-react";
import { defaultShouldDehydrateQuery, dehydrate, type Query, type QueryClient } from "@tanstack/react-query";
import { type Persister, persistQueryClientSave } from "@tanstack/react-query-persist-client";
import { RQ_CACHE_BUSTER, STORAGE_KEYS } from "@/config/app";
import { RQ_CACHE_MAX_AGE_MS } from "@/config/time";

const restoredClients = new WeakSet<QueryClient>();

export function createQueryPersistenceFlush(queryClient: QueryClient) {
	return function flush() {
		if (typeof window === "undefined" || !restoredClients.has(queryClient)) return;
		try {
			window.localStorage.setItem(
				STORAGE_KEYS.RQ_CACHE,
				JSON.stringify({
					buster: RQ_CACHE_BUSTER,
					timestamp: Date.now(),
					clientState: dehydrate(queryClient, { shouldDehydrateQuery: shouldPersistQuery }),
				}),
			);
		} catch {}
	};
}

export function shouldPersistQuery(query: Query): boolean {
	return query.queryKey[0] === PERSISTED_QUERY_PREFIX && defaultShouldDehydrateQuery(query);
}

export function createQueryPersistenceOptions(persister: Persister) {
	return {
		persister,
		maxAge: RQ_CACHE_MAX_AGE_MS,
		buster: RQ_CACHE_BUSTER,
		dehydrateOptions: {
			shouldDehydrateQuery: shouldPersistQuery,
		},
	};
}

export function createQueryPersistenceCallbacks(queryClient: QueryClient, persister: Persister) {
	function saveCurrentCache() {
		return persistQueryClientSave({
			queryClient,
			persister,
			buster: RQ_CACHE_BUSTER,
			dehydrateOptions: {
				shouldDehydrateQuery: shouldPersistQuery,
			},
		});
	}

	function onSuccess() {
		restoredClients.add(queryClient);
		return saveCurrentCache();
	}

	return { onSuccess, onError: saveCurrentCache };
}
