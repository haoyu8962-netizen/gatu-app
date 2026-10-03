/**
 * Identifies who a card funding attempt and its notices belong to: the network plus the selected
 * Hyperliquid owner. Kept apart from the destination rules so the page-level gate can compare
 * identities without loading them.
 */
export function getPrivyFiatFundingOwnerKey(network: "mainnet" | "testnet", clientKey: string): string {
	return `${network}:${clientKey.toLowerCase()}`;
}
