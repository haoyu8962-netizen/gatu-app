import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { Address } from "viem";
import { DEFAULT_BUILDER_CONFIG } from "@/config/hyperliquid";
import {
	type AccountModeSetupFailure,
	type AccountModeSetupLegalStatus,
	type AccountModeSetupOrderHistory,
	type AccountModeSetupSignerStatus,
	getAccountModeSetupDecision,
	getAccountModeSetupFundingState,
	getExchangeRejectionText,
	isTerminalAccountModeSetupRejection,
} from "@/domain/trade/account-mode-setup";
import { getTradingAccountFundingState } from "@/domain/trade/onboarding";
import { fetchFreshAccountAbstraction } from "@/hooks/trade/use-account-abstraction-guard";
import { normalizeAccountAbstraction, useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { infoKey, useExchange, useHyperliquid, useInfo, useLegalStatus, useTradingStatus } from "@/lib/hyperliquid";
import {
	beginAccountModeSetupAttempt,
	failAccountModeSetupAttempt,
	getAccountModeSetupAttemptStatus,
	settleAccountModeSetupAttempt,
	subscribeAccountModeSetupAttempts,
} from "@/lib/trade/account-mode-setup-attempts";
import { clearAccountModeSetup, publishAccountModeSetup } from "@/stores/use-account-mode-setup-store";

interface RunnerProps {
	address: Address;
}

class AccountModeAlreadySetError extends Error {
	constructor() {
		super("The account mode is no longer the protocol default");
		this.name = "AccountModeAlreadySetError";
	}
}

class AccountHasOrderHistoryError extends Error {
	constructor() {
		super("The account has order history");
		this.name = "AccountHasOrderHistoryError";
	}
}

class AccountModeSetupConditionsChangedError extends Error {
	constructor() {
		super("The conditions for the automatic account mode no longer hold");
		this.name = "AccountModeSetupConditionsChangedError";
	}
}

function classifySetupFailure(error: unknown): AccountModeSetupFailure {
	if (error instanceof AccountModeAlreadySetError) return "skipped";
	if (error instanceof AccountHasOrderHistoryError) return "rejected";
	const rejection = getExchangeRejectionText(error);
	return rejection !== null && isTerminalAccountModeSetupRejection(rejection) ? "rejected" : "failed";
}

function getLegalStatus(
	status: { userAllowed: boolean; canPerformActions: boolean; acceptedTerms: boolean } | undefined,
): AccountModeSetupLegalStatus {
	if (!status) return "loading";
	if (!status.userAllowed || !status.canPerformActions) return "blocked";
	return status.acceptedTerms ? "allowed" : "loading";
}

function getSignerStatus(isSignerReady: boolean, isSignerLoading: boolean): AccountModeSetupSignerStatus {
	if (isSignerReady) return "ready";
	return isSignerLoading ? "loading" : "action-required";
}

function getOrderHistoryStatus(history: {
	data: unknown;
	isError: boolean;
	isFetching: boolean;
	isSuccess: boolean;
}): AccountModeSetupOrderHistory {
	if (history.isFetching) return "loading";
	if (history.isError) return "error";
	if (!history.isSuccess) return "loading";
	if (!Array.isArray(history.data)) return "error";
	return history.data.length === 0 ? "empty" : "present";
}

export function UnifiedAccountAutoSetup() {
	const { address } = useWalletSession();
	const { env } = useHyperliquid();
	const { data: accountAbstraction } = useInfo(
		"userAbstraction",
		{ user: address ?? "" },
		{ enabled: !!address, staleTime: 30_000, retry: 1, select: normalizeAccountAbstraction },
	);

	if (!address || accountAbstraction !== "default") return null;
	return <UnifiedAccountAutoSetupRunner key={`${env}:${address.toLowerCase()}`} address={address} />;
}

function UnifiedAccountAutoSetupRunner({ address }: RunnerProps) {
	const owner = address.toLowerCase();
	const queryClient = useQueryClient();
	const { env, info, sessionMode } = useHyperliquid();
	const attemptKey = `${env}:${owner}`;
	const balances = useDefaultDexBalances();
	const { isSignerLoading, isSignerReady, signerMode } = useTradingStatus();
	const legalStatus = useLegalStatus().data;
	const attempt = useSyncExternalStore(
		subscribeAccountModeSetupAttempts,
		() => getAccountModeSetupAttemptStatus(attemptKey),
		() => getAccountModeSetupAttemptStatus(attemptKey),
	);
	const fundingInput = {
		isConnected: true,
		isLoading: balances.isLoading,
		hasError: balances.hasError,
		hasPerpSnapshot: balances.hasAllDexsSnapshot,
		hasSpotSnapshot: balances.hasSpotStateSnapshot,
		spotBalances: balances.spotBalances.map((balance) => balance.total),
	};
	const snapshotAccountValues = balances.allDexClearinghouseStates.map(([, state]) => state.marginSummary.accountValue);
	const fundingState = getAccountModeSetupFundingState({
		snapshots: getTradingAccountFundingState({ ...fundingInput, perpAccountValues: snapshotAccountValues }),
		withCachedSummary: getTradingAccountFundingState({
			...fundingInput,
			perpAccountValues: [...snapshotAccountValues, balances.marginSummary?.accountValue],
		}),
		snapshotsCurrent:
			balances.hasAllDexsSnapshot &&
			balances.hasSpotStateSnapshot &&
			balances.perpStateStatus === "success" &&
			balances.spotStateStatus === "success" &&
			!balances.isLoading &&
			!balances.hasError,
	});
	const isAgentOnlySession = sessionMode === "agent-only";
	const isBuilderAccount = owner === DEFAULT_BUILDER_CONFIG?.b.toLowerCase();
	const orderHistory = useInfo(
		"historicalOrders",
		{ user: address },
		{
			enabled:
				balances.accountAbstraction === "default" &&
				!isAgentOnlySession &&
				!isBuilderAccount &&
				fundingState === "funded",
			staleTime: 0,
			refetchOnMount: "always",
			retry: 1,
		},
	);
	const decision = getAccountModeSetupDecision({
		accountAbstraction: balances.accountAbstraction,
		isAgentOnlySession,
		isBuilderAccount,
		fundingState,
		legal: getLegalStatus(legalStatus),
		signer: getSignerStatus(isSignerReady, isSignerLoading),
		orderHistory: getOrderHistoryStatus(orderHistory),
		attempt,
	});

	async function assertStillNewAccount(_params: unknown, signal: AbortSignal) {
		const fresh = await fetchFreshAccountAbstraction(queryClient, info, env, address, signal);
		if (fresh !== "default") throw new AccountModeAlreadySetError();
		const orders: unknown = await info.historicalOrders({ user: address }, signal);
		signal.throwIfAborted();
		if (!Array.isArray(orders)) throw new Error("The order history answer could not be read");
		if (orders.length > 0) {
			queryClient.setQueryData(infoKey("historicalOrders", { user: address }, env), orders);
			throw new AccountHasOrderHistoryError();
		}
	}
	const conditionsHoldRef = useRef(false);
	function assertConditionsStillHold() {
		if (!conditionsHoldRef.current) throw new AccountModeSetupConditionsChangedError();
	}
	const { mutateAsync: setByOwner } = useExchange("userSetAbstraction", {
		executionGuard: assertConditionsStillHold,
		preExecutionGuard: assertStillNewAccount,
	});
	const { mutateAsync: setByAgent } = useExchange("agentSetAbstraction", {
		executionGuard: assertConditionsStillHold,
		preExecutionGuard: assertStillNewAccount,
	});

	useLayoutEffect(() => {
		conditionsHoldRef.current = decision.conditionsHold;
		publishAccountModeSetup(owner, decision.kind);
	}, [decision.conditionsHold, decision.kind, owner]);

	useLayoutEffect(() => {
		return () => {
			conditionsHoldRef.current = false;
			clearAccountModeSetup(owner);
		};
	}, [owner]);

	useEffect(() => {
		if (!decision.canAttempt || !beginAccountModeSetupAttempt(attemptKey)) return;

		const abstractionKey = infoKey("userAbstraction", { user: address }, env);
		const request =
			signerMode === "owner"
				? setByOwner({ user: address, abstraction: "unifiedAccount" })
				: setByAgent({ abstraction: "u" });
		void request.then(
			() => {
				queryClient.setQueryData(abstractionKey, "unifiedAccount");
				settleAccountModeSetupAttempt(attemptKey);
				void queryClient.invalidateQueries({ queryKey: abstractionKey, exact: true });
				void queryClient.invalidateQueries({ queryKey: ["hl", "info", "clearinghouseState"] });
				void queryClient.invalidateQueries({ queryKey: ["hl", "info", "spotClearinghouseState"] });
			},
			(error: unknown) => {
				const failure = classifySetupFailure(error);
				if (failure === "skipped") void queryClient.invalidateQueries({ queryKey: abstractionKey, exact: true });
				failAccountModeSetupAttempt(attemptKey, failure);
			},
		);
	}, [address, attemptKey, decision.canAttempt, env, queryClient, setByAgent, setByOwner, signerMode]);

	return null;
}
