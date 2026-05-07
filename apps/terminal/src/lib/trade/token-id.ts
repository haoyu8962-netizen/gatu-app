export function formatTokenId(token: { name: string; tokenId: string | number }): string {
	return `${token.name}:${token.tokenId}`;
}
