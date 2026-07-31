import {
	ExchangeClient,
	HttpTransport,
	type HttpTransportOptions,
	InfoClient,
	type IRequestTransport,
	type ISubscriptionTransport,
	SubscriptionClient,
	WebSocketTransport,
	type WebSocketTransportOptions,
} from "@nktkas/hyperliquid";
import type { AbstractWallet } from "@nktkas/hyperliquid/signing";
import type { PrivateKeyAccount } from "viem/accounts";
import { createCrossTabNonceManager } from "./internal/exchange/cross-tab-nonce-manager";
import { invalidateExchangeClientRequests } from "./internal/exchange/request-scheduler";
import { getSdkReconnectionDelayMs } from "./internal/websocket/reliability";
import { createWsTransportMonitor, type WsTransportMonitor } from "./internal/websocket/transport-monitor";
import { LRU } from "./lru";
import { createL1AgentWallet } from "./signing/l1-agent-wallet";

const cache = new Map<string, unknown>();

function getOrCreate<T>(key: string, create: () => T): T {
	let value = cache.get(key) as T | undefined;
	if (!value) {
		value = create();
		cache.set(key, value);
	}
	return value;
}

/** @internal — exported only for tests; do not consume from outside this package. */
export const tradingClientCache = new LRU<string, ExchangeClient>(4);
const agentTradingClientCache = new LRU<string, ExchangeClient>(4);

function getHttpOptions(isTestnet: boolean): HttpTransportOptions {
	return { isTestnet };
}

function getWsOptions(isTestnet: boolean): WebSocketTransportOptions {
	return {
		isTestnet,
		reconnect: {
			maxRetries: Infinity,
			connectionTimeout: 10_000,
			reconnectionDelay: getSdkReconnectionDelayMs,
		},
	};
}

export function getHttpTransport(isTestnet: boolean): IRequestTransport {
	return getOrCreate(`http:${isTestnet}`, () => new HttpTransport(getHttpOptions(isTestnet)));
}

export function getWsTransport(isTestnet: boolean): ISubscriptionTransport {
	return getOrCreate(`ws:${isTestnet}`, () => new WebSocketTransport(getWsOptions(isTestnet)));
}

// rews v4 exposes reconnect() to cycle the connection without terminating it,
// which re-runs the SDK's resubscribe flow. `transport.socket` is an SDK
// implementation detail — if @nktkas/hyperliquid hides or renames it, this
// trigger must be updated. Guarded by an instanceof check so non-WS transports
// (e.g. in-memory fakes used in tests) cleanly return a no-op.
export function createWsReconnectTrigger(isTestnet: boolean): () => void {
	const transport = getWsTransport(isTestnet);
	if (!(transport instanceof WebSocketTransport)) return () => {};
	const socket = transport.socket;
	if (!socket || typeof socket.reconnect !== "function") return () => {};
	return () => socket.reconnect();
}

function getWsTransportMonitor(isTestnet: boolean): WsTransportMonitor | undefined {
	const transport = getWsTransport(isTestnet);
	if (!(transport instanceof WebSocketTransport)) return undefined;
	return getOrCreate(`ws-monitor:${isTestnet}`, () => createWsTransportMonitor(transport.socket));
}

export function subscribeWsReconnect(isTestnet: boolean, listener: (generation: number) => void): () => void {
	return getWsTransportMonitor(isTestnet)?.subscribeReconnect(listener) ?? (() => {});
}

export function getInfoClient(isTestnet: boolean): InfoClient {
	return getOrCreate(`info:${isTestnet}`, () => new InfoClient({ transport: getHttpTransport(isTestnet) }));
}

export function getSubscriptionClient(isTestnet: boolean): SubscriptionClient {
	return getOrCreate(
		`subscription:${isTestnet}`,
		() => new SubscriptionClient({ transport: getWsTransport(isTestnet) }),
	);
}

export function createExchangeClient(wallet: AbstractWallet, isTestnet: boolean, cacheKey?: string): ExchangeClient {
	if (cacheKey) {
		const cached = tradingClientCache.get(cacheKey);
		if (cached) return cached;
	}
	const client = new ExchangeClient({
		transport: getHttpTransport(isTestnet),
		wallet,
		nonceManager: createCrossTabNonceManager(isTestnet ? "Testnet" : "Mainnet"),
	});
	if (cacheKey) {
		tradingClientCache.set(cacheKey, client);
	}
	return client;
}

function isPrivateKeyAccount(wallet: AbstractWallet): wallet is PrivateKeyAccount {
	return "sign" in wallet && typeof (wallet as Record<string, unknown>).sign === "function";
}

export function getTradingClient(wallet: AbstractWallet & { address: string }, isTestnet: boolean): ExchangeClient {
	const key = `${wallet.address.toLowerCase()}:${isTestnet}`;
	const cached = agentTradingClientCache.get(key);
	if (cached) return cached;
	const signingWallet = isPrivateKeyAccount(wallet) ? createL1AgentWallet(wallet) : wallet;
	const client = new ExchangeClient({
		transport: getHttpTransport(isTestnet),
		wallet: signingWallet,
		nonceManager: createCrossTabNonceManager(isTestnet ? "Testnet" : "Mainnet"),
	});
	agentTradingClientCache.set(key, client);
	return client;
}

export function evictTradingClient(address: string, isTestnet: boolean): void {
	const key = `${address.toLowerCase()}:${isTestnet}`;
	const client = agentTradingClientCache.get(key);
	if (client) invalidateExchangeClientRequests(client);
	agentTradingClientCache.delete(key);
}

export function evictAllAgentTradingClients(): void {
	for (const key of Array.from(agentTradingClientCache.keys())) {
		const client = agentTradingClientCache.get(key);
		if (client) invalidateExchangeClientRequests(client);
	}
	agentTradingClientCache.clear();
}

export function initializeClients(isTestnet: boolean): void {
	getInfoClient(isTestnet);
	getSubscriptionClient(isTestnet);
}
