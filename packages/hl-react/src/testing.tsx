import type { InfoClient, SubscriptionClient } from "@nktkas/hyperliquid";
import type { ReactNode } from "react";
import { useLayoutEffect, useMemo } from "react";
import {
	HyperliquidContext,
	type HyperliquidContextValue,
	HyperliquidSessionContext,
	HyperliquidTransportContext,
	useHyperliquidOptional,
} from "./provider";
import type { BuilderConfig, HyperliquidEnv } from "./signing/types";

export interface MockHyperliquidProviderProps {
	children: ReactNode;
	value?: Partial<HyperliquidContextValue>;
}

function createMockInfoClient(): InfoClient {
	return {
		allMids: async () => ({}),
		clearinghouseState: async () => ({}) as never,
		extraAgents: async () => [],
	} as unknown as InfoClient;
}

function createMockSubscriptionClient(): SubscriptionClient {
	return {
		subscribe: async () => async () => {},
	} as unknown as SubscriptionClient;
}

export function MockHyperliquidProvider({ children, value = {} }: MockHyperliquidProviderProps) {
	const normalizedClientKey = (value.clientKey ?? "mock").toLowerCase();
	const defaultExchangeSession = useMemo(
		() => ({
			id: Symbol("mock-hyperliquid-exchange-session"),
			env: value.env ?? ("Testnet" as HyperliquidEnv),
			clientKey: normalizedClientKey,
			sessionMode: value.sessionMode ?? "wallet",
			active: false,
		}),
		[normalizedClientKey, value.env, value.sessionMode],
	);
	useLayoutEffect(() => {
		defaultExchangeSession.active = true;
		return () => {
			defaultExchangeSession.active = false;
		};
	}, [defaultExchangeSession]);
	const mockValue: HyperliquidContextValue = {
		info: createMockInfoClient(),
		subscription: createMockSubscriptionClient(),
		env: "Testnet" as HyperliquidEnv,
		isTestnet: true,
		builderConfig: { b: "0x0000000000000000000000000000000000000000", f: 0 } as BuilderConfig,
		agentName: "test",
		clientKey: "mock",
		sessionMode: "wallet",
		exchangeLifecycle: { id: Symbol("mock-hyperliquid-provider"), active: true },
		exchangeSession: defaultExchangeSession,
		enforceLegalActions: false,
		...value,
	};
	const transportValue = {
		info: mockValue.info,
		subscription: mockValue.subscription,
		env: mockValue.env,
		isTestnet: mockValue.isTestnet,
	};
	const sessionValue = {
		clientKey: mockValue.clientKey,
		sessionMode: mockValue.sessionMode,
		agentName: mockValue.agentName,
		builderConfig: mockValue.builderConfig,
		exchangeLifecycle: mockValue.exchangeLifecycle,
		exchangeSession: mockValue.exchangeSession,
		enforceLegalActions: mockValue.enforceLegalActions,
	};

	return (
		<HyperliquidTransportContext.Provider value={transportValue}>
			<HyperliquidSessionContext.Provider value={sessionValue}>
				<HyperliquidContext.Provider value={mockValue}>{children}</HyperliquidContext.Provider>
			</HyperliquidSessionContext.Provider>
		</HyperliquidTransportContext.Provider>
	);
}

export function useMockHyperliquid(): HyperliquidContextValue {
	const context = useHyperliquidOptional();
	if (!context) {
		throw new Error("useMockHyperliquid must be used within a MockHyperliquidProvider");
	}
	return context;
}
