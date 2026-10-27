// Phase 2 homepage on the built site (plan §4 blocks 01–10 without 05, §6 fonts and motion, R6 groups).
// Run after `astro build` with `pnpm --filter @sairn/website test:dist`.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import tokens from "../../../../brand/loader/sairn-motion.tokens.json" with { type: "json" };
import { BRAND_NAME, OFFICIAL_HOSTS } from "../../src/config/brand.ts";
import { formatIsoDate, HERO_HEADLINE, HERO_REEL_WORDS, HL_ORDER_BOOK_DOCS_URL, RISK_SENTENCE } from "../../src/config/copy.ts";
import { FEATURED_MARKETS } from "../../src/config/featured-markets.ts";
import { findGrowthModeFeeExample } from "../../src/lib/markets/fees.ts";
import { cspHash } from "../../src/lib/csp.ts";
import { MOTION_ROOT_RULE } from "../../src/lib/motion.ts";
import {
	getCategoryCards,
	getListedTotals,
	getStatsDexes,
	MARKET_STRUCTURE,
	MARKET_TAB_ROWS,
	SNAPSHOT_FETCHED_AT,
} from "../../src/lib/markets/structure.ts";
import { byName, closest, elementChildren, findAll, hasAttr, normalizedText, parseHtml } from "./html.mjs";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist");
const WEBSITE_NODE_MODULES = resolve(dirname(fileURLToPath(import.meta.url)), "../../node_modules");
assert.ok(existsSync(resolve(DIST, "index.html")), "dist/index.html is missing: run `astro build` before test:dist");

const FILES = listFiles(DIST).map((file) => relative(DIST, file));
const HOME = parseHtml(readFileSync(resolve(DIST, "index.html"), "utf8"));
const BODY = findAll(HOME, byName("body"))[0];
const MAIN = findAll(BODY, byName("main"))[0];
const SECTIONS = findAll(MAIN, byName("section"));
const TERMINAL_LINK = (element) => element.name === "a" && /[?&]utm_source=website(?:&|$)/.test(element.attrs.href ?? "");

function section(id) {
	const found = SECTIONS.find((element) => element.attrs.id === id);
	assert.ok(found, `no <section id="${id}">`);
	return found;
}

function utmContent(link) {
	return new URL(link.attrs.href).searchParams.get("utm_content");
}

test("the home page renders blocks 01–10 in the plan's order, without the video block", () => {
	const order = SECTIONS.map((element) => element.attrs.id ?? element.attrs["aria-labelledby"]);
	assert.deepEqual(order, ["hero-title", "account", "markets-now", "markets", "features", "start", "fees", "security", "faq", "facts-title"]);
	assert.equal(findAll(HOME, byName("video")).length, 0, "05 is not rendered until the operator's video exists");
	assert.equal(findAll(HOME, byName("h1")).length, 1);
	assert.ok(closest(findAll(HOME, byName("h1"))[0], (element) => element === SECTIONS[0]), "the H1 is in the hero");
	assert.equal(findAll(BODY, byName("footer")).length, 1);
});

test("the header has the logo lockup, the five anchors and Open terminal, with no risk text", () => {
	const header = findAll(BODY, byName("header"))[0];
	const logo = findAll(header, (element) => element.name === "img" && element.attrs["data-brand-logo"] === "lockup")[0];
	assert.ok(logo && Number(logo.attrs.height) >= 24, "horizontal logo at least 24px");
	const anchors = findAll(header, (element) => element.name === "a" && (element.attrs.href ?? "").startsWith("/#"));
	assert.deepEqual(
		anchors.map((anchor) => [normalizedText(anchor), anchor.attrs.href]),
		[
			["Markets", "/#markets"],
			["Features", "/#features"],
			["Fees", "/#fees"],
			["Security", "/#security"],
			["FAQ", "/#faq"],
		],
	);
	const cta = findAll(header, TERMINAL_LINK);
	assert.equal(cta.length, 1);
	assert.equal(normalizedText(cta[0]), "Open terminal");
	assert.equal(utmContent(cta[0]), "header");
	assert.equal(normalizedText(header).includes(RISK_SENTENCE), false);
});

test("risk groups cover 01, 02 and 03 together, 06, 07 and 09 (R6)", () => {
	const groups = findAll(MAIN, hasAttr("data-cta-group"));
	const owner = (group) => {
		const own = closest(group, byName("section"));
		if (own) return own.attrs.id ?? own.attrs["aria-labelledby"];
		return findAll(group, byName("section"))
			.map((element) => element.attrs.id)
			.join("+");
	};
	assert.deepEqual(groups.map(owner).sort(), ["faq", "fees", "hero-title", "markets-now+markets", "start"].sort());
	for (const group of groups) {
		assert.ok(normalizedText(group).includes(RISK_SENTENCE), `${owner(group)} has no risk sentence`);
		assert.ok(findAll(group, TERMINAL_LINK).length > 0, `${owner(group)} has no link into the terminal`);
	}
	const start = findAll(section("start"), TERMINAL_LINK);
	assert.deepEqual(start.map(utmContent), ["start_cta"], "06 has one CTA");
});

test("Features shows the plan's six benefit cards, language support first", () => {
	const titles = findAll(section("features"), byName("h3")).map(normalizedText);
	assert.deepEqual(titles, [
		"Trade in your language",
		"No wallet? Use your email.",
		"Set TP/SL as you enter",
		"Everything in one workspace",
		"Trade from your phone",
		"More in the terminal",
	]);
});

test("Security draws Fig. 1 as an illustration with the brand box limited to interface and builder fee", () => {
	const figure = findAll(section("security"), byName("figure"))[0];
	assert.ok(figure);
	const text = normalizedText(figure);
	assert.match(text, /\bIllustration\b/);
	for (const node of ["Your browser", "Signer", "the wallet Privy creates for your account", "a trading key you approve", "Hyperliquid on-chain order book", "Your Hyperliquid address"]) {
		assert.ok(text.includes(node), `Fig. 1 lacks "${node}"`);
	}
	assert.match(text, new RegExp(`${BRAND_NAME} Interface \\+ builder fee`));
	const checklist = normalizedText(section("security"));
	assert.ok(checklist.includes(`No one at ${BRAND_NAME}, support included, will ever ask you to share your private key, seed phrase, sign-in code or password.`));
	assert.ok(checklist.includes("not Hyperliquid Corp. or the Hyper Foundation"));
});

test("the Fees block shows the snapshot's dated growth-mode example", () => {
	const example = findGrowthModeFeeExample(MARKET_STRUCTURE, FEATURED_MARKETS.map((market) => market.coin));
	const rendered = findAll(section("fees"), (element) => element.attrs["data-fee-example"] !== undefined);
	if (!example) {
		assert.equal(rendered.length, 0);
		return;
	}
	assert.equal(rendered.length, 1);
	assert.equal(rendered[0].attrs["data-fee-example"], example.coin);
	const text = normalizedText(rendered[0]);
	assert.ok(text.includes(`on ${formatIsoDate(SNAPSHOT_FETCHED_AT)}:`), "the example carries the snapshot date");
	assert.ok(text.includes(`${example.takerPercent} Hyperliquid taker fee + ${example.builderPercent} builder fee`));
	assert.ok(text.includes(`${example.makerPercent} + ${example.builderPercent} as a maker`));
	assert.match(text, /growth mode; a perpetual, not shares/);
});

test("the build ships only the Plex Sans and Plex Mono latin fonts and preloads Plex Sans alone", () => {
	// Astro Fonts API (astro.config.mjs): the files are byte-for-byte the Fontsource latin files, copied under
	// _astro/fonts/, with their @font-face rules and font stacks written inline by <Font />.
	const fonts = FILES.filter((file) => /\.(woff2?|ttf|otf)$/.test(file));
	assert.equal(fonts.length, 2);
	const sources = {
		sans: readFileSync(resolve(WEBSITE_NODE_MODULES, "@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2")),
		mono: readFileSync(resolve(WEBSITE_NODE_MODULES, "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2")),
	};
	const fileOf = (bytes) => fonts.find((file) => readFileSync(resolve(DIST, file)).equals(bytes));
	const sans = fileOf(sources.sans);
	const mono = fileOf(sources.mono);
	assert.ok(sans?.startsWith("_astro/fonts/") && mono?.startsWith("_astro/fonts/"), `unexpected font files: ${fonts.join(", ")}`);

	const css = FILES.filter((file) => file.endsWith(".css"))
		.map((file) => readFileSync(resolve(DIST, file), "utf8"))
		.join("\n");
	assert.doesNotMatch(css, /Inter|Instrument Serif/);
	assert.equal(css.match(/@font-face/g)?.length ?? 0, 0, "the faces come from <Font />, not the stylesheet");
	assert.match(css, /font-variant-numeric:\s*tabular-nums/);
	assert.match(css, /--font-sans:\s*var\(--font-plex-sans\)/);
	assert.match(css, /--font-mono:\s*var\(--font-plex-mono\)/);

	const faces = findAll(HOME, byName("style"))
		.map((style) => style.children[0]?.value ?? "")
		.filter((rule) => rule.includes("@font-face"));
	assert.equal(faces.length, 2, "one <Font /> style for each family");
	const [sansFaces, monoFaces] = [`/${sans}`, `/${mono}`].map((url) => faces.find((rule) => rule.includes(url)) ?? "");
	assert.match(sansFaces, /font-display:block;/);
	assert.match(sansFaces, /font-weight:100 700;/);
	assert.match(monoFaces, /font-display:swap;/);
	for (const rule of [sansFaces, monoFaces]) {
		assert.match(rule, /unicode-range:U\+0000-00FF,/, "latin subset only");
		assert.equal(rule.match(/@font-face/g)?.length, 1, "no generated fallback face (astro.config.mjs explains why)");
	}
	// Glyphs outside the latin files (→, ▲▼) keep coming from the same system fonts as before the Fonts API.
	assert.match(sansFaces, /--font-plex-sans:"IBM Plex Sans Variable-\w+","IBM Plex Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;/);
	assert.match(monoFaces, /--font-plex-mono:"IBM Plex Mono-\w+",ui-monospace,"SF Mono",Menlo,Consolas,monospace;/);

	const preloads = findAll(HOME, (element) => element.name === "link" && element.attrs.rel === "preload");
	assert.deepEqual(
		preloads.map((link) => [link.attrs.as, link.attrs.type, link.attrs.href]),
		[["font", "font/woff2", `/${sans}`]],
	);
});

// Astro CSP API (astro.config.mjs `security.csp`): every page carries one meta policy. Hyperliquid's public API is
// the only remote origin, for REST and the Open Book WebSocket; every inline script or style the page carries has
// its hash in the policy, and nothing relies on 'unsafe-inline'.
const EXPECTED_DIRECTIVES = {
	"default-src": ["'self'"],
	"connect-src": ["'self'", "https://api.hyperliquid.xyz", "wss://api.hyperliquid.xyz"],
	"img-src": ["'self'", "data:"],
	"media-src": ["'self'"],
	"font-src": ["'self'"],
};

test("every page carries a hash-based content security policy that allows only Hyperliquid's API", () => {
	const pages = FILES.filter((file) => file.endsWith(".html"));
	assert.ok(pages.length >= 7);
	for (const page of pages) {
		const html = readFileSync(resolve(DIST, page), "utf8");
		const tree = parseHtml(html);
		const metas = findAll(tree, (element) => element.name === "meta" && element.attrs["http-equiv"] === "content-security-policy");
		assert.equal(metas.length, 1, `${page}: one CSP meta`);
		const directives = Object.fromEntries(
			metas[0].attrs.content
				.split(";")
				.map((part) => part.trim().split(/\s+/))
				.filter((part) => part[0])
				.map(([name, ...values]) => [name, values]),
		);
		for (const [name, values] of Object.entries(EXPECTED_DIRECTIVES)) assert.deepEqual(directives[name], values, `${page} ${name}`);
		for (const name of ["script-src", "style-src"]) {
			assert.equal(directives[name]?.[0], "'self'", `${page} ${name}`);
			assert.ok(directives[name].slice(1).every((value) => /^'sha256-[\w+/=]+'$/.test(value)), `${page} ${name} holds only hashes after 'self'`);
		}
		assert.doesNotMatch(metas[0].attrs.content, /unsafe-inline|unsafe-eval|\*/, `${page}: no wildcard or unsafe source`);
		assert.doesNotMatch(html, /\sstyle="/, `${page}: an inline style attribute would be blocked`);
		assert.doesNotMatch(html, /\son[a-z]+="/, `${page}: an inline event handler would be blocked`);

		const hashes = (name) => new Set(directives[name].slice(1).map((value) => value.slice(1, -1)));
		for (const element of findAll(tree, (node) => node.name === "script" && !node.attrs.src)) {
			if (/^application\/(?:ld\+)?json$/.test(element.attrs.type ?? "")) continue;
			assert.ok(hashes("script-src").has(cspHash(element.children[0]?.value ?? "")), `${page}: an inline script has no hash`);
		}
		for (const element of findAll(tree, byName("style"))) {
			assert.ok(hashes("style-src").has(cspHash(element.children[0]?.value ?? "")), `${page}: an inline style has no hash`);
		}
	}
});

test("the built page carries the brand motion tokens", () => {
	const style = findAll(HOME, (element) => element.name === "style" && element.attrs["data-motion-tokens"] !== undefined)[0];
	assert.ok(style);
	const rule = style.children[0]?.value ?? "";
	assert.equal(rule, MOTION_ROOT_RULE);
	assert.ok(rule.includes(`--motion-duration-confirm:${tokens.duration.confirm}ms`));
	assert.ok(rule.includes(`--motion-ease-enter:${tokens.easing.enter}`));
});

function tabBlocks(root) {
	return findAll(root, hasAttr("data-tabs")).map((block) => {
		const tabs = findAll(block, (element) => element.attrs.role === "tab");
		const panels = tabs.map((tab) => findAll(HOME, (element) => element.attrs.id === tab.attrs["aria-controls"])[0]);
		return { block, tabs, panels };
	});
}

test("every tab block is a complete WAI-ARIA tab set that renders its static panels for readers without JavaScript", () => {
	const blocks = tabBlocks(MAIN);
	assert.equal(blocks.length, 3, "the hero preview, 03 markets and 04 features");
	for (const { block, tabs, panels } of blocks) {
		const list = findAll(block, hasAttr("data-tablist"))[0];
		assert.equal(list.attrs.role, "tablist");
		assert.ok(list.attrs["aria-label"], "the tab list is named");
		assert.equal(list.attrs["aria-orientation"], undefined, "tabs.ts sets the orientation from the list's real layout");
		assert.deepEqual(tabs.map((tab) => tab.attrs["aria-selected"]), tabs.map((_, index) => (index === 0 ? "true" : "false")));
		tabs.forEach((tab, index) => {
			const panel = panels[index];
			assert.ok(panel, `${tab.attrs.id} controls a panel that exists`);
			assert.equal(panel.attrs.role, "tabpanel");
			assert.equal(panel.attrs["aria-labelledby"], tab.attrs.id);
			const requiresJs = "data-requires-js" in panel.attrs;
			assert.equal("hidden" in panel.attrs, requiresJs, "only a panel that needs JavaScript is hidden in the markup");
			assert.equal("data-tabpanel-deferred" in panel.attrs, index > 0 && !requiresJs, "later static panels wait for tabs.ts");
			assert.equal(tab.attrs.tabindex, index === 0 ? undefined : "-1");
		});
	}
	// tests/built/tabs-browser.test.mjs checks the rendered result in Chromium; this pins that the rules ship.
	const css = FILES.filter((file) => file.endsWith(".css")).map((file) => readFileSync(resolve(DIST, file), "utf8")).join("\n");
	assert.match(css, /html\.js:not\(\.js-loaded\) \[data-tabs\]:not\(\[data-tabs-ready\]\) \[data-tabpanel-deferred\]\{display:none\}/);
	assert.match(css, /html:not\(\.js\) \[data-tablist\],html\.js-loaded \[data-tabs\]:not\(\[data-tabs-ready\]\) \[data-tablist\]\{display:none\}/);
	assert.doesNotMatch(css, /\[data-tabpanel\]\[hidden\]/, "no rule tries to un-hide [hidden] panels against the preflight");
});

test("the hero screenshot ships AVIF and WebP within the first-screen budget, with a JPEG fallback and intrinsic sizes", () => {
	const picture = findAll(findAll(MAIN, (element) => element.attrs.id === "preview-terminal")[0], byName("picture"))[0];
	const sources = findAll(picture, byName("source"));
	const image = findAll(picture, byName("img"))[0];
	const budget = { "(min-width: 640px)": 80_000, undefined: 45_000 };
	const seen = [];
	for (const source of sources) {
		assert.ok(Number(source.attrs.width) > 0 && Number(source.attrs.height) > 0, "every source states its size");
		const bytes = readFileSync(resolve(DIST, source.attrs.srcset.replace(/^\//, ""))).length;
		const type = source.attrs.type ?? "image/jpeg";
		seen.push(`${source.attrs.media ?? "phone"} ${type}`);
		if (type === "image/avif") assert.ok(bytes <= budget[source.attrs.media], `${source.attrs.srcset}: ${bytes} B over the plan §8 budget`);
	}
	assert.deepEqual(seen, [
		"(min-width: 640px) image/avif",
		"(min-width: 640px) image/webp",
		"(min-width: 640px) image/jpeg",
		"phone image/avif",
		"phone image/webp",
	]);
	assert.match(image.attrs.src, /\.jpe?g$/, "the <img> falls back to the captured JPEG");
	assert.ok(Number(image.attrs.width) > 0 && Number(image.attrs.height) > 0);
	assert.equal(image.attrs.loading, "eager");
	assert.doesNotMatch(image.attrs.alt, /market selector/, "the alt text describes the trading workspace now shown");
});

test("03 has one tab per category with the counts, deployers and up to six deep-linked rows (no-JS content in the build)", () => {
	const markets = section("markets");
	const cards = getCategoryCards(MARKET_TAB_ROWS);
	const [{ tabs, panels }] = tabBlocks(markets);
	assert.deepEqual(tabs.map((tab) => normalizedText(tab).replace(/\s*\d+$/, "")), cards.map((card) => ({ crypto: "Crypto", stocks: "Stocks", indices: "Indices", commodities: "Commodities", fx: "FX", preipo: "Pre-IPO", rates: "Rates" })[card.category]));
	cards.forEach((card, index) => {
		const panel = panels[index];
		const text = normalizedText(panel);
		assert.ok(text.includes(card.listedCount === 1 ? "1 market" : `${card.listedCount} markets`));
		if (card.deployers.length > 0) assert.ok(text.includes("Run by"), `${card.category} names who runs it`);
		const rows = findAll(panel, hasAttr("data-live-row"));
		assert.deepEqual(rows.map((row) => row.attrs["data-live-row"]), card.examples.map((example) => example.coin));
		assert.ok(rows.length > 0 && rows.length <= MARKET_TAB_ROWS);
		for (const row of rows) {
			const links = findAll(row, TERMINAL_LINK);
			assert.equal(links.length, 1, "one Trade link per row");
			assert.equal(new URL(links[0].attrs.href).pathname, `/trade/${row.attrs["data-live-row"]}`);
			assert.equal(utmContent(links[0]), `markets_${card.category}`);
			for (const slot of findAll(row, (element) => ["data-live-primary", "data-live-change"].some((name) => name in element.attrs))) {
				assert.equal(normalizedText(slot), "", "price slots are empty until validated live data arrives");
			}
		}
	});
	const text = normalizedText(markets);
	assert.match(text, /Pre-IPO perpetuals are cash-settled contracts/);
	assert.match(text, /does not review these markets/);
	assert.ok(text.includes(RISK_SENTENCE));
});

test("02 opens with the stats band: catalogue counts and live activity in separate, labelled groups", () => {
	const stats = findAll(section("markets-now"), hasAttr("data-live-stats"))[0];
	assert.ok(stats, "the stats band is in 02");
	const text = normalizedText(stats);
	const listed = getListedTotals();
	const lists = findAll(stats, byName("dl"));
	assert.equal(lists.length, 2, "the catalogue and the live activity are two lists");
	const [catalogue, activity] = lists.map((list) => {
		const label = findAll(HOME, (element) => element.attrs.id === list.attrs["aria-labelledby"])[0];
		assert.ok(label, "each group is labelled by its own header");
		return { list, label: normalizedText(label) };
	});
	assert.equal(catalogue.label, `Market catalogue · snapshot ${formatIsoDate(SNAPSHOT_FETCHED_AT)}`);
	assert.ok(normalizedText(catalogue.list).includes(`Perp markets listed ${listed.markets}`));
	assert.ok(normalizedText(catalogue.list).includes(`HIP-3 deployers ${listed.deployers}`));
	assert.equal(findAll(catalogue.list, hasAttr("data-live-stat")).length, 0, "no live number sits under the snapshot header");
	assert.equal(stats.attrs["data-live-stats-dexes"], JSON.stringify(getStatsDexes().map((entry) => entry.dex)));
	const venues = getStatsDexes().map((entry) => entry.label.replace(/^Hyperliquid /, ""));
	assert.match(activity.label, /^Live activity · Selected Hyperliquid venues: /);
	for (const venue of venues) assert.ok(activity.label.includes(venue), `the live header names ${venue}, which the totals sum`);
	const live = findAll(activity.list, hasAttr("data-live-stat"));
	assert.deepEqual(live.map((stat) => stat.attrs["data-live-stat"]), ["volume", "openInterest"]);
	for (const stat of live) {
		assert.equal(normalizedText(findAll(stat, hasAttr("data-live-stat-value"))[0]), "");
		assert.equal(findAll(stat, hasAttr("data-live-stat-slot"))[0].attrs["aria-busy"], "true");
	}
	const method = findAll(stats, byName("details"))[0];
	assert.ok(method, "the band explains how the numbers are calculated");
	assert.equal(normalizedText(findAll(method, byName("summary"))[0]), "How these are calculated");
	assert.match(normalizedText(method), /not the depth available to fill an order/);
	assert.match(normalizedText(method), /HIP-3 markets can be thin/);
	assert.doesNotMatch(text, /—|\$0\b|NaN|\.\.\./);
});

test("an early block explains the account and execution model without calling the brand a protocol", () => {
	const account = section("account");
	const text = normalizedText(account);
	assert.equal(normalizedText(findAll(account, byName("h2"))[0]), "Your account. Hyperliquid execution.");
	assert.match(text, /Your funds stay in your own Hyperliquid account/);
	assert.match(text, /With email, a wallet created for your account signs your orders; with your own wallet, a trading key you approve signs them/);
	assert.ok(text.includes(`For each market, ${BRAND_NAME} accesses the same order book as other interfaces connected to Hyperliquid`));
	const docs = findAll(account, (element) => element.name === "a" && element.attrs.href === HL_ORDER_BOOK_DOCS_URL);
	assert.equal(docs.length, 1, "the order-book claim links to Hyperliquid's documentation");
	assert.doesNotMatch(text, /decentrali[sz]ed|\bprotocol\b|no intermediar/i);
	const hero = normalizedText(SECTIONS[0]);
	assert.match(hero, /Your funds stay in your own Hyperliquid account\./);
	// 2026-10-26 hero density review: the execution fact moved to #account, the builder fee to #fees and the
	// restricted-locations line to the FAQ and the facts block; the hero keeps one risk footnote under its CTAs.
	assert.deepEqual(findAll(SECTIONS[0], hasAttr("data-hero-fact")), []);
	const risk = findAll(SECTIONS[0], hasAttr("data-hero-risk"))[0];
	const group = closest(risk, hasAttr("data-cta-group"));
	assert.ok(group, "the risk footnote sits under the CTAs, in the hero's risk group");
	assert.ok(normalizedText(risk).startsWith(RISK_SENTENCE));
	assert.match(normalizedText(risk), /not shares; outside exchange hours, prices come from the deployer\. Risk disclosure$/);
	assert.doesNotMatch(normalizedText(SECTIONS[0]), /builder fee|restricted locations/i);
});

test("the hero's H1 is the plan's sentence, with the category reel decorative and the preview defaulting to Terminal", () => {
	const hero = SECTIONS[0];
	const h1 = findAll(hero, byName("h1"))[0];
	const accessible = findAll(h1, (element) => element.attrs.class === "sr-only")[0];
	assert.equal(normalizedText(accessible), HERO_HEADLINE);
	const visual = findAll(h1, (element) => element.attrs["aria-hidden"] === "true")[0];
	const track = findAll(visual, (element) => element.attrs.class === "reel-track")[0];
	assert.deepEqual(elementChildren(track).map(normalizedText), HERO_REEL_WORDS, "the reel lists its words in order");
	assert.equal(findAll(hero, (element) => element.attrs.id === "preview-live")[0].attrs["data-requires-js"], "");
	assert.equal(findAll(hero, (element) => element.attrs.id === "preview-tab-terminal")[0].attrs["aria-selected"], "true");
});

test("Security lists every official address from brand.json as plain text", () => {
	const block = findAll(section("security"), (element) => element.attrs["aria-labelledby"] === "official-links-title")[0];
	assert.ok(block);
	const text = normalizedText(block);
	for (const { host } of OFFICIAL_HOSTS) assert.ok(text.includes(host), `Official links lack ${host}`);
	assert.equal(findAll(block, byName("a")).length, 0, "addresses are text to type or bookmark, not links");
});

function listFiles(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		return entry.isDirectory() ? listFiles(path) : [path];
	});
}
