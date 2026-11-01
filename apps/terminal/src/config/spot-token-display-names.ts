import type { HyperliquidEnv } from "@sairn/hl-react";

/** Token index, the token name that index must carry, and the name the official terminal shows. */
export type SpotTokenDisplayNameEntry = readonly [index: number, tokenName: string, displayName: string];

/**
 * The official terminal's spot display names, in its order (docs/spot-market-names.md owns the
 * source, the re-sync procedure and the entries left out). Hyperliquid's API has no such table.
 */
export const SPOT_TOKEN_DISPLAY_NAMES: Readonly<Record<HyperliquidEnv, readonly SpotTokenDisplayNameEntry[]>> = {
	Mainnet: [
		[197, "UBTC", "BTC"],
		[221, "UETH", "ETH"],
		[254, "USOL", "SOL"],
		[269, "UFART", "FARTCOIN"],
		[268, "USDT0", "USDT"],
		[292, "HPENGU", "PENGU"],
		[297, "XAUT0", "XAUT"],
		[299, "UPUMP", "PUMP"],
		[26, "PUMP", "PUMP-26"],
		[19, "ANSEM", "ANSEM-19"],
		[293, "PAIR", "PEAR"],
		[71, "PEAR", "PEAR-71"],
		[844, "UANSEM", "ANSEM"],
		[319, "UUUSPX", "SPX"],
		[320, "UBONK", "BONK"],
		[246, "WMNT", "MNT"],
		[343, "UXPL", "XPL"],
		[361, "UDZ", "2Z"],
		[338, "UENA", "ENA"],
		[164, "MON", "MONPRO"],
		[383, "UMON", "MON"],
		[395, "MMOVE", "MOVE"],
		[419, "UZEC", "ZEC"],
		[437, "HSEI", "SEI"],
		[443, "UVIRT", "VIRTUAL"],
		[451, "UAVAX", "AVAX"],
		[513, "ONEAR", "NEAR"],
		[842, "HNIL", "NIL"],
	],
	Testnet: [
		[1129, "UNIT", "BTC"],
		[1242, "UETH", "ETH"],
		[1279, "USOL", "SOL"],
		[1301, "UFART", "FARTCOIN"],
		[1204, "TZERO", "USDT"],
		[1344, "UPUMP", "PUMP"],
		[1370, "USPXS", "SPX"],
		[1398, "UXPL", "XPL"],
		[1427, "UDZ", "2Z"],
		[1426, "UMON", "MON"],
		[1526, "XZEC", "ZEC"],
		[1834, "UAVAX", "AVAX"],
		[1588, "UUVIRT", "VIRTUAL"],
	],
};
