import type { InfoClient } from "@nktkas/hyperliquid";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useHyperliquid } from "../provider";
import { createKey } from "../query/keys";
import type { HyperliquidQueryError, QueryParameter } from "../types";
import type { InfoMethod, InfoParams, InfoResponse } from "../types/clients";

function callInfoMethod<M extends InfoMethod>(
	info: InfoClient,
	method: M,
	params: InfoParams<M>,
	signal: AbortSignal,
): Promise<InfoResponse<M>> {
	const fn = info[method] as (...args: unknown[]) => Promise<InfoResponse<M>>;
	return params !== undefined ? fn.call(info, params, signal) : fn.call(info, signal);
}

export const PERSISTED_QUERY_PREFIX = "persisted" as const;

export type UseInfoOptions<TResponse, TData> = QueryParameter<TResponse, TData> & {
	/**
	 * When true, the query key is prefixed with "persisted" so that a
	 * PersistQueryClientProvider configured with `shouldDehydrateQuery: q => q.queryKey[0] === "persisted"`
	 * will save this query's data to storage across reloads.
	 */
	persist?: boolean;
};

export function useInfo<M extends InfoMethod, TData = InfoResponse<M>>(
	method: M,
	params: InfoParams<M>,
	options: UseInfoOptions<InfoResponse<M>, TData> = {},
): UseQueryResult<TData, HyperliquidQueryError> {
	const { info } = useHyperliquid();

	const { persist, ...queryOptions } = options;
	const queryKey = persist ? infoPersistedKey(method, params) : infoKey(method, params);
	const queryFn = ({ signal }: { signal: AbortSignal }) => callInfoMethod(info, method, params, signal);

	const hasUser = params != null && typeof params === "object" && "user" in params;
	const userPresent = hasUser ? Boolean((params as { user?: string }).user) : true;
	const enabled = typeof queryOptions.enabled === "boolean" ? userPresent && queryOptions.enabled : userPresent;

	return useQuery({
		...queryOptions,
		queryKey,
		queryFn,
		enabled,
	});
}

export function infoKey<M extends InfoMethod>(method: M, params?: InfoParams<M>) {
	return createKey("info", method, params);
}

export function infoPersistedKey<M extends InfoMethod>(method: M, params?: InfoParams<M>) {
	return [PERSISTED_QUERY_PREFIX, ...createKey("info", method, params)] as const;
}

export function infoQueryOptions<M extends InfoMethod>(info: InfoClient, method: M, params: InfoParams<M>) {
	return {
		queryKey: createKey("info", method, params),
		queryFn: ({ signal }: { signal: AbortSignal }) => callInfoMethod(info, method, params, signal),
	};
}
