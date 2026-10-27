// Pure rules shared by the snapshot script (Node with type stripping), the build-time guard and the tests.
// Keep this file free of imports and of TypeScript syntax that cannot be erased (enums, namespaces).

export const MAIN_DEX = "";
export const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DEPLOYER_REVIEW_MAX_AGE_DAYS = 90;
export const ADDRESS_PATTERN = /0x[0-9a-fA-F]{40}/;

/** Category cards on the site, in display order. HIP-3 markets without a category or tagged crypto get no card. */
export const CATEGORY_CARD_ORDER = ["crypto", "stocks", "indices", "commodities", "fx", "preipo", "rates"] as const;
export type CategoryCard = (typeof CATEGORY_CARD_ORDER)[number];

export interface SnapshotMarket {
	/** Exchange coin name: `BTC` on the main dex, `<dex>:<NAME>` on a HIP-3 dex. */
	coin: string;
	/** Main-dex perps are `crypto` by dex; HIP-3 markets carry the normalized annotation category or null. */
	category: string | null;
	/** `perpConciseAnnotations` displayName, null when absent (always null on the main dex). */
	displayName: string | null;
	szDecimals: number;
	onlyIsolated: boolean;
	growthMode: boolean;
	/** Decimal string from `metaAndAssetCtxs`, null when the market has none. */
	deployerFeeScale: string | null;
	/** 24h notional volume in USD, rounded down to a whole dollar, as a decimal string. */
	dayNtlVlm: string;
}

export interface SnapshotDex {
	/** `""` for the main dex. */
	dex: string;
	/** `perpDexs` fullName; null for the main dex. */
	fullName: string | null;
	/** Listed markets only, in the exchange's asset order. */
	markets: SnapshotMarket[];
}

export interface MarketStructureSnapshot {
	schemaVersion: 1;
	/** ISO 8601 UTC time the responses were received. */
	fetchedAt: string;
	source: string;
	dexes: SnapshotDex[];
}

export interface FeaturedMarketRule {
	coin: string;
	category: string;
}

export interface SourceRule {
	url: string;
	/** `YYYY-MM-DD` (UTC) on which the page was read. */
	readOn: string;
}

export interface PreIpoTermsRule {
	coin: string;
	valuationPerPriceUsd: string;
	unitSource: SourceRule;
	scheduledSettlement: string;
	settlementSource: SourceRule;
	earlySettlementOnNotice: boolean;
	earlySettlementSource: SourceRule;
}

export interface PreIpoDocsRule {
	coin: string;
	source: SourceRule;
}

export type DocsUrlLookup = (dex: string) => string | undefined;

/** Same as the terminal's `normalizePerpCategory` (token-selector-categories.ts). */
export function normalizePerpCategory(category: string | null | undefined): string | undefined {
	const normalized = category?.trim().toLowerCase();
	return normalized === "stock" ? "stocks" : normalized;
}

/** Same as hl-react's `isPerpDelisted`: listed unless the exchange says `isDelisted: true`. */
export function isPerpDelisted(asset: { isDelisted?: unknown }): boolean {
	return asset.isDelisted === true;
}

export function dexOfCoin(coin: string): string {
	const separator = coin.indexOf(":");
	return separator === -1 ? MAIN_DEX : coin.slice(0, separator);
}

export function findSnapshotMarket(
	snapshot: MarketStructureSnapshot,
	coin: string,
): { dex: SnapshotDex; market: SnapshotMarket } | undefined {
	const dex = snapshot.dexes.find((entry) => entry.dex === dexOfCoin(coin));
	const market = dex?.markets.find((entry) => entry.coin === coin);
	return dex && market ? { dex, market } : undefined;
}

export function isCategoryCard(value: string | null): value is CategoryCard {
	return (CATEGORY_CARD_ORDER as readonly (string | null)[]).includes(value);
}

/** The card a market counts towards: main-dex perps are crypto, HIP-3 crypto and uncategorized markets have none. */
export function categoryCardOf(dex: string, category: string | null): CategoryCard | undefined {
	if (dex === MAIN_DEX) return "crypto";
	if (category === "crypto" || !isCategoryCard(category)) return undefined;
	return category;
}

/** Rules that hold for a snapshot whatever the date; the age rules are in findSnapshotAgeProblems. */
export function findSnapshotProblems(snapshot: MarketStructureSnapshot): string[] {
	const problems: string[] = [];
	if (!Number.isFinite(Date.parse(snapshot.fetchedAt))) problems.push(`snapshot fetchedAt "${snapshot.fetchedAt}" is not a date`);
	if (ADDRESS_PATTERN.test(JSON.stringify(snapshot))) problems.push("snapshot contains an address");
	if (!snapshot.dexes.some((dex) => dex.dex === MAIN_DEX)) problems.push("snapshot has no main dex");
	for (const dex of snapshot.dexes) {
		if (dex.markets.length === 0) problems.push(`dex "${dex.dex}" has no listed market and must not be included`);
		if (dex.dex !== MAIN_DEX && !dex.fullName) problems.push(`dex "${dex.dex}" has no fullName`);
		for (const market of dex.markets) {
			if (dexOfCoin(market.coin) !== dex.dex) problems.push(`${market.coin} is filed under dex "${dex.dex}"`);
		}
	}
	return problems;
}

export function findSnapshotAgeProblems(snapshot: MarketStructureSnapshot, now: number): string[] {
	const fetchedAt = Date.parse(snapshot.fetchedAt);
	if (!Number.isFinite(fetchedAt)) return [];
	if (now - fetchedAt > SNAPSHOT_MAX_AGE_MS) {
		const days = ((now - fetchedAt) / 86_400_000).toFixed(1);
		return [`snapshot fetchedAt ${snapshot.fetchedAt} is ${days} days old (limit 7); run markets:snapshot`];
	}
	if (fetchedAt - now > 60_000) return [`snapshot fetchedAt ${snapshot.fetchedAt} is in the future`];
	return [];
}

export function findFeaturedProblems(
	snapshot: MarketStructureSnapshot,
	featured: readonly FeaturedMarketRule[],
): string[] {
	const problems: string[] = [];
	const seen = new Set<string>();
	for (const entry of featured) {
		if (seen.has(entry.coin)) problems.push(`FEATURED_MARKETS lists ${entry.coin} twice`);
		seen.add(entry.coin);
		const found = findSnapshotMarket(snapshot, entry.coin);
		if (!found) {
			problems.push(`FEATURED_MARKETS ${entry.coin} is not a listed market in the snapshot (delisted or removed)`);
		} else if (found.market.category !== entry.category) {
			problems.push(
				`FEATURED_MARKETS ${entry.coin} is "${entry.category}" but the exchange now says "${found.market.category}"`,
			);
		}
	}
	return problems;
}

export function findDeployerDocsProblems(snapshot: MarketStructureSnapshot, docsUrlFor: DocsUrlLookup): string[] {
	return snapshot.dexes
		.filter((dex) => dex.dex !== MAIN_DEX && !docsUrlFor(dex.dex))
		.map(
			(dex) =>
				`dex "${dex.dex}" (${dex.fullName}) has listed markets but no documentation link in apps/terminal/src/config/hip3-deployers.ts`,
		);
}

export function findPreIpoTermsProblems(
	snapshot: MarketStructureSnapshot,
	terms: readonly PreIpoTermsRule[],
): string[] {
	const problems: string[] = [];
	for (const entry of terms) {
		problems.push(...findPreIpoListingProblems(snapshot, entry.coin));
		if (!/^[1-9]\d*$/.test(entry.valuationPerPriceUsd)) {
			problems.push(`deployers.ts ${entry.coin} valuationPerPriceUsd must be a positive integer string`);
		}
		if (!isIsoDate(entry.scheduledSettlement)) {
			problems.push(`deployers.ts ${entry.coin} scheduledSettlement must be YYYY-MM-DD`);
		}
		for (const source of [entry.unitSource, entry.settlementSource, entry.earlySettlementSource]) {
			problems.push(...findSourceFormatProblems(entry.coin, source));
		}
	}
	return problems;
}

export function findPreIpoDocsProblems(snapshot: MarketStructureSnapshot, docs: readonly PreIpoDocsRule[]): string[] {
	const problems: string[] = [];
	const seen = new Set<string>();
	for (const entry of docs) {
		if (seen.has(entry.coin)) problems.push(`deployers.ts PRE_IPO_DOCS lists ${entry.coin} twice`);
		seen.add(entry.coin);
		problems.push(...findPreIpoListingProblems(snapshot, entry.coin));
		problems.push(...findSourceFormatProblems(entry.coin, entry.source));
	}
	return problems;
}

function findPreIpoListingProblems(snapshot: MarketStructureSnapshot, coin: string): string[] {
	const found = findSnapshotMarket(snapshot, coin);
	if (!found) return [`deployers.ts ${coin} is not a listed market in the snapshot`];
	if (found.market.category !== "preipo") return [`deployers.ts ${coin} is no longer preipo`];
	return [];
}

function findSourceFormatProblems(coin: string, source: SourceRule): string[] {
	const problems: string[] = [];
	if (!/^https:\/\//.test(source.url)) problems.push(`deployers.ts ${coin} source ${source.url} must be an https URL`);
	if (!isIsoDate(source.readOn)) problems.push(`deployers.ts ${coin} ${source.url} readOn must be YYYY-MM-DD`);
	return problems;
}

/** Sources older than 90 days or dated in the future, and settlement dates that have passed. */
export function findPreIpoReviewProblems(
	terms: readonly PreIpoTermsRule[],
	docs: readonly PreIpoDocsRule[],
	now: number,
): string[] {
	const problems: string[] = [];
	for (const entry of terms) {
		for (const source of [entry.unitSource, entry.settlementSource, entry.earlySettlementSource]) {
			problems.push(...findSourceReviewProblems(entry.coin, source, now));
		}
		if (isIsoDate(entry.scheduledSettlement) && Date.parse(`${entry.scheduledSettlement}T00:00:00Z`) <= now) {
			problems.push(
				`deployers.ts ${entry.coin} scheduledSettlement ${entry.scheduledSettlement} has passed; re-read the deployer's page`,
			);
		}
	}
	for (const entry of docs) problems.push(...findSourceReviewProblems(entry.coin, entry.source, now));
	return problems;
}

function findSourceReviewProblems(coin: string, source: SourceRule, now: number): string[] {
	if (!isIsoDate(source.readOn)) return [];
	const ageDays = Math.floor((now - Date.parse(`${source.readOn}T00:00:00Z`)) / 86_400_000);
	if (ageDays > DEPLOYER_REVIEW_MAX_AGE_DAYS) {
		return [
			`deployers.ts ${coin} ${source.url} was read on ${source.readOn}, ${ageDays} days ago (limit ${DEPLOYER_REVIEW_MAX_AGE_DAYS}); re-read it and update readOn`,
		];
	}
	if (ageDays < 0) return [`deployers.ts ${coin} ${source.url} readOn ${source.readOn} is in the future`];
	return [];
}

function isIsoDate(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

/** Pre-IPO rows rendered from `published` that `fresh` no longer lists as preipo. */
export function findPublishedPreIpoProblems(
	published: MarketStructureSnapshot,
	fresh: MarketStructureSnapshot,
): string[] {
	const problems: string[] = [];
	for (const dex of published.dexes) {
		for (const market of dex.markets) {
			if (market.category !== "preipo") continue;
			const found = findSnapshotMarket(fresh, market.coin);
			if (!found) problems.push(`published Pre-IPO row ${market.coin} is delisted or removed`);
			else if (found.market.category !== "preipo") {
				problems.push(`published Pre-IPO row ${market.coin} changed category to "${found.market.category}"`);
			}
		}
	}
	return problems;
}

export interface StructureCheckInput {
	snapshot: MarketStructureSnapshot;
	featured: readonly FeaturedMarketRule[];
	preIpoTerms: readonly PreIpoTermsRule[];
	preIpoDocs: readonly PreIpoDocsRule[];
	docsUrlFor: DocsUrlLookup;
}

/** Every rule that holds whatever the date; an empty list means the snapshot and configs agree. */
export function findStructureProblems(input: StructureCheckInput): string[] {
	return [
		...findSnapshotProblems(input.snapshot),
		...findFeaturedProblems(input.snapshot, input.featured),
		...findDeployerDocsProblems(input.snapshot, input.docsUrlFor),
		...findPreIpoTermsProblems(input.snapshot, input.preIpoTerms),
		...findPreIpoDocsProblems(input.snapshot, input.preIpoDocs),
	];
}

export interface FreshnessCheckInput {
	snapshot: MarketStructureSnapshot;
	preIpoTerms: readonly PreIpoTermsRule[];
	preIpoDocs: readonly PreIpoDocsRule[];
	now: number;
}

/** The date-dependent rules: the snapshot's 7 days, the sources' 90 days and passed settlement dates. */
export function findFreshnessProblems(input: FreshnessCheckInput): string[] {
	return [
		...findSnapshotAgeProblems(input.snapshot, input.now),
		...findPreIpoReviewProblems(input.preIpoTerms, input.preIpoDocs, input.now),
	];
}
