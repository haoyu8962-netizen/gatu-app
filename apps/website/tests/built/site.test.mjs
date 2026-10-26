// Assertions on the built site (`astro build` → dist/). Run with `pnpm --filter @sairn/website test:dist`
// after the build; the rule numbers are those of docs/website-plan.md §9.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import brand from "../../../../brand/brand.json" with { type: "json" };
import capture from "../../src/assets/terminal-capture.json" with { type: "json" };
import { APP_HOST, BRAND_NAME, SITE_URL, THEME_COLOR } from "../../src/config/brand.ts";
import { formatUtcTimestamp, RISK_SENTENCE } from "../../src/config/copy.ts";
import { getDeployers, getFeaturedMarkets, getPreIpoRows } from "../../src/lib/markets/structure.ts";
import {
	byName,
	closest,
	elementChildren,
	findAll,
	hasAttr,
	normalizedText,
	parseHtml,
	walk,
} from "./html.mjs";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = resolve(WEBSITE_ROOT, "dist");

assert.ok(existsSync(resolve(DIST, "index.html")), "dist/index.html is missing: run `astro build` before test:dist");

const FILES = listFiles(DIST).map((file) => relative(DIST, file));
const PAGES = FILES.filter((file) => file.endsWith(".html"));

// These pages render legal/*.md, which carries its own terminal links and risk wording; the legal text
// is owned by legal/ and confirmed by the operator, so the marketing CTA rule does not apply (plan R6).
const LEGAL_PAGES = new Set(["terms/index.html", "privacy/index.html", "risk/index.html", "support/index.html"]);
const MARKETING_PAGES = PAGES.filter((page) => !LEGAL_PAGES.has(page));

const HOME = readPage("index.html");
const HOME_BODY = findAll(HOME, byName("body"))[0];
const SECTIONS = findAll(HOME_BODY, byName("section"));
const MARKETS_SECTION = sectionById("markets");
const TICKER_SECTION = sectionById("markets-now");

const TERMINAL_LINK = (element) => element.name === "a" && /[?&]utm_source=website(?:&|$)/.test(element.attrs.href ?? "");
const NOT_SHARES = /\bnot shares\b|\bno ownership\b|\bno rights in the company\b/i;
const COMPANY_REFERENCE = /\bstocks?\b|\bpre-IPO\b|\bcompan(?:y|ies)\b/i;
const AROUND_THE_CLOCK = /24\/7|around the clock/i;
const DEPLOYER_PRICING = /prices? comes? from the deployer/i;

test("the build lists every page the plan expects, legal pages included", () => {
	for (const page of ["index.html", "404.html", "blog/index.html", ...LEGAL_PAGES]) {
		assert.ok(PAGES.includes(page), `dist/${page} is missing`);
	}
});

test("no retired gatu name survives anywhere in the build", () => {
	const hits = FILES.filter((file) => readFileSync(resolve(DIST, file)).toString("latin1").toLowerCase().includes("gatu"));
	assert.deepEqual(hits, [], "ADR 0032 retired the gatu.ai domain and name");
});

test("every block that links into the terminal carries the risk sentence (R6)", () => {
	let checked = 0;
	for (const page of MARKETING_PAGES) {
		const document = readPage(page);
		const links = findAll(document, TERMINAL_LINK);
		checked += links.length;
		for (const group of findAll(document, hasAttr("data-cta-group"))) {
			if (findAll(group, TERMINAL_LINK).length === 0) continue;
			assert.ok(normalizedText(group).includes(RISK_SENTENCE), `${page}: a [data-cta-group] with terminal links has no risk sentence`);
		}
		for (const link of links) {
			const where = `${page}: ${link.attrs.href}`;
			if (closest(link, byName("header"))) continue;
			const section = closest(link, byName("section"));
			assert.ok(section, `${where} sits outside any <section> or the header`);
			const grouped =
				closest(section, hasAttr("data-cta-group")) || findAll(section, hasAttr("data-cta-group")).length > 0;
			assert.ok(grouped, `${where}: its <section> neither sits in nor contains a [data-cta-group]`);
		}
	}
	assert.ok(checked >= 10, "expected the home page to link into the terminal with utm_source=website");
	const header = findAll(HOME_BODY, byName("header"))[0];
	assert.ok(header, "the home page has a header");
	assert.equal(normalizedText(header).includes(RISK_SENTENCE), false, "the header carries no risk text (plan §4)");
});

test("the markets block names every deployer and says the brand does not review their markets (R1)", () => {
	const text = normalizedText(MARKETS_SECTION);
	const deployers = getDeployers().map((deployer) => deployer.fullName);
	assert.ok(deployers.length >= 3);
	for (const name of deployers) assert.ok(text.includes(name), `#markets does not name ${name}`);
	assert.ok(text.includes(`${BRAND_NAME} is the interface and does not review these markets`));

	for (const market of getFeaturedMarkets().filter((featured) => featured.coin.includes(":"))) {
		const card = findAll(TICKER_SECTION, (element) => element.attrs["data-market-coin"] === market.coin)[0];
		assert.ok(card, `the ticker has no card for ${market.coin}`);
		assert.ok(normalizedText(card).includes(`by ${market.deployerFullName}`), `${market.coin} does not name its deployer`);
	}
	for (const example of findAll(MARKETS_SECTION, (element) => (element.attrs["data-market-coin"] ?? "").includes(":"))) {
		assert.match(normalizedText(example), /\bby \S/, `${example.attrs["data-market-coin"]} does not name its deployer`);
	}
});

test("every block that references companies says the contracts are not shares (R2)", () => {
	const companies = [
		...getFeaturedMarkets()
			.filter((market) => market.featuredCategory === "stocks" || market.featuredCategory === "preipo")
			.map((market) => market.name),
		...getPreIpoRows().map((row) => row.name),
	];
	const referencing = SECTIONS.filter((section) => {
		const text = normalizedText(section);
		return COMPANY_REFERENCE.test(text) || companies.some((name) => text.includes(name));
	});
	assert.ok(referencing.length >= 4, "expected the hero, ticker, markets and FAQ to reference companies");
	for (const section of referencing) {
		assert.match(normalizedText(section), NOT_SHARES, `<section ${sectionLabel(section)}> references companies without saying they are not shares`);
	}

	const markets = normalizedText(MARKETS_SECTION);
	assert.match(markets, /no ownership, dividend or voting rights/, "03 also rules out dividends and voting rights");
	assert.match(markets, /not an IPO allocation/, "the Pre-IPO card says it is not an IPO allocation");
	assert.match(markets, /cash-settled/, "the Pre-IPO card says the contracts are cash-settled");
});

test("every 24/7 claim sits with the note that the deployer prices closed markets (R4)", () => {
	let claims = 0;
	walk(HOME_BODY, (node) => {
		if (node.type !== "text" || !AROUND_THE_CLOCK.test(node.value) || closest(node, byName("script"))) return;
		claims += 1;
		const block = closest(node, byName("details")) ?? closest(node, byName("section"));
		assert.ok(block, `"${node.value.trim()}" sits outside any block`);
		assert.match(normalizedText(block), DEPLOYER_PRICING, `"${node.value.trim()}" has no deployer-pricing note in its block`);
	});
	assert.ok(claims >= 3, "expected the hero, markets block and FAQ to say 24/7");
});

test("restricted-location sentences link to a Terms anchor that exists (R7)", () => {
	const terms = readPage("terms/index.html");
	const anchors = new Set(findAll(terms, hasAttr("id")).map((element) => element.attrs.id));
	let sentences = 0;
	walk(HOME_BODY, (node) => {
		if (node.type !== "text" || !/restricted locations/i.test(node.value) || closest(node, byName("script"))) return;
		sentences += 1;
		const paragraph = closest(node, byName("p"));
		assert.ok(paragraph, `"${node.value.trim()}" is not in a paragraph`);
		const termsLinks = findAll(paragraph, (element) => element.name === "a" && /^\/terms\/#/.test(element.attrs.href ?? ""));
		assert.ok(termsLinks.length > 0, `"${node.value.trim()}" does not link to a Terms section`);
		for (const link of termsLinks) {
			const anchor = decodeURIComponent(link.attrs.href.slice("/terms/#".length));
			assert.ok(anchors.has(anchor), `/terms/ has no element with id "${anchor}"`);
		}
	});
	assert.ok(sentences >= 3, "expected the hero, FAQ and facts block to mention restricted locations");
	assert.match(normalizedText(HOME_BODY), /deployers may apply their own restrictions/i);
});

test("the FAQPage structured data parses and matches the visible FAQ", () => {
	const schemas = findAll(HOME, (element) => element.name === "script" && element.attrs.type === "application/ld+json").map(
		(script) => JSON.parse(script.children[0]?.value ?? ""),
	);
	const faqPage = schemas.find((schema) => schema["@type"] === "FAQPage");
	assert.ok(faqPage, "the home page has FAQPage structured data");
	const visible = findAll(sectionById("faq"), byName("details")).map((details) => {
		const answer = findAll(details, byName("p"))[0];
		return {
			question: normalizedText(findAll(details, byName("summary"))[0]),
			answer: normalizedText(answer),
			links: findAll(answer, byName("a")).map((link) => normalizedText(link)),
		};
	});
	assert.equal(faqPage.mainEntity.length, visible.length, "the structured data and the page list the same number of questions");
	faqPage.mainEntity.forEach((entry, index) => {
		const shown = visible[index];
		assert.equal(entry["@type"], "Question");
		assert.equal(entry.name, shown.question);
		const answer = entry.acceptedAnswer.text.replace(/\s+/g, " ").trim();
		assert.ok(shown.answer.startsWith(answer), `the visible answer to "${entry.name}" differs from the structured data`);
		const rest = shown.answer.slice(answer.length).trim();
		assert.ok(rest === "" || shown.links.includes(rest), `"${entry.name}" shows text that the structured data leaves out: "${rest}"`);
	});
});

test("the blog stays noindex and out of the sitemap until its first article", () => {
	const blogPages = PAGES.filter((page) => page.startsWith("blog/"));
	assert.ok(blogPages.length >= 1);
	for (const page of blogPages) {
		const robots = findAll(readPage(page), (element) => element.name === "meta" && element.attrs.name === "robots");
		assert.equal(robots.length, 1, `${page} has one robots meta tag`);
		assert.match(robots[0].attrs.content, /\bnoindex\b/, `${page} is indexable`);
	}
	const sitemaps = FILES.filter((file) => /^sitemap-.*\.xml$/.test(file)).map((file) => readFileSync(resolve(DIST, file), "utf8"));
	assert.ok(sitemaps.some((xml) => xml.includes(`<loc>${SITE_URL}/</loc>`)), "the sitemap lists the home page");
	for (const xml of sitemaps) assert.doesNotMatch(xml, /\/blog\b/, "the sitemap lists a blog page");
});

test("the built pages keep the brand contract: theme colour, social card, logo and accent", () => {
	const meta = (attribute, value) =>
		findAll(HOME, (element) => element.name === "meta" && element.attrs[attribute] === value)[0]?.attrs.content;
	assert.equal(meta("name", "theme-color"), THEME_COLOR);
	assert.equal(THEME_COLOR, brand.pwa.lightThemeColor, "the default theme is light");
	assert.equal(meta("property", "og:site_name"), BRAND_NAME);
	assert.equal(meta("property", "og:image"), `${SITE_URL}/og-website-1200x630.png`);
	assert.ok(FILES.includes("og-website-1200x630.png"), "the declared social card is in the build");

	const logos = findAll(HOME_BODY, (element) => element.name === "img" && element.attrs["data-brand-logo"] === "lockup");
	assert.ok(logos.length >= 1, "the header renders the logo kit's lockup");
	for (const logo of logos) assert.equal(logo.attrs.alt, BRAND_NAME);
	for (const retired of ["logo.svg", "logo-mark.svg", "favicon.svg", "app-desktop.jpeg", "app-mobile.jpeg"]) {
		assert.equal(FILES.includes(retired), false, `dist/${retired} would shadow the brand source`);
	}

	const css = FILES.filter((file) => file.endsWith(".css")).map((file) => readFileSync(resolve(DIST, file), "utf8"));
	for (const theme of ["light", "dark"]) {
		assert.ok(css.some((sheet) => sheet.includes(`--signal:${brand.colors[theme].signal}`)), `the built CSS carries the ${theme} signal colour`);
	}
	for (const theme of ["light", "dark"]) {
		const variants = logos.filter((logo) => logo.attrs["data-logo-theme"] === theme);
		assert.ok(variants.length >= 1, `the header renders the ${theme} artwork`);
		// The SVG is inlined as a data URI; the kit's on-light and on-dark files differ in their logo colours.
		for (const logo of variants) {
			assert.ok(decodeURIComponent(logo.attrs.src).toLowerCase().includes(`fill='${brand.logo[theme].signal.toLowerCase()}'`), `${theme} artwork`);
		}
	}
});

// ADR 0043: marketing emphasis is the website-only amber accent; the mint signal no longer marks it, and amber never
// marks risk, warnings or state.
test("marketing emphasis uses the amber accent and never sits on risk text (ADR 0043)", () => {
	const hasClass = (name) => (element) => (element.attrs.class ?? "").split(/\s+/).includes(name);
	const isAccent = hasClass("text-marketing-accent");

	const css = FILES.filter((file) => file.endsWith(".css")).map((file) => readFileSync(resolve(DIST, file), "utf8"));
	for (const theme of ["light", "dark"]) {
		assert.ok(
			css.some((sheet) => sheet.includes(`--marketing-accent:${brand.websiteColors[theme].marketingAccent}`)),
			`the built CSS carries the ${theme} marketing accent from brand.json`,
		);
	}

	const reel = findAll(HOME_BODY, hasClass("reel"));
	assert.equal(reel.length, 1, "the hero has one reel");
	assert.ok(isAccent(reel[0]), "the hero reel uses the marketing accent");
	const marketsAccent = findAll(sectionById("markets"), isAccent).map((element) => normalizedText(element));
	assert.ok(marketsAccent.includes("one account"), "the markets heading accent uses the marketing accent");
	const faqAccent = findAll(sectionById("faq"), isAccent).filter((element) => closest(element, hasAttr("data-cta-group")));
	assert.deepEqual(
		faqAccent.map((element) => normalizedText(element)),
		["One account."],
		"the closing call to action's accent uses the marketing accent",
	);

	const allowedSections = new Set(["hero-title", "account", "markets", "features", "security", "faq"]);
	for (const page of MARKETING_PAGES) {
		const body = findAll(readPage(page), byName("body"))[0];
		assert.deepEqual(
			findAll(body, hasClass("text-signal")).map((element) => element.name),
			[],
			`${page}: the signal no longer marks marketing emphasis`,
		);
		for (const element of findAll(body, isAccent)) {
			const where = normalizedText(element).slice(0, 40) || element.name;
			assert.equal(closest(element, (parent) => ["header", "footer", "nav"].includes(parent.name)), null, `${page}: ${where}`);
			const section = closest(element, byName("section"));
			assert.ok(
				page === "index.html" && section && allowedSections.has(section.attrs.id ?? section.attrs["aria-labelledby"]),
				`${page}: the marketing accent "${where}" is outside the home page's marketing sections`,
			);
			const paragraph = element.name === "p" ? element : closest(element, byName("p"));
			assert.ok(!paragraph || !normalizedText(paragraph).includes(RISK_SENTENCE), `${page}: "${where}" shares a paragraph with the risk sentence`);
		}
		const riskParagraphs = findAll(body, (element) => element.name === "p" && normalizedText(element).includes(RISK_SENTENCE));
		const factsBlocks = findAll(body, (element) => element.name === "section" && element.attrs["aria-labelledby"] === "facts-title");
		for (const block of [...riskParagraphs, ...factsBlocks]) {
			assert.deepEqual(findAll(block, isAccent), [], `${page}: risk text carries the marketing accent`);
			assert.equal(closest(block, isAccent), null, `${page}: risk text sits inside the marketing accent`);
		}
	}
});

test("the hero screenshot has no mock browser frame and shows when it was captured", () => {
	const figure = findAll(HOME_BODY, byName("figure"))[0];
	assert.ok(figure, "the hero renders its screenshot in a <figure>");
	const [frame, caption, ...extra] = elementChildren(figure);
	assert.deepEqual(extra, [], "the figure holds only the screenshot and its caption");
	assert.equal(caption?.name, "figcaption");
	assert.deepEqual(
		elementChildren(frame).map((child) => child.name),
		["picture"],
		"nothing is drawn around the screenshot: no window controls, address bar or status chip",
	);
	assert.equal(normalizedText(caption), `Screenshot of ${APP_HOST}, signed out · ${formatUtcTimestamp(capture.capturedAt)}`);
});

function readPage(page) {
	return parseHtml(readFileSync(resolve(DIST, page), "utf8"));
}

function sectionById(id) {
	const section = SECTIONS.find((element) => element.attrs.id === id);
	assert.ok(section, `the home page has no <section id="${id}">`);
	return section;
}

function sectionLabel(section) {
	return section.attrs.id ? `id="${section.attrs.id}"` : `aria-labelledby="${section.attrs["aria-labelledby"] ?? ""}"`;
}

function listFiles(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		return entry.isDirectory() ? listFiles(path) : [path];
	});
}
