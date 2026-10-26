import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getHip3DeployerDocumentationUrl } from "../../terminal/src/config/hip3-deployers.ts";
import { APP_URL } from "../src/config/brand.ts";
import { PRE_IPO_DOCS, PRE_IPO_TERMS } from "../src/config/deployers.ts";
import { FEATURED_MARKET_QUOTAS, FEATURED_MARKETS } from "../src/config/featured-markets.ts";
import { documentedDexes, restrictedCountries } from "../scripts/check-terminal-release.mjs";
import { readListedMarkets } from "../scripts/markets-snapshot.mjs";
import {
	ADDRESS_PATTERN,
	CATEGORY_CARD_ORDER,
	categoryCardOf,
	findDeployerDocsProblems,
	findFeaturedProblems,
	findFreshnessProblems,
	findPreIpoDocsProblems,
	findPreIpoReviewProblems,
	findPreIpoTermsProblems,
	findPublishedPreIpoProblems,
	findSnapshotAgeProblems,
	findSnapshotProblems,
	findStructureProblems,
	normalizePerpCategory,
	SNAPSHOT_MAX_AGE_MS,
} from "../src/lib/markets/rules.ts";
import {
	assertMarketStructureCurrent,
	getCategoryCards,
	getCategoryExamples,
	getDeployerFullNames,
	getDeployers,
	getFeaturedMarkets,
	getHeroMarkets,
	getListedCount,
	getListedTotals,
	getLiveMarketInputs,
	getPreIpoRows,
	getPreIpoTerms,
	getStatsDexes,
	liveKindOf,
	MARKET_STRUCTURE,
	MARKET_TAB_ROWS,
} from "../src/lib/markets/structure.ts";
import { terminalTradeUrl } from "../src/lib/terminal-links.ts";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_TEXT = readFileSync(resolve(WEBSITE_ROOT, "src/data/market-structure.json"), "utf8");
const DAY_MS = 86_400_000;
// The suite never reads the clock: it judges the committed snapshot and configs at the latest moment they
// name (fetchedAt or a source's readOn day), so it stays green however old the snapshot is. Whether the
// snapshot is current today is the build's job (assertMarketStructureCurrent) and the daily check's.
const NOW =
	Math.max(
		Date.parse(MARKET_STRUCTURE.fetchedAt),
		...[...PRE_IPO_TERMS.flatMap((entry) => [entry.unitSource, entry.settlementSource, entry.earlySettlementSource]), ...PRE_IPO_DOCS.map((entry) => entry.source)].map(
			(source) => Date.parse(`${source.readOn}T00:00:00Z`),
		),
	) + 60_000;

function snapshotCopy() {
	return structuredClone(MARKET_STRUCTURE);
}

function withoutMarket(snapshot, coin) {
	for (const dex of snapshot.dexes) dex.markets = dex.markets.filter((market) => market.coin !== coin);
	return snapshot;
}

function marketOf(snapshot, coin) {
	return snapshot.dexes.flatMap((dex) => dex.markets).find((market) => market.coin === coin);
}

function baseInput(snapshot = snapshotCopy()) {
	return {
		snapshot,
		featured: FEATURED_MARKETS,
		preIpoTerms: PRE_IPO_TERMS,
		preIpoDocs: PRE_IPO_DOCS,
		docsUrlFor: getHip3DeployerDocumentationUrl,
	};
}

test("the committed snapshot passes every build-time rule", () => {
	assert.deepEqual(findStructureProblems(baseInput()), []);
	assert.deepEqual(findFreshnessProblems({ ...baseInput(), now: NOW }), []);
	assert.doesNotThrow(() => assertMarketStructureCurrent(NOW));
	assert.throws(() => assertMarketStructureCurrent(Date.parse(MARKET_STRUCTURE.fetchedAt) + SNAPSHOT_MAX_AGE_MS + 1), /days old/);
});

test("the date rules are not checked when the module is imported", () => {
	const source = readFileSync(resolve(WEBSITE_ROOT, "src/lib/markets/structure.ts"), "utf8");
	const importTime = source.slice(0, source.indexOf("export function assertMarketStructureCurrent"));
	assert.doesNotMatch(importTime, /Date\.now\(\)|findFreshnessProblems\(/);
	// Components shared with pages that show no market data never load the snapshot.
	for (const component of ["Nav.astro", "Faq.astro", "Footer.astro"]) {
		const text = readFileSync(resolve(WEBSITE_ROOT, "src/components", component), "utf8");
		assert.doesNotMatch(text, /lib\/markets\/structure/, `${component} must not import the market structure`);
	}
	// A page that renders a component reading the snapshot (Fees builds its HIP-3 example from it) checks its age.
	const readers = readdirSync(resolve(WEBSITE_ROOT, "src/components")).filter((file) =>
		/lib\/markets\/structure/.test(readFileSync(resolve(WEBSITE_ROOT, "src/components", file), "utf8")),
	);
	assert.ok(readers.includes("Fees.astro"), "expected Fees.astro to read the snapshot for its growth-mode example");
	for (const page of listPages(resolve(WEBSITE_ROOT, "src/pages"))) {
		const text = readFileSync(page, "utf8");
		const rendered = readers.filter((file) => text.includes(`@/components/${file}`));
		if (rendered.length === 0) continue;
		assert.match(text, /^assertMarketStructureCurrent\(\);$/m, `${page} renders ${rendered.join(", ")} without checking the snapshot's age`);
	}
	const home = readFileSync(resolve(WEBSITE_ROOT, "src/pages/index.astro"), "utf8");
	assert.match(home, /^assertMarketStructureCurrent\(\);$/m, "the home page build checks the snapshot's age");
});

function listPages(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) return listPages(path);
		return entry.name.endsWith(".astro") ? [path] : [];
	});
}

test("the snapshot carries no address and lists only listed markets of included dexes", () => {
	assert.equal(ADDRESS_PATTERN.test(SNAPSHOT_TEXT), false);
	assert.doesNotMatch(SNAPSHOT_TEXT, /0x[0-9a-fA-F]{40}/);
	assert.match(MARKET_STRUCTURE.fetchedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
	assert.equal(MARKET_STRUCTURE.dexes[0].dex, "");
	for (const dex of MARKET_STRUCTURE.dexes) {
		assert.ok(dex.markets.length > 0, `${dex.dex} is included without a listed market`);
		for (const market of dex.markets) {
			assert.deepEqual(Object.keys(market).sort(), [
				"category",
				"coin",
				"dayNtlVlm",
				"deployerFeeScale",
				"displayName",
				"growthMode",
				"onlyIsolated",
				"szDecimals",
			]);
			assert.match(market.dayNtlVlm, /^\d+$/);
			if (dex.dex === "") assert.equal(market.category, "crypto");
			else assert.ok(market.coin.startsWith(`${dex.dex}:`));
			assert.ok(market.category === null || market.category === normalizePerpCategory(market.category));
		}
	}
});

test("every included HIP-3 dex has a documentation link in the terminal's deployer table", () => {
	assert.deepEqual(findDeployerDocsProblems(MARKET_STRUCTURE, getHip3DeployerDocumentationUrl), []);
	for (const deployer of getDeployers()) assert.match(deployer.docsUrl, /^https:\/\//);
	const withUnknownDex = snapshotCopy();
	withUnknownDex.dexes.push({ dex: "zz", fullName: "Unknown", markets: [{ ...marketOf(withUnknownDex, "io:OAI"), coin: "zz:A" }] });
	assert.equal(findDeployerDocsProblems(withUnknownDex, getHip3DeployerDocumentationUrl).length, 1);
});

test("FEATURED_MARKETS fills the category quotas with listed markets, Pre-IPO heroes first", () => {
	assert.deepEqual(findFeaturedProblems(MARKET_STRUCTURE, FEATURED_MARKETS), []);
	assert.equal(FEATURED_MARKETS.length, 10);
	const counts = {};
	for (const market of FEATURED_MARKETS) counts[market.category] = (counts[market.category] ?? 0) + 1;
	assert.deepEqual(counts, FEATURED_MARKET_QUOTAS);
	assert.deepEqual(
		FEATURED_MARKETS.slice(0, 2).map((market) => [market.coin, market.hero]),
		[
			["io:OAI", true],
			["io:ANTH", true],
		],
	);
	assert.equal(FEATURED_MARKETS.filter((market) => market.hero).length, 2);
	for (const market of FEATURED_MARKETS) {
		assert.ok(market.name.trim().length > 0 && market.nameSource.trim().length > 0, market.coin);
	}
	assert.deepEqual(
		getHeroMarkets().map((market) => [market.name, market.deployerFullName]),
		[
			["OpenAI", "EntropyIO"],
			["Anthropic", "EntropyIO"],
		],
	);
});

test("the build check fails on a stale or future snapshot, an address, or a featured market delisted or recategorized", () => {
	const fetchedAt = Date.parse(MARKET_STRUCTURE.fetchedAt);
	assert.deepEqual(findSnapshotAgeProblems(MARKET_STRUCTURE, fetchedAt + SNAPSHOT_MAX_AGE_MS), []);
	assert.match(findSnapshotAgeProblems(MARKET_STRUCTURE, fetchedAt + SNAPSHOT_MAX_AGE_MS + 1).join("\n"), /days old/);
	assert.deepEqual(findSnapshotAgeProblems(MARKET_STRUCTURE, fetchedAt - 60_000), []);
	assert.match(findSnapshotAgeProblems(MARKET_STRUCTURE, fetchedAt - 60_001).join("\n"), /in the future/);

	const undated = snapshotCopy();
	undated.fetchedAt = "yesterday";
	assert.match(findSnapshotProblems(undated).join("\n"), /not a date/);

	const leaked = snapshotCopy();
	leaked.dexes[1].fullName = `Deployer 0x${"a".repeat(40)}`;
	assert.match(findSnapshotProblems(leaked).join("\n"), /address/);

	const delisted = withoutMarket(snapshotCopy(), "io:ANTH");
	assert.match(findStructureProblems(baseInput(delisted)).join("\n"), /io:ANTH is not a listed market/);

	const recategorized = snapshotCopy();
	marketOf(recategorized, "xyz:JPY").category = "commodities";
	assert.match(findFeaturedProblems(recategorized, FEATURED_MARKETS).join("\n"), /xyz:JPY is "fx"/);

	const misfiled = snapshotCopy();
	misfiled.dexes[1].markets.push({ ...marketOf(misfiled, "BTC"), coin: "BTC" });
	assert.match(findSnapshotProblems(misfiled).join("\n"), /BTC is filed under dex/);
});

test("deployers.ts reviews are within 90 days, never dated ahead, and fail once overdue", () => {
	assert.deepEqual(findPreIpoTermsProblems(MARKET_STRUCTURE, PRE_IPO_TERMS), []);
	assert.deepEqual(findPreIpoReviewProblems(PRE_IPO_TERMS, [], NOW), []);
	const terms = PRE_IPO_TERMS.map((entry) => ({ ...entry, unitSource: { ...entry.unitSource, readOn: "2026-10-25" } }));
	const overdue = terms.map((entry) => ({ ...entry, unitSource: { ...entry.unitSource, readOn: "2026-01-01" } }));
	const reviewNow = Date.parse("2026-10-25T00:00:00Z");
	assert.equal(findPreIpoReviewProblems(overdue, [], reviewNow).length, 2);
	const sameDay = terms.map((entry) => ({
		...entry,
		settlementSource: { ...entry.settlementSource, readOn: "2026-10-25" },
		earlySettlementSource: { ...entry.earlySettlementSource, readOn: "2026-10-25" },
	}));
	assert.equal(findPreIpoReviewProblems(sameDay, [], reviewNow + 91 * DAY_MS).length, 6);
	assert.deepEqual(findPreIpoReviewProblems(sameDay, [], reviewNow + 90 * DAY_MS), []);
	assert.match(findPreIpoReviewProblems(sameDay, [], reviewNow - 1).join("\n"), /is in the future/);
	assert.equal(findPreIpoReviewProblems(sameDay, [], reviewNow - 1).length, 6);

	const settled = sameDay.map((entry) => ({ ...entry, scheduledSettlement: "2026-10-25" }));
	assert.match(findPreIpoReviewProblems(settled, [], reviewNow).join("\n"), /scheduledSettlement 2026-10-25 has passed/);
	assert.deepEqual(findPreIpoReviewProblems(settled, [], reviewNow - 1).filter((problem) => /has passed/.test(problem)), []);

	const docsReadOn = Date.parse(`${PRE_IPO_DOCS[0].source.readOn}T00:00:00Z`);
	assert.deepEqual(findPreIpoReviewProblems([], PRE_IPO_DOCS, docsReadOn), []);
	assert.equal(findPreIpoReviewProblems([], PRE_IPO_DOCS, docsReadOn - 1).length, PRE_IPO_DOCS.length);
	assert.equal(findPreIpoReviewProblems([], PRE_IPO_DOCS, docsReadOn + 91 * DAY_MS).length, PRE_IPO_DOCS.length);
	for (const entry of PRE_IPO_TERMS) {
		assert.equal(entry.valuationPerPriceUsd, "1000000000", "EntropyIO: 1 USD of price is 1 billion USD implied valuation");
		assert.match(entry.unitSource.url, /^https:\/\/docs\.entropy\.io\//);
		assert.equal(entry.earlySettlementOnNotice, true);
	}
	assert.deepEqual(
		Object.fromEntries(PRE_IPO_TERMS.map((entry) => [entry.coin, entry.scheduledSettlement])),
		{ "io:OAI": "2028-09-02", "io:ANTH": "2028-08-18" },
	);
});

test("Pre-IPO rows list every listed preipo market and leave units off where none is verified", () => {
	const rows = getPreIpoRows();
	const snapshotPreIpo = MARKET_STRUCTURE.dexes.flatMap((dex) => dex.markets).filter((m) => m.category === "preipo");
	assert.equal(rows.length, snapshotPreIpo.length);
	assert.deepEqual(rows.slice(0, 2).map((row) => row.coin), ["io:OAI", "io:ANTH"]);
	for (const row of rows) {
		const configured = PRE_IPO_TERMS.some((entry) => entry.coin === row.coin);
		assert.equal(row.preIpoTerms !== null, configured, row.coin);
		assert.ok(row.deployerFullName && row.docsUrl.startsWith("https://"), row.coin);
		const documentation = PRE_IPO_DOCS.find((entry) => entry.coin === row.coin);
		assert.equal(row.docsUrl, documentation?.source.url ?? getHip3DeployerDocumentationUrl(row.dex), row.coin);
		assert.equal(row.quotedPerShare, documentation?.quotedPerShare === true, row.coin);
	}
	assert.deepEqual(
		rows.filter((row) => row.preIpoTerms === null).map((row) => row.coin).sort(),
		PRE_IPO_DOCS.map((entry) => entry.coin).sort(),
		"every Pre-IPO row without verified units links to the page that lists it",
	);
	assert.deepEqual(findPreIpoDocsProblems(MARKET_STRUCTURE, PRE_IPO_DOCS), []);
	const converted = snapshotCopy();
	marketOf(converted, "xyz:JIO").category = "stocks";
	assert.deepEqual(findPreIpoDocsProblems(converted, PRE_IPO_DOCS), ["deployers.ts xyz:JIO is no longer preipo"]);
	assert.match(
		findPreIpoDocsProblems(MARKET_STRUCTURE, [...PRE_IPO_DOCS, PRE_IPO_DOCS[0]]).join("\n"),
		/lists xyz:JIO twice/,
	);
	const published = snapshotCopy();
	const fresh = withoutMarket(snapshotCopy(), "io:OAI");
	marketOf(fresh, "io:ANTH").category = "stocks";
	assert.deepEqual(findPublishedPreIpoProblems(published, fresh), [
		"published Pre-IPO row io:OAI is delisted or removed",
		'published Pre-IPO row io:ANTH changed category to "stocks"',
	]);
});

test("category cards count listed markets and leave out HIP-3 crypto and uncategorized markets", () => {
	const cards = getCategoryCards();
	assert.deepEqual(
		cards.map((card) => card.category),
		CATEGORY_CARD_ORDER.filter((category) => getListedCount(category) > 0),
	);
	const crypto = cards.find((card) => card.category === "crypto");
	assert.equal(crypto.listedCount, MARKET_STRUCTURE.dexes[0].markets.length);
	assert.deepEqual(crypto.deployers, []);
	const all = MARKET_STRUCTURE.dexes.flatMap((dex) => dex.markets.map((market) => ({ dex: dex.dex, market })));
	const uncarded = all.filter(({ dex, market }) => categoryCardOf(dex, market.category) === undefined);
	assert.ok(uncarded.every(({ dex, market }) => dex !== "" && (market.category === null || market.category === "crypto" || !CATEGORY_CARD_ORDER.includes(market.category))));
	assert.equal(cards.reduce((sum, card) => sum + card.listedCount, 0) + uncarded.length, all.length);
	for (const card of cards) {
		assert.ok(card.examples.length > 0 && card.examples.length <= 4);
		const featuredInCategory = FEATURED_MARKETS.filter(
			(market) => market.category === card.category,
		).map((market) => market.coin);
		assert.deepEqual(
			card.examples.slice(0, featuredInCategory.length).map((example) => example.coin),
			featuredInCategory,
			`${card.category} examples start with FEATURED_MARKETS`,
		);
		const rest = card.examples.slice(featuredInCategory.length);
		for (let index = 1; index < rest.length; index += 1) {
			const previous = BigInt(marketOf(MARKET_STRUCTURE, rest[index - 1].coin).dayNtlVlm);
			assert.ok(previous >= BigInt(marketOf(MARKET_STRUCTURE, rest[index].coin).dayNtlVlm));
		}
	}
	assert.equal(getCategoryExamples("crypto", 2).length, 2);
	for (const card of cards) {
		const names = card.examples.map((example) => example.displayName).filter((name) => name !== null);
		assert.equal(new Set(names).size, names.length, `${card.category} lists one ticker twice`);
	}
	const sndk = MARKET_STRUCTURE.dexes.flatMap((dex) => dex.markets).filter((market) => market.displayName === "SNDK");
	if (sndk.length > 1) {
		assert.deepEqual(
			getCategoryExamples("stocks", 20).filter((example) => example.displayName === "SNDK").map((example) => example.coin),
			["xyz:SNDK"],
		);
	}
});

test("deployer names, live inputs and terminal links come from the snapshot and the configs", () => {
	assert.deepEqual(getDeployerFullNames(FEATURED_MARKETS.filter((m) => m.hero).map((m) => m.coin)), ["EntropyIO"]);
	assert.deepEqual(getDeployerFullNames(FEATURED_MARKETS.map((m) => m.coin)), ["EntropyIO", "XYZ"]);
	assert.deepEqual(getDeployerFullNames(["BTC"]), []);
	assert.throws(() => getDeployerFullNames(["io:NOPE"]));
	assert.deepEqual(
		getDeployers().map((deployer) => deployer.fullName),
		MARKET_STRUCTURE.dexes.slice(1).map((dex) => dex.fullName),
	);
	const inputs = getLiveMarketInputs();
	assert.deepEqual(
		inputs.slice(0, FEATURED_MARKETS.length).map((input) => input.coin),
		FEATURED_MARKETS.map((market) => market.coin),
		"02's featured markets come first, so their dexes answer in the first round",
	);
	const tabRows = getCategoryCards(MARKET_TAB_ROWS).flatMap((card) => card.examples.map((example) => [example.coin, card.category]));
	assert.deepEqual(
		inputs.map((input) => input.coin).sort(),
		[...new Set([...FEATURED_MARKETS.map((market) => market.coin), ...tabRows.map(([coin]) => coin)])].sort(),
		"every 03 tab row has a live input, each coin once",
	);
	for (const [coin, category] of tabRows) {
		const input = inputs.find((entry) => entry.coin === coin);
		assert.equal(input.kind, liveKindOf(category), `${coin} reads as ${category}`);
		if (category === "preipo" && !getPreIpoTerms(coin)) assert.equal(input.valuationPerPriceUsd, null, `${coin} has no verified unit`);
	}
	assert.deepEqual(getStatsDexes().map((entry) => entry.dex), ["", "io", "xyz"]);
	assert.deepEqual(getStatsDexes().map((entry) => entry.label), ["Hyperliquid core perps", "EntropyIO", "XYZ"]);
	assert.deepEqual(getListedTotals(), {
		markets: MARKET_STRUCTURE.dexes.reduce((sum, dex) => sum + dex.markets.length, 0),
		deployers: MARKET_STRUCTURE.dexes.length - 1,
	});
	assert.equal(getFeaturedMarkets().find((market) => market.coin === "io:OAI").preIpoTerms.scheduledSettlement, "2028-09-02");
	assert.equal(
		terminalTradeUrl("io:OAI", "hero_market"),
		`${APP_URL}/trade/io:OAI?utm_source=website&utm_medium=site&utm_campaign=en_home&utm_content=hero_market`,
	);
	assert.equal(new URL(terminalTradeUrl("BTC", "ticker")).pathname, "/trade/BTC");
	assert.throws(() => terminalTradeUrl("BTC", "Hero CTA"));
});

test("category normalization matches the terminal's normalizePerpCategory", () => {
	assert.equal(normalizePerpCategory(" FX "), "fx");
	assert.equal(normalizePerpCategory("Stock"), "stocks");
	assert.equal(normalizePerpCategory("preipo"), "preipo");
	assert.equal(normalizePerpCategory(undefined), undefined);
	const terminal = readFileSync(
		resolve(WEBSITE_ROOT, "../terminal/src/components/trade/chart/token-selector-categories.ts"),
		"utf8",
	);
	assert.match(
		terminal,
		/export function normalizePerpCategory\(category: string \| undefined\): string \| undefined \{\s*const normalized = category\?\.trim\(\)\.toLowerCase\(\);\s*return normalized === "stock" \? "stocks" : normalized;\s*\}/,
		"the terminal changed normalizePerpCategory; update src/lib/markets/rules.ts to match",
	);
	const hlReact = readFileSync(resolve(WEBSITE_ROOT, "../../packages/hl-react/src/types/markets.ts"), "utf8");
	assert.match(hlReact, /return asset\.isDelisted === true;/, "isPerpDelisted changed; update rules.ts");
});

test("the snapshot reader drops delisted assets and refuses isDelisted values other than absent or true", () => {
	const io = JSON.parse(readFileSync(resolve(WEBSITE_ROOT, "tests/fixtures/meta-and-asset-ctxs-io.json"), "utf8"));
	const annotations = new Map([
		["io:OAI", { category: "preipo", displayName: "OPENAI" }],
		["io:ANTH", { category: " PreIPO ", displayName: "ANTH" }],
	]);
	const markets = readListedMarkets("io", io.body, annotations);
	assert.deepEqual(markets.map((market) => [market.coin, market.category]), [
		["io:OAI", "preipo"],
		["io:ANTH", "preipo"],
	]);
	assert.equal(markets[0].onlyIsolated, true);
	assert.equal(markets[0].growthMode, true);
	assert.match(markets[0].dayNtlVlm, /^\d+$/);
	assert.equal("markPx" in markets[0] || "maxLeverage" in markets[0], false);

	const explicitFalse = structuredClone(io.body);
	explicitFalse[0].universe[0].isDelisted = false;
	assert.throws(() => readListedMarkets("io", explicitFalse, annotations), /only absent or true/);
	assert.throws(() => readListedMarkets("xyz", io.body, annotations), /belongs to another dex/);

	const main = JSON.parse(readFileSync(resolve(WEBSITE_ROOT, "tests/fixtures/meta-and-asset-ctxs-main.json"), "utf8"));
	const mainCategories = readListedMarkets("", main.body, new Map([["BTC", { category: "stocks" }]])).map((market) => market.category);
	assert.equal(mainCategories.length, main.body[0].universe.length);
	assert.ok(
		mainCategories.every((category) => category === "crypto"),
		"main-dex perps are crypto by dex, not by annotation",
	);
});

test("terminal:check reads the deployer table and the restricted countries it compares with the live commit", () => {
	const deployers = readFileSync(resolve(WEBSITE_ROOT, "../terminal/src/config/hip3-deployers.ts"), "utf8");
	const documented = documentedDexes(deployers);
	for (const dex of MARKET_STRUCTURE.dexes.slice(1)) {
		assert.equal(documented.includes(dex.dex), Boolean(getHip3DeployerDocumentationUrl(dex.dex)), dex.dex);
	}
	assert.equal(documentedDexes(deployers.replace("HIP3_DEPLOYER_DOCUMENTATION_URLS", "RENAMED")), null);
	const geo = readFileSync(resolve(WEBSITE_ROOT, "../terminal/src/config/geo.ts"), "utf8");
	const countries = restrictedCountries(geo);
	assert.ok(countries.includes("US") && countries.length >= 5, `read ${countries}`);
	assert.equal(restrictedCountries(geo.replace("TRADE_RESTRICTED_COUNTRIES", "RENAMED")), null);
});
