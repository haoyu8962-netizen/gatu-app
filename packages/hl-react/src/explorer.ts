/** The explorer lives inside each network's app: `app.hyperliquid.xyz` and `app.hyperliquid-testnet.xyz`. */
function getExplorerBaseUrl(isTestnet: boolean): string {
	return isTestnet ? "https://app.hyperliquid-testnet.xyz/explorer" : "https://app.hyperliquid.xyz/explorer";
}

export function getExplorerTxUrl(hash: string, isTestnet: boolean): string {
	return `${getExplorerBaseUrl(isTestnet)}/tx/${hash}`;
}

export function getExplorerTokenUrl(tokenId: string, isTestnet: boolean): string {
	return `${getExplorerBaseUrl(isTestnet)}/token/${tokenId}`;
}

export function getExplorerAddressUrl(address: string, isTestnet: boolean): string {
	return `${getExplorerBaseUrl(isTestnet)}/address/${address}`;
}
