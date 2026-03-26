import { isTestnet } from "@/lib/network";

function getExplorerBaseUrl(): string {
	return isTestnet() ? "https://testnet.app.hyperliquid.xyz/explorer" : "https://app.hyperliquid.xyz/explorer";
}

export function getExplorerTxUrl(hash: string): string {
	return `${getExplorerBaseUrl()}/tx/${hash}`;
}

export function getExplorerTokenUrl(tokenId: string): string {
	return `${getExplorerBaseUrl()}/token/${tokenId}`;
}
