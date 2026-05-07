export type MarketCategory = "all" | "trending" | "new" | "defi" | "layer1" | "layer2" | "meme";

export const ASSET_REPLACEMENTS: Record<string, string> = {
	USDT0: "USDT",
};

export const NO_SPOT_PREFIX_ASSETS: Record<string, string> = {
	USDC: "USDC",
};

export const categoryMapping: Record<string, MarketCategory[]> = {
	BTC: ["layer1", "trending"],
	ETH: ["layer1", "defi", "trending"],
	SOL: ["layer1", "trending"],
	AVAX: ["layer1"],
	NEAR: ["layer1"],
	ATOM: ["layer1"],
	DOT: ["layer1"],
	ADA: ["layer1"],
	APT: ["layer1", "new"],
	SUI: ["layer1", "new"],
	SEI: ["layer1", "new"],
	ARB: ["layer2", "defi"],
	OP: ["layer2", "defi"],
	MATIC: ["layer2"],
	BASE: ["layer2", "new"],
	AAVE: ["defi"],
	UNI: ["defi"],
	LINK: ["defi"],
	MKR: ["defi"],
	SNX: ["defi"],
	CRV: ["defi"],
	DOGE: ["meme", "trending"],
	SHIB: ["meme"],
	PEPE: ["meme", "trending"],
	BONK: ["meme"],
	WIF: ["meme", "new"],
	FLOKI: ["meme"],
};
