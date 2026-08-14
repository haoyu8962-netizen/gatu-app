import type { InfoClient, SubscriptionClient } from "@nktkas/hyperliquid";
import type { ReactNode } from "react";
import { createContext, useContext, useLayoutEffect, useRef } from "react";
import { useStore } from "zustand";
import {
	createWsReconnectTrigger,
	getHttpTransport,
	getInfoClient,
	getSubscriptionClient,
	getWsTransport,
	initializeClients,
	subscribeWsDisconnect,
} from "./clients";
import { createHyperliquidConfig } from "./create-config";
import { ProviderNotFoundError } from "./errors";
import {
	type ExchangeProviderLifecycleLease,
	invalidateExchangeProviderLifecycle,
	invalidateExchangeRequestIdentity,
} from "./internal/exchange/request-scheduler";
import { registerChaosHarness } from "./internal/websocket/chaos";
import { registerDebugSnapshot, setDebugStore } from "./internal/websocket/debug";
import { registerHealthReport } from "./internal/websocket/health";
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
import { createHyperliquidStore, type HyperliquidStore, type HyperliquidStoreState } from "./store";

const DIAGNOSTICS_STORAGE_KEY = "hl-diagnostics-enabled";

export interface HyperliquidContextValue {
	info: InfoClient;
	subscription: SubscriptionClient;
	env: HyperliquidEnv;
	isTestnet: boolean;
	builderConfig: BuilderConfig;
	agentName: string;
	clientKey: string;
	sessionMode: SessionMode;
	exchangeLifecycle: ExchangeProviderLifecycleLease;
}

export const HyperliquidContext = createContext<HyperliquidContextValue | null>(null);
export const HyperliquidStoreContext = createContext<HyperliquidStore | null>(null);

export interface HyperliquidProviderProps {
	children: ReactNode;
	env: HyperliquidEnv;
	userAddress: `0x${string}` | undefined;
	allowAgentOnlySession?: boolean;
	builderConfig: BuilderConfig;
	agentName?: string;
	onAgentCleanupFailure?: (failure: { env: HyperliquidEnv; owner: `0x${string}`; reason: string }) => void;
}

function shouldExposeDiagnostics(): boolean {
	if (import.meta.env.DEV) return true;
	if (typeof window === "undefined") return false;

	try {
		const params = new URLSearchParams(window.location.search);
		const diagnosticsFlag = params.get("hl_diagnostics");

		if (diagnosticsFlag === "1" || diagnosticsFlag === "true") {
			return true;
		}

		if (diagnosticsFlag === "0" || diagnosticsFlag === "false") {
			return false;
		}

		return window.localStorage.getItem(DIAGNOSTICS_STORAGE_KEY) === "1";
	} catch {
		return false;
	}
}

export function HyperliquidProvider({
	children,
	env,
	userAddress,
	allowAgentOnlySession = true,
	builderConfig,
	agentName = "app",
	onAgentCleanupFailure,
}: HyperliquidProviderProps) {
	const isTestnet = env === "Testnet";

	const initRef = useRef(false);
	if (!initRef.current) {
		initializeClients(isTestnet);
		initRef.current = true;
	}

	const storeRef = useRef<HyperliquidStore | null>(null);
	if (!storeRef.current) {
		storeRef.current = createHyperliquidStore(
			createHyperliquidConfig({
				httpTransport: getHttpTransport(isTestnet),
				wsTransport: getWsTransport(isTestnet),
				ssr: false,
				triggerReconnect: createWsReconnectTrigger(isTestnet),
				subscribeDisconnect: (listener) => subscribeWsDisconnect(isTestnet, listener),
			}),
		);
		setDebugStore(storeRef.current);
		if (import.meta.env.DEV) registerChaosHarness(storeRef.current);
		if (shouldExposeDiagnostics()) {
			registerDebugSnapshot(storeRef.current);
			registerHealthReport(storeRef.current);
		}
	}

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
		info: getInfoClient(isTestnet),
		subscription: getSubscriptionClient(isTestnet),
		env,
		isTestnet,
		builderConfig,
		agentName,
		clientKey,
		sessionMode,
		exchangeLifecycle,
	};

	return (
		<HyperliquidStoreContext.Provider value={storeRef.current}>
			<HyperliquidContext.Provider value={value}>{children}</HyperliquidContext.Provider>
		</HyperliquidStoreContext.Provider>
	);
}

export function useHyperliquid(): HyperliquidContextValue {
	const context = useContext(HyperliquidContext);
	if (!context) {
		throw new Error("useHyperliquid must be used within a HyperliquidProvider");
	}
	return context;
}

export function useHyperliquidOptional(): HyperliquidContextValue | null {
	return useContext(HyperliquidContext);
}

export function useHyperliquidStoreApi() {
	const store = useContext(HyperliquidStoreContext);
	if (!store) {
		throw new ProviderNotFoundError();
	}
	return store;
}

export function useHyperliquidStore<T>(selector: (state: HyperliquidStoreState) => T): T {
	return useStore(useHyperliquidStoreApi(), selector);
}

export function useConfig() {
	return useHyperliquidStore((state) => state.config);
}
