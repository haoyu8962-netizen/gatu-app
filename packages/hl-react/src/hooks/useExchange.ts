import type { ExchangeClient } from "@nktkas/hyperliquid";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { assertExchange, WalletAccountMismatchError } from "../errors";
import { assertExchangeMutationAllowed, usePortfolioMarginActivationPolicy } from "../exchange-policy";
import { requiresFundsActionLock, runWithFundsActionLock } from "../internal/exchange/funds-action-lock";
import { getExchangeLegalCapability, verifyLegalActionAllowed } from "../internal/exchange/legal-execution";
import {
	captureExchangeRequestGeneration,
	ExchangeRequestInvalidatedError,
	type ExchangeRequestStartGate,
	getExchangeRequestPriority,
	getExchangeStartDeadlineMs,
	scheduleExchangeRequest,
} from "../internal/exchange/request-scheduler";
import { useHyperliquid } from "../provider";
import { getExchangeMethodConfig } from "../registries/exchange";
import {
	type AgentRegistrationPreExecutionGuard,
	captureAgentRegistrationExecutionLease,
	startAgentRegistrationExecution,
} from "../signing/agent-registration-session";
import { useHyperliquidOwnerSigner } from "../signing/owner-signer-provider";
import type { HyperliquidQueryError, MutationParameter } from "../types";
import type { ExchangeMethod, ExchangeParams, ExchangeResponse } from "../types/clients";
import { useHyperliquidClients } from "./useClients";

export type IsolatedManagementExchangeMethod = "topUpIsolatedOnlyMargin" | "updateIsolatedMargin" | "updateLeverage";

/** Runs before enqueue and again at the SDK boundary; keep it synchronous and read volatile state from refs. */
export type ExchangeExecutionGuard<M extends ExchangeMethod> = (params: ExchangeParams<M>) => void;

/**
 * Runs for user-signed methods, and for the trading-signed funds actions in
 * `TRADING_PRE_EXECUTION_GUARD_METHODS`, under the signing-session lock after queueing. Funds actions
 * run it inside the cross-tab funds lock, so it sees any funds action another tab completed first.
 * User-signed funds actions await legal verification afterward; trading-signed ones verify it before.
 * Use executionGuard for final synchronous SDK-boundary checks. Honor the signal and do not call
 * another Exchange mutation or signing-session API from this guard.
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
const PRE_EXECUTION_GUARD_USER_CLIENT_MESSAGE =
	"Pre-execution guards are supported only for user-signed methods and opted-in trading funds actions";

// Trading-signed funds actions that may re-read account state inside the funds lock before signing.
const TRADING_PRE_EXECUTION_GUARD_METHODS: ReadonlySet<ExchangeMethod> = new Set(["agentSetAbstraction", "borrowLend"]);

function supportsTradingPreExecutionGuard(method: ExchangeMethod): boolean {
	return TRADING_PRE_EXECUTION_GUARD_METHODS.has(method) && requiresFundsActionLock(method);
}

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
	const ownerSigner = useHyperliquidOwnerSigner();
	const { builderConfig, clientKey, enforceLegalActions, env, exchangeLifecycle, info, sessionMode } = useHyperliquid();
	const queryClient = useQueryClient();
	const portfolioMarginActivationEnabled = usePortfolioMarginActivationPolicy();
	const { executionGuard, preExecutionGuard, ...mutationOptions } = options;

	const config = getExchangeMethodConfig(method);
	const exchange = config.client === "user" ? user : trading;
	const fundsAction = requiresFundsActionLock(method);

	const mutationKey = config.useClientKey ? ["hl", method, clientKey] : ["hl", method];

	const mutationFn = (params: ExchangeParams<M>): Promise<ExchangeResponse<M>> => {
		ownerSigner?.assertCurrent();
		if (preExecutionGuard && config.client !== "user" && !supportsTradingPreExecutionGuard(method)) {
			throw new Error(PRE_EXECUTION_GUARD_USER_CLIENT_MESSAGE);
		}
		assertExchangeMutationAllowed(method, params, portfolioMarginActivationEnabled);
		const requestParams =
			params != null && typeof params === "object" && !Array.isArray(params)
				? { ...params, ...(config.injectBuilder ? { builder: builderConfig } : {}) }
				: params;
		assertExecutionAllowed(method, requestParams as ExchangeParams<M>, executionGuard);
		if (config.client === "user" && userWalletMismatch) throw new WalletAccountMismatchError();
		assertExchange(exchange);
		if (clientKey === "disconnected") throw new ExchangeRequestInvalidatedError();
		const requiresAgent = config.client === "trading" && !ownerSigner;
		if (requiresAgent && !agentPublicKey) throw new ExchangeRequestInvalidatedError();
		const registrationLease = captureAgentRegistrationExecutionLease(
			env,
			clientKey as `0x${string}`,
			requiresAgent
				? {
						agentPublicKey: agentPublicKey ?? undefined,
						requireActiveOwner: sessionMode === "agent-only",
					}
				: undefined,
		);
		if (!registrationLease) throw new ExchangeRequestInvalidatedError();
		const requestGeneration = captureExchangeRequestGeneration(env, clientKey, sessionMode, {
			signer: requiresAgent ? "agent" : "user",
			registrationEpoch: registrationLease.epoch.epoch,
			agentPublicKey: registrationLease.agentPublicKey,
			activeOwnerActivationEpoch: registrationLease.activeOwner?.activationEpoch,
			lifecycle: exchangeLifecycle,
		});
		const fn = (exchange as ExchangeClient)[method] as (...args: unknown[]) => Promise<ExchangeResponse<M>>;
		const priority = getExchangeRequestPriority(method, requestParams);
		const defaultPreExecutionGuard: AgentRegistrationPreExecutionGuard | undefined = preExecutionGuard
			? (signal) => preExecutionGuard(requestParams as ExchangeParams<M>, signal)
			: undefined;
		const verifyLegalAccess = async (forceFresh: boolean) => {
			if (!enforceLegalActions) return;
			await verifyLegalActionAllowed({
				queryClient,
				info,
				env,
				owner: clientKey as `0x${string}`,
				capability: getExchangeLegalCapability(method),
				forceFresh,
			});
		};
		const startWithSessionLease = async (
			start: Parameters<ExchangeRequestStartGate>[0],
			guard: AgentRegistrationPreExecutionGuard | undefined = defaultPreExecutionGuard,
		) => {
			const guarded = await startAgentRegistrationExecution(
				registrationLease,
				() => {
					ownerSigner?.assertCurrent();
					return exchangeLifecycle.active;
				},
				() => Promise.resolve(start()),
				guard,
			);
			return guarded.status === "started" ? await guarded.execution : { status: "invalidated" as const };
		};
		const startWithLegalGate: ExchangeRequestStartGate = async (start) => {
			if (!fundsAction) {
				await verifyLegalAccess(false);
				return startWithSessionLease(start);
			}
			return runWithFundsActionLock(env, clientKey, async () => {
				let fundsPreExecutionGuard: AgentRegistrationPreExecutionGuard | undefined;
				if (config.client === "user") {
					fundsPreExecutionGuard = async (signal) => {
						await defaultPreExecutionGuard?.(signal);
						await verifyLegalAccess(true);
					};
				} else {
					await verifyLegalAccess(true);
					fundsPreExecutionGuard = defaultPreExecutionGuard;
				}

				const started = await startWithSessionLease(start, fundsPreExecutionGuard);
				if (started.status === "invalidated") return started;
				const response = await started.execution;
				return { status: "started", execution: Promise.resolve(response) };
			});
		};
		return scheduleExchangeRequest(
			exchange,
			priority,
			() => {
				ownerSigner?.assertCurrent();
				assertExchangeMutationAllowed(method, requestParams, portfolioMarginActivationEnabled);
				assertExecutionAllowed(method, requestParams as ExchangeParams<M>, executionGuard);
				return requestParams !== undefined ? fn.call(exchange, requestParams) : fn.call(exchange);
			},
			requestGeneration,
			startWithLegalGate,
			getExchangeStartDeadlineMs(method),
		);
	};

	return useMutation({
		...mutationOptions,
		// A user may retry explicitly after reconciling balances/history, but a
		// post-signing transport failure must never be replayed automatically.
		...(fundsAction ? { retry: false } : {}),
		mutationKey,
		mutationFn,
	});
}
