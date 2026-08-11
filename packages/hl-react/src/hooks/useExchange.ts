import type { ExchangeClient } from "@nktkas/hyperliquid";
import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { assertExchange, WalletAccountMismatchError } from "../errors";
import { assertExchangeMutationAllowed, usePortfolioMarginActivationPolicy } from "../exchange-policy";
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

export type IsolatedManagementExchangeMethod = "topUpIsolatedOnlyMargin" | "updateIsolatedMargin" | "updateLeverage";

/** Runs before enqueue and again at the SDK boundary; keep it synchronous and read volatile state from refs. */
export type ExchangeExecutionGuard<M extends ExchangeMethod> = (params: ExchangeParams<M>) => void;

/**
 * Runs for user-signed methods under the signing-session lock after queueing and immediately before the SDK call.
 * Honor the signal and do not call another Exchange mutation or signing-session API from this guard.
 */
export type ExchangePreExecutionGuard<M extends ExchangeMethod> = (
	params: ExchangeParams<M>,
	signal: AbortSignal,
) => Promise<void>;

export type ExchangeMutationOptions<M extends ExchangeMethod> = MutationParameter<
	ExchangeResponse<M>,
	ExchangeParams<M>
> & {
	executionGuard?: ExchangeExecutionGuard<M>;
	preExecutionGuard?: ExchangePreExecutionGuard<M>;
};

export type GuardedExchangeMutationOptions<M extends IsolatedManagementExchangeMethod> = Omit<
	ExchangeMutationOptions<M>,
	"executionGuard"
> & {
	executionGuard: ExchangeExecutionGuard<M>;
};

const EXECUTION_GUARD_REQUIRED_MESSAGE = "An execution guard is required for isolated margin management";
const ASYNC_EXECUTION_GUARD_MESSAGE = "Execution guards must complete synchronously";
const PRE_EXECUTION_GUARD_USER_CLIENT_MESSAGE = "Pre-execution guards are supported only for user-signed methods";

function requiresExecutionGuard(method: ExchangeMethod): method is IsolatedManagementExchangeMethod {
	return method === "topUpIsolatedOnlyMargin" || method === "updateIsolatedMargin" || method === "updateLeverage";
}

function assertExecutionAllowed<M extends ExchangeMethod>(
	method: M,
	params: ExchangeParams<M>,
	executionGuard: ExchangeExecutionGuard<M> | undefined,
): void {
	if (!executionGuard) {
		if (requiresExecutionGuard(method)) throw new Error(EXECUTION_GUARD_REQUIRED_MESSAGE);
		return;
	}
	const result = executionGuard(params) as unknown;
	if (result && (typeof result === "object" || typeof result === "function") && "then" in result) {
		void Promise.resolve(result).catch(() => {});
		throw new Error(ASYNC_EXECUTION_GUARD_MESSAGE);
	}
}

export function useExchange<M extends IsolatedManagementExchangeMethod>(
	method: M,
	options: GuardedExchangeMutationOptions<M>,
): UseMutationResult<ExchangeResponse<M>, HyperliquidQueryError, ExchangeParams<M>>;
export function useExchange<M extends Exclude<ExchangeMethod, IsolatedManagementExchangeMethod>>(
	method: M,
	options?: ExchangeMutationOptions<M>,
): UseMutationResult<ExchangeResponse<M>, HyperliquidQueryError, ExchangeParams<M>>;
export function useExchange<M extends ExchangeMethod>(
	method: M,
	options: ExchangeMutationOptions<M> = {},
): UseMutationResult<ExchangeResponse<M>, HyperliquidQueryError, ExchangeParams<M>> {
	const { agentPublicKey, trading, user, userWalletMismatch } = useHyperliquidClients();
	const { builderConfig, clientKey, env, exchangeLifecycle, sessionMode } = useHyperliquid();
	const portfolioMarginActivationEnabled = usePortfolioMarginActivationPolicy();
	const { executionGuard, preExecutionGuard, ...mutationOptions } = options;

	const config = getExchangeMethodConfig(method);
	const exchange = config.client === "user" ? user : trading;

	const mutationKey = config.useClientKey ? ["hl", method, clientKey] : ["hl", method];

	const mutationFn = (params: ExchangeParams<M>): Promise<ExchangeResponse<M>> => {
		if (preExecutionGuard && config.client !== "user") throw new Error(PRE_EXECUTION_GUARD_USER_CLIENT_MESSAGE);
		assertExchangeMutationAllowed(method, params, portfolioMarginActivationEnabled);
		const requestParams =
			params != null && typeof params === "object" && !Array.isArray(params)
				? { ...params, ...(config.injectBuilder ? { builder: builderConfig } : {}) }
				: params;
		assertExecutionAllowed(method, requestParams as ExchangeParams<M>, executionGuard);
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
		const priority = getExchangeRequestPriority(method, requestParams);
		return scheduleExchangeRequest(
			exchange,
			priority,
			() => {
				assertExchangeMutationAllowed(method, requestParams, portfolioMarginActivationEnabled);
				assertExecutionAllowed(method, requestParams as ExchangeParams<M>, executionGuard);
				return requestParams !== undefined ? fn.call(exchange, requestParams) : fn.call(exchange);
			},
			requestGeneration,
			async (start) => {
				const guarded = await startAgentRegistrationExecution(
					registrationLease,
					() => exchangeLifecycle.active,
					() => Promise.resolve(start()),
					preExecutionGuard ? (signal) => preExecutionGuard(requestParams as ExchangeParams<M>, signal) : undefined,
				);
				return guarded.status === "started" ? await guarded.execution : { status: "invalidated" };
			},
		);
	};

	return useMutation({
		...mutationOptions,
		mutationKey,
		mutationFn,
	});
}
