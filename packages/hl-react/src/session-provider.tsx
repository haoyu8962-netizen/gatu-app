import type { ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import {
	type ExchangeProviderLifecycleLease,
	invalidateExchangeProviderLifecycle,
	invalidateExchangeRequestIdentity,
} from "./internal/exchange/request-scheduler";
import { HyperliquidSessionContext } from "./provider-context";
import {
	activateAgentRegistrationSession,
	closeAgentRegistrationSessionAndRemove,
} from "./signing/agent-registration-session";
import {
	ensureActiveAgentOwnerRevision,
	resolveSession,
	type SessionMode,
	useActiveAgentOwner,
} from "./signing/agent-session";
import type { BuilderConfig, HyperliquidEnv } from "./signing/types";
import { useHyperliquidTransport } from "./transport-provider";

export { HyperliquidSessionContext, type HyperliquidSessionContextValue } from "./provider-context";

export interface HyperliquidSessionProviderProps {
	children: ReactNode;
	userAddress: `0x${string}` | undefined;
	allowAgentOnlySession?: boolean;
	builderConfig: BuilderConfig;
	agentName?: string;
	enforceLegalActions?: boolean;
	onAgentCleanupFailure?: (failure: { env: HyperliquidEnv; owner: `0x${string}`; reason: string }) => void;
}

export function HyperliquidSessionProvider({
	children,
	userAddress,
	allowAgentOnlySession = true,
	builderConfig,
	agentName = "app",
	enforceLegalActions = false,
	onAgentCleanupFailure,
}: HyperliquidSessionProviderProps) {
	const { env } = useHyperliquidTransport();
	const activeAgentOwner = useActiveAgentOwner();
	const { clientKey, sessionMode } = resolveSession(userAddress, allowAgentOnlySession ? activeAgentOwner : null, env);
	const exchangeLifecycleRef = useRef<ExchangeProviderLifecycleLease | null>(null);
	if (!exchangeLifecycleRef.current) {
		exchangeLifecycleRef.current = { id: Symbol("hyperliquid-provider"), active: true };
	}
	const exchangeLifecycle = exchangeLifecycleRef.current;
	const previousExchangeIdentityRef = useRef<{
		env: HyperliquidEnv;
		clientKey: string;
		sessionMode: SessionMode;
	} | null>(null);
	const previousRegistrationIdentityRef = useRef<{ env: HyperliquidEnv; owner: `0x${string}` } | null>(null);
	const onAgentCleanupFailureRef = useRef(onAgentCleanupFailure);
	onAgentCleanupFailureRef.current = onAgentCleanupFailure;

	useLayoutEffect(() => {
		exchangeLifecycle.active = true;
		return () => {
			exchangeLifecycle.active = false;
			queueMicrotask(() => {
				if (!exchangeLifecycle.active) invalidateExchangeProviderLifecycle(exchangeLifecycle);
			});
		};
	}, [exchangeLifecycle]);

	useLayoutEffect(() => {
		const previous = previousExchangeIdentityRef.current;
		const next = clientKey === "disconnected" ? null : { env, clientKey, sessionMode };
		const changed =
			previous?.env !== next?.env ||
			previous?.clientKey.toLowerCase() !== next?.clientKey.toLowerCase() ||
			previous?.sessionMode !== next?.sessionMode;

		if (changed && previous) {
			invalidateExchangeRequestIdentity(previous.env, previous.clientKey, previous.sessionMode);
		}
		previousExchangeIdentityRef.current = next;
	}, [clientKey, env, sessionMode]);

	useLayoutEffect(() => {
		const previous = previousRegistrationIdentityRef.current;
		const next = clientKey === "disconnected" ? null : { env, owner: clientKey.toLowerCase() as `0x${string}` };
		if (!next) {
			// A wallet connector can briefly lose its active signer while Privy
			// restores an embedded wallet. Keep the last confirmed owner so that
			// this fail-closed execution state cannot destroy its stored Agent.
			// Explicit logout performs verified cleanup in useDisconnectWallet.
			return;
		}
		const changed = previous?.env !== next?.env || previous?.owner.toLowerCase() !== next?.owner.toLowerCase();

		if (changed && previous) {
			void closeAgentRegistrationSessionAndRemove(previous.env, previous.owner, {
				preserveIfSubmissionStarted: true,
				restoreOnFailure: false,
			})
				.then((result) => {
					if (result.status === "failed") {
						onAgentCleanupFailureRef.current?.({
							env: previous.env,
							owner: previous.owner,
							reason: result.reason,
						});
					}
				})
				.catch(() => {
					onAgentCleanupFailureRef.current?.({
						env: previous.env,
						owner: previous.owner,
						reason: "unexpected_failure",
					});
				});
		}
		void activateAgentRegistrationSession(next.env, next.owner).then((active) => {
			if (active && sessionMode === "agent-only") {
				void ensureActiveAgentOwnerRevision(next.env, next.owner);
			}
		});
		previousRegistrationIdentityRef.current = next;
	}, [clientKey, env, sessionMode]);

	const value = {
		clientKey,
		sessionMode,
		agentName,
		builderConfig,
		exchangeLifecycle,
		enforceLegalActions,
	};

	return <HyperliquidSessionContext.Provider value={value}>{children}</HyperliquidSessionContext.Provider>;
}
