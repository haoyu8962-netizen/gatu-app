import { BRAND_PRIMARY_DOMAINS } from "./brand";

export type PublicNetwork = "mainnet" | "testnet";

export const PUBLIC_ORIGINS = {
	mainnet: `https://${BRAND_PRIMARY_DOMAINS.app}`,
	testnet: `https://${BRAND_PRIMARY_DOMAINS.testnet}`,
} satisfies Record<PublicNetwork, string>;

export function getCanonicalNetworkForHostname(hostname: string | null | undefined): PublicNetwork | null {
	const normalized = hostname?.toLowerCase();
	if (normalized === BRAND_PRIMARY_DOMAINS.app) return "mainnet";
	if (normalized === BRAND_PRIMARY_DOMAINS.testnet) return "testnet";
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
