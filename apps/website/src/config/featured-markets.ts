// Ten markets for the ticker, chosen by quota and, inside each category, by 24h notional volume in the
// 2026-10-25 snapshot. Names are written as the deployer writes them; `nameSource` says where.
// The build fails when an entry is delisted or changes category (src/lib/markets/structure.ts).

export type FeaturedCategory = "preipo" | "stocks" | "indices" | "commodities" | "fx" | "crypto";

export interface FeaturedMarket {
	coin: string;
	category: FeaturedCategory;
	/** Company or asset name as the deployer writes it. */
	name: string;
	/** URL the name was read from, or a note when the market has no deployer documentation. */
	nameSource: string;
	/** Named in the hero subhead and linked to its market. */
	hero?: true;
}

export const FEATURED_MARKET_QUOTAS: Readonly<Record<FeaturedCategory, number>> = {
	preipo: 2,
	stocks: 2,
	indices: 1,
	commodities: 2,
	fx: 1,
	crypto: 2,
};

const ENTROPY_PRE_IPO_ASSETS = "https://docs.entropy.io/asset-directory/pre-ipo-assets";
const XYZ_SPECIFICATION_INDEX = "https://docs.trade.xyz/consolidated-resources/specification-index";
const MAIN_DEX_NAME = "main-dex perp; no deployer documentation, asset name";

export const FEATURED_MARKETS: readonly FeaturedMarket[] = [
	{ coin: "io:OAI", category: "preipo", name: "OpenAI", nameSource: ENTROPY_PRE_IPO_ASSETS, hero: true },
	{ coin: "io:ANTH", category: "preipo", name: "Anthropic", nameSource: ENTROPY_PRE_IPO_ASSETS, hero: true },
	{ coin: "xyz:SKHX", category: "stocks", name: "SK hynix", nameSource: XYZ_SPECIFICATION_INDEX },
	{ coin: "xyz:SNDK", category: "stocks", name: "Sandisk", nameSource: XYZ_SPECIFICATION_INDEX },
	{ coin: "xyz:XYZ100", category: "indices", name: "XYZ100", nameSource: XYZ_SPECIFICATION_INDEX },
	{ coin: "xyz:CL", category: "commodities", name: "WTI crude oil", nameSource: XYZ_SPECIFICATION_INDEX },
	{ coin: "xyz:BRENTOIL", category: "commodities", name: "Brent crude oil", nameSource: XYZ_SPECIFICATION_INDEX },
	{ coin: "xyz:JPY", category: "fx", name: "USD/JPY", nameSource: XYZ_SPECIFICATION_INDEX },
	{ coin: "BTC", category: "crypto", name: "Bitcoin", nameSource: MAIN_DEX_NAME },
	{ coin: "ETH", category: "crypto", name: "Ethereum", nameSource: MAIN_DEX_NAME },
];
