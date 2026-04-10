function getExplorerBaseUrl(isTestnet: boolean): string {
	return isTestnet ? "https://testnet.app.hyperliquid.xyz/explorer" : "https://app.hyperliquid.xyz/explorer";
}

export function getExplorerTxUrl(hash: string, isTestnet = false): string {
	return `${getExplorerBaseUrl(isTestnet)}/tx/${hash}`;
}

export function getExplorerTokenUrl(tokenId: string, isTestnet = false): string {
	return `${getExplorerBaseUrl(isTestnet)}/token/${tokenId}`;
}
