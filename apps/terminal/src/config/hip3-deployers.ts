export const HIP3_DISCLAIMER_VERSION = 1;

const HIP3_DEPLOYER_DOCUMENTATION_URLS: Readonly<Record<string, string>> = {
	xyz: "https://docs.trade.xyz/consolidated-resources/specification-index",
	hyna: "https://docs.hyena.trade/",
	cash: "https://docs.dreamcash.xyz",
	mkts: "https://docs.markets.xyz",
	para: "https://docs.paragon.trade/",
	io: "https://docs.entropy.io/",
};

export function getHip3DeployerDocumentationUrl(dex: string): string | undefined {
	return HIP3_DEPLOYER_DOCUMENTATION_URLS[dex.trim().toLowerCase()];
}
