import { PERSISTED_QUERY_PREFIX } from "@gatu/hl-react";
import { defaultShouldDehydrateQuery, type Query, type QueryClient } from "@tanstack/react-query";
import { type Persister, persistQueryClientSave } from "@tanstack/react-query-persist-client";
import { RQ_CACHE_BUSTER } from "@/config/app";
import { RQ_CACHE_MAX_AGE_MS } from "@/config/time";

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
	const saveCurrentCache = () =>
		persistQueryClientSave({
			queryClient,
			persister,
			buster: RQ_CACHE_BUSTER,
			dehydrateOptions: {
				shouldDehydrateQuery: shouldPersistQuery,
			},
		});

	return { onSuccess: saveCurrentCache, onError: saveCurrentCache };
}
