export type PublicNetwork = "mainnet" | "testnet";

export const PUBLIC_ORIGINS = {
	mainnet: "https://app.gatu.ai",
	testnet: "https://testnet.gatu.ai",
} as const satisfies Record<PublicNetwork, string>;

export function getCanonicalNetworkForHostname(hostname: string | null | undefined): PublicNetwork | null {
	const normalized = hostname?.toLowerCase();
	if (normalized === "app.gatu.ai") return "mainnet";
	if (normalized === "testnet.gatu.ai") return "testnet";
	return null;
}

export function getCanonicalNetworkForOrigin(origin: string | null | undefined): PublicNetwork | null {
	const normalized = origin?.toLowerCase();
	if (normalized === PUBLIC_ORIGINS.mainnet) return "mainnet";
	if (normalized === PUBLIC_ORIGINS.testnet) return "testnet";
	return null;
}

export function getPublicOrigin(network: PublicNetwork): string {
	return PUBLIC_ORIGINS[network];
}
