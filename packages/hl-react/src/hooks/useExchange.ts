import type { ExchangeClient } from "@nktkas/hyperliquid";
import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { assertExchange, WalletAccountMismatchError } from "../errors";
import { getExchangeRequestPriority, scheduleExchangeRequest } from "../internal/exchange/request-scheduler";
import { useHyperliquid } from "../provider";
import { getExchangeMethodConfig } from "../registries/exchange";
import type { HyperliquidQueryError, MutationParameter } from "../types";
import type { ExchangeMethod, ExchangeParams, ExchangeResponse } from "../types/clients";
import { useHyperliquidClients } from "./useClients";

export function useExchange<M extends ExchangeMethod>(
	method: M,
	options: MutationParameter<ExchangeResponse<M>, ExchangeParams<M>> = {},
): UseMutationResult<ExchangeResponse<M>, HyperliquidQueryError, ExchangeParams<M>> {
	const { trading, user, userWalletMismatch } = useHyperliquidClients();
	const { builderConfig, clientKey } = useHyperliquid();

	const config = getExchangeMethodConfig(method);
	const exchange = config.client === "user" ? user : trading;

	const mutationKey = config.useClientKey ? ["hl", method, clientKey] : ["hl", method];

	const mutationFn = (params: ExchangeParams<M>): Promise<ExchangeResponse<M>> => {
		if (config.client === "user" && userWalletMismatch) throw new WalletAccountMismatchError();
		assertExchange(exchange);
		const fn = (exchange as ExchangeClient)[method] as (...args: unknown[]) => Promise<ExchangeResponse<M>>;
		const requestParams =
			config.injectBuilder && params != null && typeof params === "object"
				? { ...params, builder: builderConfig }
				: params;
		const priority = getExchangeRequestPriority(method, requestParams);
		return scheduleExchangeRequest(exchange, priority, () =>
			requestParams !== undefined ? fn.call(exchange, requestParams) : fn.call(exchange),
		);
	};

	return useMutation({
		...options,
		mutationKey,
		mutationFn,
	});
}
