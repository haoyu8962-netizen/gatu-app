import type { InfoClient } from "@nktkas/hyperliquid";
import { createContext } from "react";
import type { ExchangeProviderLifecycleLease } from "./internal/exchange/request-scheduler";
import type { SessionMode } from "./signing/agent-session";
import type { BuilderConfig, HyperliquidEnv } from "./signing/types";
import type { CompactSubscriptionClient } from "./subscriptions/compact-subscription-client";

export interface HyperliquidExchangeSessionLease {
	readonly id: symbol;
	readonly env: HyperliquidEnv;
	readonly clientKey: string;
	readonly sessionMode: SessionMode;
	active: boolean;
}

export interface HyperliquidTransportContextValue {
	info: InfoClient;
	subscription: CompactSubscriptionClient;
	env: HyperliquidEnv;
	isTestnet: boolean;
}

export interface HyperliquidSessionContextValue {
	clientKey: string;
	sessionMode: SessionMode;
	agentName: string;
	builderConfig: BuilderConfig;
	exchangeLifecycle: ExchangeProviderLifecycleLease;
	exchangeSession: HyperliquidExchangeSessionLease;
	enforceLegalActions: boolean;
}

export interface HyperliquidContextValue extends HyperliquidTransportContextValue, HyperliquidSessionContextValue {}

export const HyperliquidTransportContext = createContext<HyperliquidTransportContextValue | null>(null);
export const HyperliquidSessionContext = createContext<HyperliquidSessionContextValue | null>(null);

// Compatibility surface for direct provider-subpath consumers. The application provider uses the
// split contexts; this context remains available to existing test and integration wrappers.
export const HyperliquidContext = createContext<HyperliquidContextValue | null>(null);
