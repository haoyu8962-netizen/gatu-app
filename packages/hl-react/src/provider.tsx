import type { ContextType, ReactNode } from "react";
import { useContext, useMemo } from "react";
import {
	HyperliquidContext,
	type HyperliquidContextValue,
	HyperliquidSessionContext,
	HyperliquidTransportContext,
} from "./provider-context";
import { HyperliquidSessionProvider } from "./session-provider";
import type { BuilderConfig, HyperliquidEnv } from "./signing/types";
import { HyperliquidTransportProvider } from "./transport-provider";

export type {
	HyperliquidContextValue,
	HyperliquidSessionContextValue,
	HyperliquidTransportContextValue,
} from "./provider-context";
export { HyperliquidContext, HyperliquidSessionContext, HyperliquidTransportContext } from "./provider-context";
export { HyperliquidSessionProvider, type HyperliquidSessionProviderProps } from "./session-provider";
export {
	HyperliquidStoreContext,
	HyperliquidTransportProvider,
	type HyperliquidTransportProviderProps,
	useConfig,
	useHyperliquidStore,
	useHyperliquidStoreApi,
	useHyperliquidTransport,
} from "./transport-provider";

export interface HyperliquidProviderProps {
	children: ReactNode;
	env: HyperliquidEnv;
	userAddress: `0x${string}` | undefined;
	allowAgentOnlySession?: boolean;
	builderConfig: BuilderConfig;
	agentName?: string;
	enforceLegalActions?: boolean;
	onAgentCleanupFailure?: (failure: { env: HyperliquidEnv; owner: `0x${string}`; reason: string }) => void;
}

export function HyperliquidProvider({
	children,
	env,
	userAddress,
	allowAgentOnlySession = true,
	builderConfig,
	agentName = "app",
	enforceLegalActions = false,
	onAgentCleanupFailure,
}: HyperliquidProviderProps) {
	return (
		<HyperliquidTransportProvider env={env}>
			<HyperliquidSessionProvider
				userAddress={userAddress}
				allowAgentOnlySession={allowAgentOnlySession}
				builderConfig={builderConfig}
				agentName={agentName}
				enforceLegalActions={enforceLegalActions}
				onAgentCleanupFailure={onAgentCleanupFailure}
			>
				<HyperliquidContextBridge>{children}</HyperliquidContextBridge>
			</HyperliquidSessionProvider>
		</HyperliquidTransportProvider>
	);
}

function HyperliquidContextBridge({ children }: { children: ReactNode }) {
	const transportContext = useContext(HyperliquidTransportContext);
	const sessionContext = useContext(HyperliquidSessionContext);
	if (!transportContext || !sessionContext) {
		throw new Error("HyperliquidContextBridge must be used within the split Hyperliquid providers");
	}
	return (
		<HyperliquidContext.Provider value={combineHyperliquidContexts(transportContext, sessionContext)}>
			{children}
		</HyperliquidContext.Provider>
	);
}

function combineHyperliquidContexts(
	transportContext: NonNullable<ContextType<typeof HyperliquidTransportContext>>,
	sessionContext: NonNullable<ContextType<typeof HyperliquidSessionContext>>,
): HyperliquidContextValue {
	return {
		info: transportContext.info,
		subscription: transportContext.subscription,
		env: transportContext.env,
		isTestnet: transportContext.isTestnet,
		builderConfig: sessionContext.builderConfig,
		agentName: sessionContext.agentName,
		clientKey: sessionContext.clientKey,
		sessionMode: sessionContext.sessionMode,
		exchangeLifecycle: sessionContext.exchangeLifecycle,
		enforceLegalActions: sessionContext.enforceLegalActions,
	};
}

export function useHyperliquid(): HyperliquidContextValue {
	const transportContext = useContext(HyperliquidTransportContext);
	const sessionContext = useContext(HyperliquidSessionContext);
	const legacyContext = useContext(HyperliquidContext);
	const splitContext = useMemo(
		() => (transportContext && sessionContext ? combineHyperliquidContexts(transportContext, sessionContext) : null),
		[transportContext, sessionContext],
	);
	if (legacyContext) return legacyContext;
	if (splitContext) return splitContext;
	throw new Error("useHyperliquid must be used within a HyperliquidProvider");
}

export function useHyperliquidOptional(): HyperliquidContextValue | null {
	const transportContext = useContext(HyperliquidTransportContext);
	const sessionContext = useContext(HyperliquidSessionContext);
	const legacyContext = useContext(HyperliquidContext);
	const splitContext = useMemo(
		() => (transportContext && sessionContext ? combineHyperliquidContexts(transportContext, sessionContext) : null),
		[transportContext, sessionContext],
	);
	if (legacyContext) return legacyContext;
	return splitContext;
}
