import { BRAND_LEGACY_DOMAINS, BRAND_PRIMARY_DOMAINS, type BrandDomainGroup } from "./brand";

export type PublicNetwork = "mainnet" | "testnet";

function originOf(host: string): string {
	return `https://${host}`;
}

function originsOf(group: BrandDomainGroup): Record<PublicNetwork, string> {
	return { mainnet: originOf(group.app), testnet: originOf(group.testnet) };
}

export const PUBLIC_ORIGINS = originsOf(BRAND_PRIMARY_DOMAINS) satisfies Record<PublicNetwork, string>;

const RECOGNIZED_DOMAIN_GROUPS: readonly BrandDomainGroup[] = [BRAND_PRIMARY_DOMAINS, ...BRAND_LEGACY_DOMAINS];

function findGroupForHostname(hostname: string | null | undefined): BrandDomainGroup | null {
	const normalized = hostname?.toLowerCase();
	if (!normalized) return null;
	return RECOGNIZED_DOMAIN_GROUPS.find((group) => group.app === normalized || group.testnet === normalized) ?? null;
}

export function getCanonicalNetworkForHostname(hostname: string | null | undefined): PublicNetwork | null {
	const group = findGroupForHostname(hostname);
	if (!group) return null;
	return group.testnet === hostname?.toLowerCase() ? "testnet" : "mainnet";
}

export function getCanonicalNetworkForOrigin(origin: string | null | undefined): PublicNetwork | null {
	const normalized = origin?.toLowerCase();
	if (!normalized) return null;
	for (const group of RECOGNIZED_DOMAIN_GROUPS) {
		const origins = originsOf(group);
		if (normalized === origins.mainnet) return "mainnet";
		if (normalized === origins.testnet) return "testnet";
	}
	return null;
}

export function getPublicOrigin(network: PublicNetwork, currentHostname?: string | null): string {
	const group = findGroupForHostname(currentHostname) ?? BRAND_PRIMARY_DOMAINS;
	return originsOf(group)[network];
}
