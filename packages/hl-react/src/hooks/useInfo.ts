import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { infoQueryOptions } from "../query/info";
import { useHyperliquidTransport } from "../transport-provider";
import type { HyperliquidQueryError, QueryParameter } from "../types";
import type { InfoMethod, InfoParams, InfoResponse } from "../types/clients";

export {
	type InfoRequestOptions,
	infoKey,
	infoPersistedKey,
	infoQueryOptions,
	PERSISTED_QUERY_PREFIX,
} from "../query/info";

export type UseInfoOptions<TResponse, TData> = QueryParameter<TResponse, TData> & {
	/**
	 * When true, the query key is prefixed with "persisted" so that a
	 * PersistQueryClientProvider can save successful query data across reloads.
	 * The provider must also retain TanStack Query's default dehydration predicate.
	 */
	persist?: boolean;
	/** Cancels an individual SDK request after this many milliseconds. */
	requestTimeoutMs?: number;
};

export function useInfo<M extends InfoMethod, TData = InfoResponse<M>>(
	method: M,
	params: InfoParams<M>,
	options: UseInfoOptions<InfoResponse<M>, TData> = {},
): UseQueryResult<TData, HyperliquidQueryError> {
	const { env, info } = useHyperliquidTransport();

	const { persist, requestTimeoutMs, ...queryOptions } = options;
	const requestOptions = infoQueryOptions(info, method, params, env, { persist, requestTimeoutMs });

	const hasUser = params != null && typeof params === "object" && "user" in params;
	const userPresent = hasUser ? Boolean((params as { user?: string }).user) : true;
	const enabled = typeof queryOptions.enabled === "boolean" ? userPresent && queryOptions.enabled : userPresent;

	return useQuery({
		...queryOptions,
		...requestOptions,
		enabled,
	});
}
