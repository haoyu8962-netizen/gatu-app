import type { InfoClient } from "@nktkas/hyperliquid";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useHyperliquid } from "../provider";
import { infoKeys } from "../query/keys";
import type { HyperliquidEnv } from "../signing/types";
import type { HyperliquidQueryError, QueryParameter } from "../types";
import type { InfoMethod, InfoParams, InfoResponse } from "../types/clients";

function callInfoMethod<M extends InfoMethod>(
	info: InfoClient,
	method: M,
	params: InfoParams<M>,
	signal: AbortSignal,
	requestTimeoutMs?: number,
): Promise<InfoResponse<M>> {
	const fn = info[method] as (...args: unknown[]) => Promise<InfoResponse<M>>;
	if (requestTimeoutMs === undefined) {
		return params !== undefined ? fn.call(info, params, signal) : fn.call(info, signal);
	}

	const controller = new AbortController();
	const abortRequest = () => controller.abort(signal.reason);
	if (signal.aborted) abortRequest();
	else signal.addEventListener("abort", abortRequest, { once: true });

	const timeoutId = setTimeout(
		() => controller.abort(new DOMException("Info request timed out", "TimeoutError")),
		requestTimeoutMs,
	);
	const cleanup = () => {
		clearTimeout(timeoutId);
		signal.removeEventListener("abort", abortRequest);
	};

	try {
		const request = params !== undefined ? fn.call(info, params, controller.signal) : fn.call(info, controller.signal);
		return request.finally(cleanup);
	} catch (error) {
		cleanup();
		return Promise.reject(error);
	}
}

export const PERSISTED_QUERY_PREFIX = "persisted" as const;

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
	const { env, info } = useHyperliquid();

	const { persist, requestTimeoutMs, ...queryOptions } = options;
	const queryKey = persist ? infoPersistedKey(method, params, env) : infoKey(method, params, env);
	const queryFn = ({ signal }: { signal: AbortSignal }) =>
		callInfoMethod(info, method, params, signal, requestTimeoutMs);

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

export function infoKey<M extends InfoMethod>(method: M, params: InfoParams<M>, env: HyperliquidEnv) {
	return infoKeys.method(method, params, env);
}

export function infoPersistedKey<M extends InfoMethod>(method: M, params: InfoParams<M>, env: HyperliquidEnv) {
	return [PERSISTED_QUERY_PREFIX, ...infoKeys.method(method, params, env)] as const;
}

export function infoQueryOptions<M extends InfoMethod>(
	info: InfoClient,
	method: M,
	params: InfoParams<M>,
	env: HyperliquidEnv,
) {
	return {
		queryKey: infoKey(method, params, env),
		queryFn: ({ signal }: { signal: AbortSignal }) => callInfoMethod(info, method, params, signal),
	};
}
