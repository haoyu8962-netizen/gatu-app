import type { ReactNode } from "react";
import { createContext, useContext, useRef } from "react";
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
import { registerChaosHarness } from "./internal/websocket/chaos";
import { registerDebugSnapshot, setDebugStore } from "./internal/websocket/debug";
import { registerHealthReport } from "./internal/websocket/health";
import {
	HyperliquidContext,
	HyperliquidTransportContext,
	type HyperliquidTransportContextValue,
} from "./provider-context";
import type { HyperliquidEnv } from "./signing/types";
import { createHyperliquidStore, type HyperliquidStore, type HyperliquidStoreState } from "./store";

export { HyperliquidTransportContext, type HyperliquidTransportContextValue } from "./provider-context";

const DIAGNOSTICS_STORAGE_KEY = "hl-diagnostics-enabled";

export const HyperliquidStoreContext = createContext<HyperliquidStore | null>(null);

export interface HyperliquidTransportProviderProps {
	children: ReactNode;
	env: HyperliquidEnv;
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

export function HyperliquidTransportProvider({ children, env }: HyperliquidTransportProviderProps) {
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

	const value = {
		info: getInfoClient(isTestnet),
		subscription: getSubscriptionClient(isTestnet),
		env,
		isTestnet,
	};

	return (
		<HyperliquidStoreContext.Provider value={storeRef.current}>
			<HyperliquidTransportContext.Provider value={value}>{children}</HyperliquidTransportContext.Provider>
		</HyperliquidStoreContext.Provider>
	);
}

export function useHyperliquidTransport(): HyperliquidTransportContextValue {
	const context = useContext(HyperliquidTransportContext);
	const legacyContext = useContext(HyperliquidContext);
	if (context) return context;
	if (legacyContext) return legacyContext;
	throw new Error("useHyperliquidTransport must be used within a HyperliquidTransportProvider");
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
