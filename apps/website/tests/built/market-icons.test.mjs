// Market icons on the built site: one decorative icon per rendered market, served from this origin.
// Run after `astro build` with `pnpm --filter @sairn/website test:dist`.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { findSvgProblems } from "../../scripts/svg-sanitize.mjs";
import manifest from "../../src/data/market-icons.json" with { type: "json" };
import { marketMonogram } from "../../src/lib/markets/icons.ts";
import { getRenderedMarketCoins } from "../../src/lib/markets/structure.ts";
import { byName, findAll, hasAttr, parseHtml } from "./html.mjs";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist");
assert.ok(existsSync(resolve(DIST, "index.html")), "dist/index.html is missing: run `astro build` before test:dist");

const PAGES = readdirSync(DIST, { recursive: true }).map(String).filter((file) => file.endsWith(".html"));
const HOME = parseHtml(readFileSync(resolve(DIST, "index.html"), "utf8"));
const FALLBACK_COINS = new Set(manifest.fallbacks.map((fallback) => fallback.coin));
const ICON_COINS = new Set(manifest.icons.map((icon) => icon.coin));
const BACKPLATE_COINS = new Set(manifest.icons.filter((icon) => icon.backplate).map((icon) => icon.coin));
const SIZES = new Set(["20", "24", "28"]);

function sectionById(id) {
	const section = findAll(HOME, (element) => element.name === "section" && element.attrs.id === id)[0];
	assert.ok(section, `#${id} is missing`);
	return section;
}

/** Every element that lists one market: 03 rows, the Pre-IPO list, the ticker cards and their mirror copies. */
function marketEntries() {
	const markets = sectionById("markets");
	const ticker = sectionById("markets-now");
	return [
		...findAll(markets, hasAttr("data-live-row")).map((element) => ({ element, coin: element.attrs["data-live-row"] })),
		...findAll(markets, (element) => element.name === "li" && hasAttr("data-market-coin")(element)).map((element) => ({
			element,
			coin: element.attrs["data-market-coin"],
		})),
		...findAll(ticker, (element) => hasAttr("data-live-card")(element) || hasAttr("data-live-mirror")(element)).map((element) => ({
			element,
			coin: element.attrs["data-live-card"] ?? element.attrs["data-live-mirror"],
		})),
	];
}

function distPath(src) {
	return resolve(DIST, decodeURIComponent(src.replace(/^\//, "")));
}

test("every rendered market row and card has exactly one decorative icon for its own market", () => {
	const entries = marketEntries();
	assert.ok(entries.length >= 40, `found only ${entries.length} market rows and cards`);
	const seen = new Set();
	for (const { element, coin } of entries) {
		const icons = findAll(element, hasAttr("data-market-icon"));
		assert.equal(icons.length, 1, `${coin}: ${icons.length} icons`);
		const [icon] = icons;
		seen.add(coin);
		assert.equal(icon.attrs["data-market-icon"], coin);
		assert.equal(icon.attrs["aria-hidden"], "true", `${coin}: the icon is decorative`);
		assert.match(icon.attrs.class ?? "", /\brounded-full\b/);
		assert.match(icon.attrs.class ?? "", /\boutline-stroke-weak\b/, `${coin}: the icon has the hairline ring`);
		if (icon.name === "img") {
			assert.ok(ICON_COINS.has(coin), `${coin} renders an image but the manifest records a fallback`);
			assert.equal(icon.attrs.alt, "", `${coin}: empty alt, the name is next to it`);
			assert.ok(SIZES.has(icon.attrs.width) && icon.attrs.width === icon.attrs.height, `${coin}: explicit square size`);
			assert.equal(icon.attrs.decoding, "async");
			assert.match(icon.attrs.src, /^\/_astro\/[A-Za-z0-9_.-]+\.svg$/, `${coin}: a hashed local asset`);
			assert.ok(existsSync(distPath(icon.attrs.src)), `${coin}: ${icon.attrs.src} is not in dist`);
			assert.deepEqual(findSvgProblems(readFileSync(distPath(icon.attrs.src), "utf8")), [], icon.attrs.src);
			assert.equal(hasAttr("data-market-icon-backplate")(icon), BACKPLATE_COINS.has(coin), `${coin}: the backplate follows the manifest`);
		} else {
			assert.equal(icon.name, "span", `${coin}: an icon is an <img> or the monogram <span>`);
			assert.ok(FALLBACK_COINS.has(coin), `${coin} shows a monogram but the manifest records no fallback`);
			assert.ok(hasAttr("data-market-icon-fallback")(icon));
			assert.equal(icon.attrs["data-monogram"], marketMonogram(coin));
			assert.deepEqual(icon.children, [], `${coin}: the monogram is drawn by CSS, not text in the link`);
		}
	}
	for (const coin of getRenderedMarketCoins()) assert.ok(seen.has(coin), `${coin} is rendered without an icon row or card`);
});

test("no image on the site loads from another host", () => {
	let checked = 0;
	for (const page of PAGES) {
		const document = parseHtml(readFileSync(resolve(DIST, page), "utf8"));
		for (const element of findAll(document, (node) => ["img", "source", "image"].includes(node.name))) {
			const urls = [element.attrs.src, ...(element.attrs.srcset ?? "").split(",").map((entry) => entry.trim().split(/\s+/)[0])]
				.concat(element.attrs.href, element.attrs["xlink:href"])
				.filter(Boolean);
			for (const url of urls) {
				checked += 1;
				// An inlined data: URI (the brand logo) is part of the page itself; every other scheme or `//` is a host.
				if (/^data:image\//i.test(url)) continue;
				assert.doesNotMatch(url, /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i, `${page}: ${element.name} loads ${url.slice(0, 80)}`);
				assert.ok(existsSync(distPath(url.split(/[?#]/)[0])), `${page}: ${url} is not in dist`);
			}
		}
	}
	assert.ok(checked > 0);
	assert.equal(findAll(HOME, byName("img")).filter(hasAttr("data-market-icon")).length > 0, true);
});
