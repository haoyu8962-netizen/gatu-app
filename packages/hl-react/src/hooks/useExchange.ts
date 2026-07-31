import type { ExchangeClient } from "@nktkas/hyperliquid";
import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { assertExchange, WalletAccountMismatchError } from "../errors";
import {
	assertExchangeMutationAllowed,
	useIsolatedRiskIncreasePolicy,
	usePortfolioMarginActivationPolicy,
} from "../exchange-policy";
import {
	captureExchangeRequestGeneration,
	ExchangeRequestInvalidatedError,
	getExchangeRequestPriority,
	scheduleExchangeRequest,
} from "../internal/exchange/request-scheduler";
import { useHyperliquid } from "../provider";
import { getExchangeMethodConfig } from "../registries/exchange";
import {
	captureAgentRegistrationExecutionLease,
	startAgentRegistrationExecution,
} from "../signing/agent-registration-session";
import type { HyperliquidQueryError, MutationParameter } from "../types";
import type { ExchangeMethod, ExchangeParams, ExchangeResponse } from "../types/clients";
import { useHyperliquidClients } from "./useClients";

export function useExchange<M extends ExchangeMethod>(
	method: M,
	options: MutationParameter<ExchangeResponse<M>, ExchangeParams<M>> = {},
): UseMutationResult<ExchangeResponse<M>, HyperliquidQueryError, ExchangeParams<M>> {
	const { agentPublicKey, trading, user, userWalletMismatch } = useHyperliquidClients();
	const { builderConfig, clientKey, env, exchangeLifecycle, sessionMode } = useHyperliquid();
	const portfolioMarginActivationEnabled = usePortfolioMarginActivationPolicy();
	const isolatedRiskIncreaseEnabled = useIsolatedRiskIncreasePolicy();

	const config = getExchangeMethodConfig(method);
	const exchange = config.client === "user" ? user : trading;

	const mutationKey = config.useClientKey ? ["hl", method, clientKey] : ["hl", method];

	const mutationFn = (params: ExchangeParams<M>): Promise<ExchangeResponse<M>> => {
		assertExchangeMutationAllowed(method, params, portfolioMarginActivationEnabled, isolatedRiskIncreaseEnabled);
		if (config.client === "user" && userWalletMismatch) throw new WalletAccountMismatchError();
		assertExchange(exchange);
		if (clientKey === "disconnected") throw new ExchangeRequestInvalidatedError();
		if (config.client === "trading" && !agentPublicKey) throw new ExchangeRequestInvalidatedError();
		const registrationLease = captureAgentRegistrationExecutionLease(
			env,
			clientKey as `0x${string}`,
			config.client === "trading"
				? {
						agentPublicKey: agentPublicKey ?? undefined,
						requireActiveOwner: sessionMode === "agent-only",
					}
				: undefined,
		);
		if (!registrationLease) throw new ExchangeRequestInvalidatedError();
		const requestGeneration = captureExchangeRequestGeneration(env, clientKey, sessionMode, {
			registrationEpoch: registrationLease.epoch.epoch,
			agentPublicKey: registrationLease.agentPublicKey,
			activeOwnerActivationEpoch: registrationLease.activeOwner?.activationEpoch,
			lifecycle: exchangeLifecycle,
		});
		const fn = (exchange as ExchangeClient)[method] as (...args: unknown[]) => Promise<ExchangeResponse<M>>;
		const requestParams =
			params != null && typeof params === "object" && !Array.isArray(params)
				? { ...params, ...(config.injectBuilder ? { builder: builderConfig } : {}) }
				: params;
		const priority = getExchangeRequestPriority(method, requestParams);
		return scheduleExchangeRequest(
			exchange,
			priority,
			() => {
				assertExchangeMutationAllowed(
					method,
					requestParams,
					portfolioMarginActivationEnabled,
					isolatedRiskIncreaseEnabled,
				);
				return requestParams !== undefined ? fn.call(exchange, requestParams) : fn.call(exchange);
			},
			requestGeneration,
			async (start) => {
				const guarded = await startAgentRegistrationExecution(
					registrationLease,
					() => exchangeLifecycle.active,
					() => Promise.resolve(start()),
				);
				return guarded.status === "started" ? await guarded.execution : { status: "invalidated" };
			},
		);
	};

	return useMutation({
		...options,
		mutationKey,
		mutationFn,
	});
}
