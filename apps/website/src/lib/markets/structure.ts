// Build-time market structure for the home page. Importing this module throws when the snapshot contains an
// address, a FEATURED_MARKETS entry is missing, delisted or recategorized, a listed dex has no documentation
// link or a deployers.ts entry no longer matches the snapshot. The date-dependent rules (snapshot older than
// 7 days, a source not re-read within 90 days, a passed settlement date) run only when the home page calls
// assertMarketStructureCurrent, so tests and pages that do not show market data never depend on the clock.
// Relative imports with extensions keep the module loadable by node:test as well as by Vite.

import { getHip3DeployerDocumentationUrl } from "../../../../terminal/src/config/hip3-deployers.ts";
import { PRE_IPO_DOCS, PRE_IPO_TERMS, type PreIpoTerms } from "../../config/deployers.ts";
import { FEATURED_MARKETS, type FeaturedCategory, type FeaturedMarket } from "../../config/featured-markets.ts";
import snapshotJson from "../../data/market-structure.json" with { type: "json" };
import {
	CATEGORY_CARD_ORDER,
	type CategoryCard,
	categoryCardOf,
	dexOfCoin,
	findFreshnessProblems,
	findSnapshotMarket,
	findStructureProblems,
	MAIN_DEX,
	type MarketStructureSnapshot,
	type SnapshotMarket,
} from "./rules.ts";

export const MARKET_STRUCTURE = snapshotJson as MarketStructureSnapshot;

const problems = findStructureProblems({
	snapshot: MARKET_STRUCTURE,
	featured: FEATURED_MARKETS,
	preIpoTerms: PRE_IPO_TERMS,
	preIpoDocs: PRE_IPO_DOCS,
	docsUrlFor: getHip3DeployerDocumentationUrl,
});
if (problems.length > 0) throw structureError(problems);

function structureError(found: string[]): Error {
	return new Error(`Market structure check failed:\n${found.map((problem) => `  - ${problem}`).join("\n")}`);
}

/** Throws, and so fails the build of the page that calls it, once the snapshot or a deployer source is out of date. */
export function assertMarketStructureCurrent(now: number = Date.now()): void {
	const stale = findFreshnessProblems({ snapshot: MARKET_STRUCTURE, preIpoTerms: PRE_IPO_TERMS, preIpoDocs: PRE_IPO_DOCS, now });
	if (stale.length > 0) throw structureError(stale);
}

/** ISO 8601 UTC time of the snapshot, for "as of" captions. */
export const SNAPSHOT_FETCHED_AT: string = MARKET_STRUCTURE.fetchedAt;

export interface Deployer {
	dex: string;
	fullName: string;
	docsUrl: string;
	listedCount: number;
}

export interface MarketSummary {
	coin: string;
	dex: string;
	/** FEATURED_MARKETS name, otherwise the on-chain displayName, otherwise the coin without its dex prefix. */
	name: string;
	displayName: string | null;
	/** Null on the main dex. */
	deployerFullName: string | null;
	category: string | null;
	szDecimals: number;
	onlyIsolated: boolean;
	featured: boolean;
}

export interface FeaturedMarketView extends MarketSummary {
	featuredCategory: FeaturedCategory;
	hero: boolean;
	/** Units and settlement facts for Pre-IPO markets that have them; without them no number is shown. */
	preIpoTerms: PreIpoTerms | null;
}

export interface PreIpoRow extends MarketSummary {
	/** PRE_IPO_DOCS page for the coin, otherwise the deployer's documentation link. */
	docsUrl: string;
	quotedPerShare: boolean;
	preIpoTerms: PreIpoTerms | null;
}

export interface CategoryCardView {
	category: CategoryCard;
	listedCount: number;
	/** Deployer fullNames in snapshot order; empty for crypto, which is the main dex. */
	deployers: string[];
	examples: MarketSummary[];
}

export type LiveKind = "preipo" | "rate" | "price";

/**
 * What a Pre-IPO market's price stands for: an implied valuation (deployers.ts has the deployer's verified unit),
 * one share of the company (the deployer's page says so), or nothing the site has verified, in which case no
 * number is shown and no valuation is derived.
 */
export type PreIpoQuoteBasis = "valuation" | "per-share" | "unknown";

/** What the browser script needs per market with a live number (02 cards and 03 tab rows); inlined into the page. */
export interface LiveMarketInput {
	coin: string;
	dex: string;
	szDecimals: number;
	valuationPerPriceUsd: string | null;
	kind: LiveKind;
	/** Set for every preipo input, null for the other kinds. */
	quoteBasis: PreIpoQuoteBasis | null;
}

function requireMarket(coin: string): { dexFullName: string | null; market: SnapshotMarket } {
	const found = findSnapshotMarket(MARKET_STRUCTURE, coin);
	if (!found) throw new Error(`${coin} is not a listed market in the snapshot`);
	return { dexFullName: found.dex.fullName, market: found.market };
}

function summarize(market: SnapshotMarket, dexFullName: string | null): MarketSummary {
	const featured = FEATURED_MARKETS.find((entry) => entry.coin === market.coin);
	const dex = dexOfCoin(market.coin);
	return {
		coin: market.coin,
		dex,
		name: featured?.name ?? market.displayName ?? market.coin.slice(dex === MAIN_DEX ? 0 : dex.length + 1),
		displayName: market.displayName,
		deployerFullName: dexFullName,
		category: market.category,
		szDecimals: market.szDecimals,
		onlyIsolated: market.onlyIsolated,
		featured: Boolean(featured),
	};
}

function allMarkets(): { market: SnapshotMarket; dexFullName: string | null }[] {
	return MARKET_STRUCTURE.dexes.flatMap((dex) => dex.markets.map((market) => ({ market, dexFullName: dex.fullName })));
}

function byVolumeDescending(a: SnapshotMarket, b: SnapshotMarket): number {
	const difference = BigInt(b.dayNtlVlm) - BigInt(a.dayNtlVlm);
	if (difference !== 0n) return difference > 0n ? 1 : -1;
	return a.coin < b.coin ? -1 : 1;
}

export function getPreIpoTerms(coin: string): PreIpoTerms | null {
	return PRE_IPO_TERMS.find((entry) => entry.coin === coin) ?? null;
}

/** HIP-3 dexes with at least one listed market, in perpDexs order. */
export function getPreIpoQuoteBasis(coin: string): PreIpoQuoteBasis {
	const quotedPerShare = PRE_IPO_DOCS.some((entry) => entry.coin === coin && entry.quotedPerShare);
	const terms = getPreIpoTerms(coin);
	if (terms && quotedPerShare) throw new Error(`${coin} has both a valuation unit and a per-share quote; keep one`);
	if (terms) return "valuation";
	return quotedPerShare ? "per-share" : "unknown";
}

export function getDeployers(): Deployer[] {
	return MARKET_STRUCTURE.dexes
		.filter((dex) => dex.dex !== MAIN_DEX)
		.map((dex) => ({
			dex: dex.dex,
			fullName: dex.fullName ?? dex.dex,
			docsUrl: getHip3DeployerDocumentationUrl(dex.dex) ?? "",
			listedCount: dex.markets.length,
		}));
}

/** Unique deployer fullNames for the given coins, in the order the coins first name them; main-dex coins add none. */
export function getDeployerFullNames(coins: readonly string[]): string[] {
	const names: string[] = [];
	for (const coin of coins) {
		const { dexFullName } = requireMarket(coin);
		if (dexFullName && !names.includes(dexFullName)) names.push(dexFullName);
	}
	return names;
}

export function getFeaturedMarkets(): FeaturedMarketView[] {
	return FEATURED_MARKETS.map((entry: FeaturedMarket) => {
		const { dexFullName, market } = requireMarket(entry.coin);
		return {
			...summarize(market, dexFullName),
			featuredCategory: entry.category,
			hero: entry.hero === true,
			preIpoTerms: entry.category === "preipo" ? getPreIpoTerms(entry.coin) : null,
		};
	});
}

export function getHeroMarkets(): FeaturedMarketView[] {
	return getFeaturedMarkets().filter((market) => market.hero);
}

export function getListedCount(category: CategoryCard): number {
	return allMarkets().filter(({ market }) => categoryCardOf(dexOfCoin(market.coin), market.category) === category)
		.length;
}

/** FEATURED_MARKETS first (config order), then the rest by 24h notional volume. */
function inDisplayOrder<T extends { market: SnapshotMarket }>(entries: T[]): T[] {
	const featuredCoins = FEATURED_MARKETS.map((entry) => entry.coin);
	const featured = featuredCoins
		.map((coin) => entries.find(({ market }) => market.coin === coin))
		.filter((entry) => entry !== undefined);
	const rest = entries
		.filter(({ market }) => !featuredCoins.includes(market.coin))
		.sort((a, b) => byVolumeDescending(a.market, b.market));
	return [...featured, ...rest];
}

/**
 * Examples for a category card: FEATURED_MARKETS of the category first, then by 24h notional volume. A market
 * whose on-chain displayName repeats an earlier example's (xyz:SNDK and io:SNDK) is skipped, so one ticker is
 * not listed twice under two names.
 */
export function getCategoryExamples(category: CategoryCard, limit = 4): MarketSummary[] {
	const inCategory = allMarkets().filter(
		({ market }) => categoryCardOf(dexOfCoin(market.coin), market.category) === category,
	);
	const seenDisplayNames = new Set<string>();
	const examples: MarketSummary[] = [];
	for (const { market, dexFullName } of inDisplayOrder(inCategory)) {
		if (examples.length >= limit) break;
		if (market.displayName !== null) {
			if (seenDisplayNames.has(market.displayName)) continue;
			seenDisplayNames.add(market.displayName);
		}
		examples.push(summarize(market, dexFullName));
	}
	return examples;
}

/** One card per category with at least one listed market, in CATEGORY_CARD_ORDER. */
export function getCategoryCards(exampleLimit = 4): CategoryCardView[] {
	return CATEGORY_CARD_ORDER.map((category) => {
		const markets = allMarkets().filter(
			({ market }) => categoryCardOf(dexOfCoin(market.coin), market.category) === category,
		);
		const deployers: string[] = [];
		for (const { dexFullName } of markets) if (dexFullName && !deployers.includes(dexFullName)) deployers.push(dexFullName);
		return { category, listedCount: markets.length, deployers, examples: getCategoryExamples(category, exampleLimit) };
	}).filter((card) => card.listedCount > 0);
}

/** Every listed preipo market in display order; `preIpoTerms` is null where deployers.ts has no verified unit. */
export function getPreIpoRows(): PreIpoRow[] {
	return inDisplayOrder(allMarkets().filter(({ market }) => market.category === "preipo"))
		.map(({ market, dexFullName }) => {
			const documentation = PRE_IPO_DOCS.find((entry) => entry.coin === market.coin);
			return {
				...summarize(market, dexFullName),
				docsUrl: documentation?.source.url ?? getHip3DeployerDocumentationUrl(dexOfCoin(market.coin)) ?? "",
				quotedPerShare: documentation?.quotedPerShare === true,
				preIpoTerms: getPreIpoTerms(market.coin),
			};
		});
}

/** Rows per category tab in 03. */
export const MARKET_TAB_ROWS = 6;

/**
 * How a market's live number reads: Pre-IPO by its quote basis (an implied valuation, or the mark price quoted per
 * share), FX as a bare rate, the rest as a price.
 */
export function liveKindOf(category: string | null): LiveKind {
	if (category === "preipo") return "preipo";
	return category === "fx" ? "rate" : "price";
}

/**
 * Featured markets first (02 cards, in config order), then every 03 tab row not already listed, so the
 * request plan asks the featured dexes first and the stats band's dexes answer in the first round.
 */
export function getLiveMarketInputs(): LiveMarketInput[] {
	const inputs: LiveMarketInput[] = getFeaturedMarkets().map((market) => ({
		coin: market.coin,
		dex: market.dex,
		szDecimals: market.szDecimals,
		valuationPerPriceUsd: market.preIpoTerms?.valuationPerPriceUsd ?? null,
		kind: liveKindOf(market.featuredCategory),
		quoteBasis: market.featuredCategory === "preipo" ? getPreIpoQuoteBasis(market.coin) : null,
	}));
	for (const card of getCategoryCards(MARKET_TAB_ROWS)) {
		for (const market of card.examples) {
			if (inputs.some((input) => input.coin === market.coin)) continue;
			inputs.push({
				coin: market.coin,
				dex: market.dex,
				szDecimals: market.szDecimals,
				valuationPerPriceUsd: card.category === "preipo" ? (getPreIpoTerms(market.coin)?.valuationPerPriceUsd ?? null) : null,
				kind: liveKindOf(card.category),
				quoteBasis: card.category === "preipo" ? getPreIpoQuoteBasis(market.coin) : null,
			});
		}
	}
	return inputs;
}

/**
 * Every market the site renders by name: the featured markets (02 cards and the hero, a subset of them), the 03 tab
 * rows and the Pre-IPO list. scripts/market-icons.mjs vendors an icon for each.
 */
export function getRenderedMarketCoins(): string[] {
	const coins = new Set<string>(getFeaturedMarkets().map((market) => market.coin));
	for (const card of getCategoryCards(MARKET_TAB_ROWS)) for (const market of card.examples) coins.add(market.coin);
	for (const row of getPreIpoRows()) coins.add(row.coin);
	return [...coins];
}

/** The dexes whose totals the stats band sums: the main dex and the featured dexes, which answer first. */
export function getStatsDexes(): { dex: string; label: string }[] {
	const dexes: { dex: string; label: string }[] = [{ dex: MAIN_DEX, label: "Hyperliquid core perps" }];
	for (const market of getFeaturedMarkets()) {
		if (market.dex === MAIN_DEX || dexes.some((entry) => entry.dex === market.dex)) continue;
		dexes.push({ dex: market.dex, label: market.deployerFullName ?? market.dex });
	}
	return dexes;
}

/** Listed perp markets across every included dex, and the HIP-3 deployers among them, from the snapshot. */
export function getListedTotals(): { markets: number; deployers: number } {
	return { markets: allMarkets().length, deployers: getDeployers().length };
}
