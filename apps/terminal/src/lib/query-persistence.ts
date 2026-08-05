import { PERSISTED_QUERY_PREFIX } from "@gatu/hl-react";
import { defaultShouldDehydrateQuery, type Query } from "@tanstack/react-query";

export function shouldPersistQuery(query: Query): boolean {
	return query.queryKey[0] === PERSISTED_QUERY_PREFIX && defaultShouldDehydrateQuery(query);
}
