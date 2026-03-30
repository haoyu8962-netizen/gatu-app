import type { InfoClient } from "@nktkas/hyperliquid";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useHyperliquid } from "@/lib/hyperliquid/provider";
import { createKey } from "@/lib/hyperliquid/query/keys";
import type { HyperliquidQueryError, QueryParameter } from "@/lib/hyperliquid/types";
import type { InfoMethod, InfoParams, InfoResponse } from "@/lib/hyperliquid/types/clients";

function callInfoMethod<M extends InfoMethod>(
	info: InfoClient,
	method: M,
	params: InfoParams<M>,
	signal: AbortSignal,
): Promise<InfoResponse<M>> {
	const fn = info[method] as (...args: unknown[]) => Promise<InfoResponse<M>>;
	return params !== undefined ? fn.call(info, params, signal) : fn.call(info, signal);
}

export function useInfo<M extends InfoMethod, TData = InfoResponse<M>>(
	method: M,
	params: InfoParams<M>,
	options: QueryParameter<InfoResponse<M>, TData> = {},
): UseQueryResult<TData, HyperliquidQueryError> {
	const { info } = useHyperliquid();

	const queryKey = createKey("info", method, params);
	const queryFn = ({ signal }: { signal: AbortSignal }) => callInfoMethod(info, method, params, signal);

	const hasUser = params != null && typeof params === "object" && "user" in params;
	const userPresent = hasUser ? Boolean((params as { user?: string }).user) : true;
	const enabled = typeof options.enabled === "boolean" ? userPresent && options.enabled : userPresent;

	return useQuery({
		...options,
		queryKey,
		queryFn,
		enabled,
	});
}

export function infoKey<M extends InfoMethod>(method: M, params?: InfoParams<M>) {
	return createKey("info", method, params);
}

export function infoQueryOptions<M extends InfoMethod>(info: InfoClient, method: M, params: InfoParams<M>) {
	return {
		queryKey: createKey("info", method, params),
		queryFn: ({ signal }: { signal: AbortSignal }) => callInfoMethod(info, method, params, signal),
	};
}
