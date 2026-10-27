// Market icons: the same files the terminal and the official Hyperliquid app show (`<base>/<coin>.svg`, HIP-3
// markets under their full `dex:COIN` name), copied into src/assets/coins/ by scripts/market-icons.mjs so the site
// never hotlinks them. Pure helpers, loadable by the scripts and node:test as well as by Vite.

import { dexOfCoin, MAIN_DEX } from "./rules.ts";

/** apps/terminal/src/config/app.ts TOKEN_ICON_BASE_URL; tests/market-icons.test.mjs keeps the two equal. */
export const MARKET_ICON_SOURCE_BASE_URL = "https://app.hyperliquid.xyz/coins";

/** Perp coin names the mapping understands: `BTC`, `kPEPE`, `xyz:NVDA`, `para:10Y`. */
const COIN_PATTERN = /^(?:[a-z0-9]+:)?[A-Za-z0-9]+$/;

/** Separator that replaces the `:` of a HIP-3 coin in file names; `:` is not allowed on every filesystem. */
const DEX_SEPARATOR = "--";

function assertCoin(coin: string): void {
	if (!COIN_PATTERN.test(coin)) throw new Error(`${JSON.stringify(coin)} is not a perp coin name the icon mapping understands`);
}

/** Source URL of a perp market's icon, as the terminal builds it. */
export function marketIconSourceUrl(coin: string): string {
	assertCoin(coin);
	return `${MARKET_ICON_SOURCE_BASE_URL}/${coin}.svg`;
}

/** Local file name of a market's icon: `BTC.svg`, `xyz--NVDA.svg`. */
export function marketIconFileName(coin: string): string {
	assertCoin(coin);
	return `${coin.replace(":", DEX_SEPARATOR)}.svg`;
}

/** Inverse of marketIconFileName; undefined for a name it would never produce. */
export function coinOfMarketIconFileName(fileName: string): string | undefined {
	const match = /^(?:([a-z0-9]+)--)?([A-Za-z0-9]+)\.svg$/.exec(fileName);
	if (!match) return undefined;
	return match[1] ? `${match[1]}:${match[2]}` : match[2];
}

/** Up to two letters or digits of the ticker, without the dex prefix, for the fallback disc: `para:10Y` → `10`. */
export function marketMonogram(coin: string): string {
	const ticker = dexOfCoin(coin) === MAIN_DEX ? coin : coin.slice(coin.indexOf(":") + 1);
	return ticker.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
}
