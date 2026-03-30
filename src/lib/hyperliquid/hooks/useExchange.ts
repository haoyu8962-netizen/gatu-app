import type { ExchangeClient } from "@nktkas/hyperliquid";
import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { assertExchange } from "@/lib/hyperliquid/errors";
import { useHyperliquidClients } from "@/lib/hyperliquid/hooks/useClients";
import { useHyperliquid } from "@/lib/hyperliquid/provider";
import { getExchangeMethodConfig } from "@/lib/hyperliquid/registries/exchange";
import type { HyperliquidQueryError, MutationParameter } from "@/lib/hyperliquid/types";
import type { ExchangeMethod, ExchangeParams, ExchangeResponse } from "@/lib/hyperliquid/types/clients";

export function useExchange<M extends ExchangeMethod>(
	method: M,
	options: MutationParameter<ExchangeResponse<M>, ExchangeParams<M>> = {},
): UseMutationResult<ExchangeResponse<M>, HyperliquidQueryError, ExchangeParams<M>> {
	const { trading, user } = useHyperliquidClients();
	const { builderConfig, clientKey } = useHyperliquid();

	const config = getExchangeMethodConfig(method);
	const exchange = config.client === "user" ? user : trading;

	const mutationKey = config.useClientKey ? ["hl", method, clientKey] : ["hl", method];

	const mutationFn = (params: ExchangeParams<M>): Promise<ExchangeResponse<M>> => {
		assertExchange(exchange);
		const fn = (exchange as ExchangeClient)[method] as (...args: unknown[]) => Promise<ExchangeResponse<M>>;
		if (config.injectBuilder && params != null && typeof params === "object") {
			return fn.call(exchange, { ...params, builder: builderConfig });
		}
		return params !== undefined ? fn.call(exchange, params) : fn.call(exchange);
	};

	return useMutation({
		...options,
		mutationKey,
		mutationFn,
	});
}
