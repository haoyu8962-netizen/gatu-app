import { type InfoClient, type SubscriptionClient, WebSocketTransport } from "@nktkas/hyperliquid";
import type { ReactNode } from "react";
import { createContext, useContext, useRef } from "react";
import { useStore } from "zustand";
import { getHttpTransport, getInfoClient, getSubscriptionClient, getWsTransport, initializeClients } from "./clients";
import { createHyperliquidConfig } from "./create-config";
import { ProviderNotFoundError } from "./errors";
import { registerChaosHarness } from "./internal/websocket/chaos";
import { registerDebugSnapshot, setDebugStore } from "./internal/websocket/debug";
import type { BuilderConfig, HyperliquidEnv } from "./signing/types";
import { createHyperliquidStore, type HyperliquidStore, type HyperliquidStoreState } from "./store";

export interface HyperliquidContextValue {
	info: InfoClient;
	subscription: SubscriptionClient;
	env: HyperliquidEnv;
	isTestnet: boolean;
	builderConfig: BuilderConfig;
	agentName: string;
	clientKey: string;
}

export const HyperliquidContext = createContext<HyperliquidContextValue | null>(null);
export const HyperliquidStoreContext = createContext<HyperliquidStore | null>(null);

export interface HyperliquidProviderProps {
	children: ReactNode;
	env: HyperliquidEnv;
	userAddress: `0x${string}` | undefined;
	builderConfig: BuilderConfig;
	agentName?: string;
}

export function HyperliquidProvider({
	children,
	env,
	userAddress,
	builderConfig,
	agentName = "app",
}: HyperliquidProviderProps) {
	const isTestnet = env === "Testnet";

	const initRef = useRef(false);
	if (!initRef.current) {
		initializeClients(isTestnet);
		initRef.current = true;
	}

	const storeRef = useRef<HyperliquidStore | null>(null);
	if (!storeRef.current) {
		const wsTransport = getWsTransport(isTestnet);
		storeRef.current = createHyperliquidStore(
			createHyperliquidConfig({
				httpTransport: getHttpTransport(isTestnet),
				wsTransport,
				ssr: false,
				triggerReconnect:
					wsTransport instanceof WebSocketTransport
						? () => wsTransport.socket.close(undefined, undefined, false)
						: undefined,
			}),
		);
		setDebugStore(storeRef.current);
		if (import.meta.env.DEV) {
			registerChaosHarness(storeRef.current);
			registerDebugSnapshot(storeRef.current);
		}
	}

	const clientKey = userAddress ?? "disconnected";

	const value = {
		info: getInfoClient(isTestnet),
		subscription: getSubscriptionClient(isTestnet),
		env,
		isTestnet,
		builderConfig,
		agentName,
		clientKey,
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
