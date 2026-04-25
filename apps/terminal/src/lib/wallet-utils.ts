import { FlaskIcon, WalletIcon } from "@phosphor-icons/react";
import type { Address } from "viem";
import type { Connector } from "wagmi";
import { RECENT_WALLETS_LIMIT, STORAGE_KEYS } from "@/config/app";
import { WALLET_INFO, type WalletInfo } from "@/config/wallets";

export type { WalletInfo } from "@/config/wallets";

export interface MockWalletConfig {
	name: string;
	address: Address;
	icon?: React.ComponentType<{ className?: string }>;
}

const DEFAULT_WALLET_INFO: WalletInfo = {
	icon: WalletIcon,
	description: "Connect using this wallet",
	popular: false,
	priority: 99,
};

const mockWalletRegistry = new Map<string, MockWalletConfig>();

export function registerMockWallet(config: MockWalletConfig): void {
	mockWalletRegistry.set(config.name, config);
}

export function getMockWalletConfig(name: string): MockWalletConfig | undefined {
	return mockWalletRegistry.get(name);
}

export function isMockConnector(connector: Connector): boolean {
	return connector.id === "mock" || connector.type === "mock";
}

function getMockWalletInfo(connector: Connector): WalletInfo {
	const config = mockWalletRegistry.get(connector.name);
	const address = config?.address;
	return {
		icon: FlaskIcon,
		description: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Mock wallet for testing",
		popular: false,
		priority: 0,
	};
}

export function getWalletInfo(connector: Connector): WalletInfo {
	if (isMockConnector(connector)) {
		return getMockWalletInfo(connector);
	}
	const info = WALLET_INFO[connector.id] || WALLET_INFO[connector.name];
	if (info) return info;
	return DEFAULT_WALLET_INFO;
}

export function getRecentWallets(): string[] {
	if (typeof window === "undefined") return [];
	const raw = localStorage.getItem(STORAGE_KEYS.RECENT_WALLETS);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((id): id is string => typeof id === "string").slice(0, RECENT_WALLETS_LIMIT);
	} catch {
		return [];
	}
}

export function addRecentWallet(connectorId: string): void {
	if (typeof window === "undefined") return;
	const existing = getRecentWallets().filter((id) => id !== connectorId);
	const next = [connectorId, ...existing].slice(0, RECENT_WALLETS_LIMIT);
	localStorage.setItem(STORAGE_KEYS.RECENT_WALLETS, JSON.stringify(next));
}
