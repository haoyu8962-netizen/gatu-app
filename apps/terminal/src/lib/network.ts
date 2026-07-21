import { STORAGE_KEYS } from "@/config/app";

export type Network = "mainnet" | "testnet";

function parseNetwork(value: unknown): Network | null {
	return value === "mainnet" || value === "testnet" ? value : null;
}

function getDefaultNetwork(): Network {
	return typeof import.meta !== "undefined" && import.meta.env?.VITE_HYPERLIQUID_TESTNET === "true"
		? "testnet"
		: "mainnet";
}

function readLegacyNetwork(): Network | null {
	const stored = localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS);
	if (!stored) return null;

	const parsed = JSON.parse(stored) as { state?: { network?: unknown } };
	return parseNetwork(parsed.state?.network);
}

export function getNetwork(): Network {
	if (typeof window === "undefined") return getDefaultNetwork();

	try {
		const dedicatedNetwork = parseNetwork(localStorage.getItem(STORAGE_KEYS.NETWORK));
		if (dedicatedNetwork) return dedicatedNetwork;

		const legacyNetwork = readLegacyNetwork();
		if (legacyNetwork) return legacyNetwork;
	} catch {
		return getDefaultNetwork();
	}

	return getDefaultNetwork();
}

export function persistNetwork(network: Network): void {
	if (typeof window === "undefined") return;
	localStorage.setItem(STORAGE_KEYS.NETWORK, network);
}

export function subscribeNetworkStorage(listener: (network: Network) => void): () => void {
	if (typeof window === "undefined") return () => {};

	const handleStorage = (event: StorageEvent) => {
		if (event.key !== STORAGE_KEYS.NETWORK) return;
		const network = parseNetwork(event.newValue);
		if (network) listener(network);
	};

	window.addEventListener("storage", handleStorage);
	return () => window.removeEventListener("storage", handleStorage);
}

export function isTestnet(): boolean {
	return getNetwork() === "testnet";
}
