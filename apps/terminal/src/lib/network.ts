import { STORAGE_KEYS } from "@/config/app";
import { getCanonicalNetworkForHostname, getPublicOrigin, type PublicNetwork } from "@/config/public-origins";

export type Network = PublicNetwork;
export type NetworkSwitchResult = "navigating" | "persisted" | "unchanged";

function parseNetwork(value: unknown): Network | null {
	return value === "mainnet" || value === "testnet" ? value : null;
}

function getDefaultNetwork(): Network {
	return typeof import.meta !== "undefined" && import.meta.env?.VITE_HYPERLIQUID_TESTNET === "true"
		? "testnet"
		: "mainnet";
}

function getBrowserHostname(): string | null {
	return typeof window === "undefined" ? null : window.location.hostname;
}

function readLegacyNetwork(): Network | null {
	const stored = localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS);
	if (!stored) return null;

	const parsed = JSON.parse(stored) as { state?: { network?: unknown } };
	return parseNetwork(parsed.state?.network);
}

export function getNetwork(hostname: string | null = getBrowserHostname()): Network {
	const canonicalNetwork = getCanonicalNetworkForHostname(hostname);
	if (canonicalNetwork) return canonicalNetwork;
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

export function persistNetwork(network: Network, hostname: string | null = getBrowserHostname()): void {
	if (typeof window === "undefined") return;
	if (getCanonicalNetworkForHostname(hostname)) return;
	localStorage.setItem(STORAGE_KEYS.NETWORK, network);
}

export function subscribeNetworkStorage(
	listener: (network: Network) => void,
	hostname: string | null = getBrowserHostname(),
): () => void {
	if (typeof window === "undefined") return () => {};
	if (getCanonicalNetworkForHostname(hostname)) return () => {};

	const handleStorage = (event: StorageEvent) => {
		if (event.key !== STORAGE_KEYS.NETWORK) return;
		const network = parseNetwork(event.newValue);
		if (network) listener(network);
	};

	window.addEventListener("storage", handleStorage);
	return () => window.removeEventListener("storage", handleStorage);
}

export function switchNetwork(
	network: Network,
	hostname: string | null = getBrowserHostname(),
	navigate: (url: string) => void = (url) => window.location.assign(url),
): NetworkSwitchResult {
	const currentNetwork = getNetwork(hostname);
	if (getCanonicalNetworkForHostname(hostname)) {
		if (currentNetwork === network) return "unchanged";
		navigate(getPublicOrigin(network));
		return "navigating";
	}

	persistNetwork(network, hostname);
	return currentNetwork === network ? "unchanged" : "persisted";
}

export function isTestnet(): boolean {
	return getNetwork() === "testnet";
}
