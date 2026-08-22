import type { InfoClient } from "@nktkas/hyperliquid";
import type { HyperliquidEnv } from "../signing/types";
import type { InfoMethod, InfoParams, InfoResponse } from "../types/clients";
import { infoKeys } from "./keys";

function callInfoMethod<M extends InfoMethod>(
	info: Pick<InfoClient, M>,
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

export interface InfoRequestOptions {
	persist?: boolean;
	requestTimeoutMs?: number;
}

export function infoKey<M extends InfoMethod>(method: M, params: InfoParams<M>, env: HyperliquidEnv) {
	return infoKeys.method(method, params, env);
}

export function infoPersistedKey<M extends InfoMethod>(method: M, params: InfoParams<M>, env: HyperliquidEnv) {
	return [PERSISTED_QUERY_PREFIX, ...infoKeys.method(method, params, env)] as const;
}

export function infoQueryOptions<M extends InfoMethod>(
	info: Pick<InfoClient, M>,
	method: M,
	params: InfoParams<M>,
	env: HyperliquidEnv,
	options: InfoRequestOptions = {},
) {
	const queryKey = options.persist ? infoPersistedKey(method, params, env) : infoKey(method, params, env);
	return {
		queryKey,
		queryFn: ({ signal }: { signal: AbortSignal }) =>
			callInfoMethod(info, method, params, signal, options.requestTimeoutMs),
	};
}
