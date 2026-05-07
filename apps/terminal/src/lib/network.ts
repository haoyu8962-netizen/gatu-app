import { STORAGE_KEYS } from "@/config/app";

export type Network = "mainnet" | "testnet";

export function getNetwork(): Network {
	if (typeof window === "undefined") {
		return typeof import.meta !== "undefined" && import.meta.env?.VITE_HYPERLIQUID_TESTNET === "true"
			? "testnet"
			: "mainnet";
	}
	try {
		const stored = localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS);
		if (stored) {
			const parsed = JSON.parse(stored);
			if (parsed?.state?.network === "testnet") return "testnet";
		}
	} catch {
		// fall through
	}
	if (typeof import.meta !== "undefined" && import.meta.env?.VITE_HYPERLIQUID_TESTNET === "true") return "testnet";
	return "mainnet";
}

export function isTestnet(): boolean {
	return getNetwork() === "testnet";
}
