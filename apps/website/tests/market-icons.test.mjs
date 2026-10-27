// Market icons: the file-name mapping, the SVG sanitizer, the fetch outcomes and every committed icon
// (scripts/market-icons.mjs, src/assets/coins/, src/data/market-icons.json).

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import manifest from "../src/data/market-icons.json" with { type: "json" };
import {
	coinOfMarketIconFileName,
	MARKET_ICON_SOURCE_BASE_URL,
	marketIconFileName,
	marketIconSourceUrl,
	marketMonogram,
} from "../src/lib/markets/icons.ts";
import { getRenderedMarketCoins } from "../src/lib/markets/structure.ts";
import {
	assertDistinctFileNames,
	BACKPLATE_MIN_TRANSPARENT_SHARE,
	BACKPLATE_OVERRIDES,
	backplateFor,
	fetchMarketIcon,
	floatPrecisionFor,
	ICON_BYTES_BUDGET,
	ICON_BYTES_EXCEPTIONS,
	ICON_DIRECTORY,
	ICON_TOTAL_BYTES_BUDGET,
	iconToolsAvailable,
	measureMarketIcon,
	needsBackplate,
	optimizeMarketIcon,
	RASTER_MAX_PX,
} from "../scripts/market-icons.mjs";
import { findSvgProblems, sanitizeSvg } from "../scripts/svg-sanitize.mjs";

const TERMINAL_APP_CONFIG = new URL("../../terminal/src/config/app.ts", import.meta.url);
const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">';
const PNG_DATA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
// Independent of the sanitizer's parser: text no committed icon may contain.
const FORBIDDEN_TEXT = [
	/<script/i,
	/<foreignObject/i,
	/<iframe|<embed|<object/i,
	/\son[a-z]+\s*=/i,
	/href\s*=\s*["']\s*(?:https?:|\/\/|javascript:)/i,
	/@import/i,
	/url\(\s*['"]?\s*(?:https?:|\/\/|data:)/i,
	/javascript:/i,
	/<!DOCTYPE|<!ENTITY|<!--|<\?xml/i,
];

function svgResponse(body, { status = 200, type = "image/svg+xml" } = {}) {
	return async () => new Response(body, { status, headers: { "content-type": type } });
}

test("the icon source is the one the terminal uses", () => {
	const terminal = readFileSync(TERMINAL_APP_CONFIG, "utf8").match(/TOKEN_ICON_BASE_URL = "([^"]+)"/)?.[1];
	assert.equal(MARKET_ICON_SOURCE_BASE_URL, terminal);
	assert.equal(marketIconSourceUrl("BTC"), "https://app.hyperliquid.xyz/coins/BTC.svg");
	assert.equal(marketIconSourceUrl("xyz:NVDA"), "https://app.hyperliquid.xyz/coins/xyz:NVDA.svg");
});

test("coins map to file names that are safe on every filesystem, and back", () => {
	const cases = { BTC: "BTC.svg", kPEPE: "kPEPE.svg", "xyz:NVDA": "xyz--NVDA.svg", "io:OAI": "io--OAI.svg", "para:10Y": "para--10Y.svg" };
	for (const [coin, file] of Object.entries(cases)) {
		assert.equal(marketIconFileName(coin), file);
		assert.equal(coinOfMarketIconFileName(file), coin);
		assert.match(file, /^[A-Za-z0-9-]+\.svg$/);
	}
	for (const coin of ["", "../BTC", "xyz/NVDA", "a:b:c", "XYZ:NVDA", "@107", "BTC.svg", "BTC USDC"]) {
		assert.throws(() => marketIconFileName(coin), /not a perp coin name/, coin);
		assert.throws(() => marketIconSourceUrl(coin), /not a perp coin name/, coin);
	}
	for (const name of ["BTC.png", "xyz:NVDA.svg", "x--y--z.svg", ".svg", "README.md"]) assert.equal(coinOfMarketIconFileName(name), undefined, name);
	assert.throws(() => assertDistinctFileNames(["xyz:ABC", "xyz:abc"]), /same file name/);
	assert.doesNotThrow(() => assertDistinctFileNames(getRenderedMarketCoins()));
});

test("the monogram is up to two characters of the ticker without its dex", () => {
	assert.equal(marketMonogram("BTC"), "BT");
	assert.equal(marketMonogram("para:10Y"), "10");
	assert.equal(marketMonogram("para:2Y"), "2Y");
	assert.equal(marketMonogram("mkts:USTECH"), "US");
	assert.equal(marketMonogram("kPEPE"), "KP");
});

test("the sanitizer removes scripts, handlers, foreign content and external references", () => {
	const hostile = `<?xml version="1.0"?><!-- c --><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" viewBox="0 0 10 10" onload="alert(1)" data-name="x">
		<title>Icon</title><metadata>m</metadata><sodipodi:namedview/>
		<script>alert(1)</script>
		<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
		<a href="https://example.com"><path d="M0 0h1v1z"/></a>
		<image href="https://example.com/x.png" width="1" height="1"/>
		<image xlink:href="${PNG_DATA}" width="1" height="1"/>
		<use xlink:href="#p" onclick="x()"/>
		<use href="http://example.com/s.svg#p"/>
		<path id="p" d="M0 0h10v10z" fill="#000"/>
	</svg>`;
	const found = findSvgProblems(hostile).join("\n");
	for (const expected of ["<svg onload> event handler", "element <script>", "element <foreignObject>", "element <a>", "<image href> https://example.com/x.png", "<use onclick> event handler", "<use href> http://example.com"]) {
		assert.ok(found.includes(expected), `the checker reports ${expected}`);
	}
	const { svg, removed } = sanitizeSvg(hostile);
	assert.deepEqual(findSvgProblems(svg), []);
	for (const pattern of FORBIDDEN_TEXT) assert.doesNotMatch(svg, pattern);
	assert.doesNotMatch(svg, /title|metadata|sodipodi|data-name|example\.com/);
	assert.match(svg, /data:image\/png;base64/, "an embedded raster stays");
	assert.match(svg, /<use xlink:href="#p"\/>/, "a fragment reference stays");
	assert.match(svg, /<path id="p" d="M0 0h10v10z" fill="#000"\/>/, "drawing is left as drawn");
	for (const expected of ["<script>", "<foreignObject>", "<a>", "onload", "onclick"]) {
		assert.ok(removed.some((entry) => entry.includes(expected)), `reports ${expected}`);
	}
	assert.equal(sanitizeSvg(svg).svg, svg, "sanitizing is idempotent");
});

test("the sanitizer refuses what it cannot make safe or does not understand", () => {
	assert.throws(() => sanitizeSvg("<svg"), /not well-formed/);
	assert.throws(() => sanitizeSvg("<html><body/></html>"), /root element is not <svg>/);
	assert.throws(() => sanitizeSvg(`${SVG_OPEN}<text>A</text></svg>`), /outside the allowlist/);
	assert.throws(() => sanitizeSvg(`${SVG_OPEN}<style>@import url(https://x/y.css);</style></svg>`), /still unsafe.*@import/);
	assert.throws(() => sanitizeSvg(`${SVG_OPEN}<rect width="1" height="1" style="fill:url(https://x/y)"/></svg>`), /still unsafe/);
	assert.throws(() => sanitizeSvg(`${SVG_OPEN}<rect width="1" height="1" fill="url(http://x/#g)"/></svg>`), /still unsafe/);
	assert.throws(() => sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em"/>'), /no viewBox/);
	assert.throws(() => sanitizeSvg(`${SVG_OPEN}${"<g/>".repeat(70_000)}</svg>`), /larger than/);
	assert.match(sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"/>').svg, /viewBox="0 0 56 56"/);
	assert.deepEqual(findSvgProblems(`${SVG_OPEN}<style>.a{fill:url(#g)}</style><rect class="a" fill="url(#g)" width="1" height="1"/></svg>`), []);
	assert.ok(findSvgProblems(`${SVG_OPEN}<image href="data:image/svg+xml;base64,PHN2Zz4=" width="1" height="1"/></svg>`).length > 0);
});

test("a missing icon becomes a monogram fallback; an unreachable source fails the run", async () => {
	assert.deepEqual(await fetchMarketIcon("xyz:NATGAS", svgResponse("<!doctype html>", { type: "text/html; charset=utf-8" })), {
		reason: "no icon (served text/html)",
	});
	assert.deepEqual(await fetchMarketIcon("BTC", svgResponse("", { status: 404, type: "text/plain" })), { reason: "HTTP 404" });
	assert.match((await fetchMarketIcon("BTC", svgResponse(`${SVG_OPEN}<text/></svg>`))).reason, /^rejected: /);
	const cleaned = await fetchMarketIcon("BTC", svgResponse(`${SVG_OPEN}<script>x</script><rect width="1" height="1"/></svg>`));
	assert.deepEqual(cleaned.removed, ["<script>"]);
	await assert.rejects(fetchMarketIcon("BTC", svgResponse("", { status: 503 })), /HTTP 503/);
	await assert.rejects(
		fetchMarketIcon("BTC", async () => {
			throw new TypeError("fetch failed");
		}),
		/fetch failed/,
	);
});

test("every rendered market has exactly one icon or a recorded fallback, from the recorded source", () => {
	const rendered = getRenderedMarketCoins();
	const recorded = [...manifest.icons.map((icon) => icon.coin), ...manifest.fallbacks.map((fallback) => fallback.coin)];
	assert.deepEqual([...recorded].sort(), [...rendered].sort(), "run `pnpm --filter @sairn/website markets:icons`");
	assert.equal(new Set(recorded).size, recorded.length);
	assert.ok(!Number.isNaN(Date.parse(manifest.fetchedAt)) && manifest.fetchedAt.endsWith("Z"));
	assert.ok(manifest.source.includes(MARKET_ICON_SOURCE_BASE_URL));
	for (const entry of [...manifest.icons, ...manifest.fallbacks]) assert.equal(entry.sourceUrl, marketIconSourceUrl(entry.coin));
	for (const fallback of manifest.fallbacks) assert.ok(fallback.reason.length > 0);
	for (const icon of manifest.icons) assert.equal(icon.file, marketIconFileName(icon.coin));

	const files = readdirSync(ICON_DIRECTORY).filter((name) => !name.startsWith("."));
	assert.deepEqual([...files].sort(), manifest.icons.map((icon) => icon.file).sort(), "src/assets/coins holds exactly the recorded icons");
});

test("every committed icon is a clean, sanitized SVG", () => {
	for (const icon of manifest.icons) {
		const source = readFileSync(resolve(ICON_DIRECTORY, icon.file), "utf8");
		assert.deepEqual(findSvgProblems(source), [], icon.file);
		for (const pattern of FORBIDDEN_TEXT) assert.doesNotMatch(source, pattern, `${icon.file} contains ${pattern}`);
		assert.equal(sanitizeSvg(source).svg, source, `${icon.file} is not the sanitizer's output`);
		assert.equal(Buffer.byteLength(source, "utf8"), icon.bytes, `${icon.file} differs from the recorded size`);
	}
});

const TOOLS_SKIP = iconToolsAvailable() ? false : "sharp and svgo are not in the pnpm virtual store; run pnpm install";
const MARKET_ICON_COMPONENT = new URL("../src/components/MarketIcon.astro", import.meta.url);
const WEBSITE_STYLES = new URL("../src/styles/global.css", import.meta.url);

function readIcon(icon) {
	return readFileSync(resolve(ICON_DIRECTORY, icon.file), "utf8");
}

/** Width and height of every embedded raster, read from its PNG header; any other raster format is reported. */
function embeddedRasters(svg) {
	return [...svg.matchAll(/data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)/g)].map(([, type, base64]) => {
		const bytes = Buffer.from(base64, "base64");
		if (type !== "png" || bytes.toString("latin1", 12, 16) !== "IHDR") return { type };
		return { type, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length };
	});
}

test("every committed icon fits its byte budget, and the set fits the total budget", () => {
	let total = 0;
	for (const icon of manifest.icons) {
		const bytes = Buffer.byteLength(readIcon(icon), "utf8");
		total += bytes;
		const exception = ICON_BYTES_EXCEPTIONS[icon.file];
		if (exception) assert.ok(exception.reason && bytes <= exception.maxBytes, `${icon.file}: ${bytes} B over its recorded exception`);
		else assert.ok(bytes <= ICON_BYTES_BUDGET, `${icon.file}: ${bytes} B over the ${ICON_BYTES_BUDGET} B budget; run markets:icons --reprocess`);
	}
	for (const file of Object.keys(ICON_BYTES_EXCEPTIONS)) {
		assert.ok(manifest.icons.some((icon) => icon.file === file), `exception for ${file}, which is not committed`);
	}
	assert.ok(total <= ICON_TOTAL_BYTES_BUDGET, `src/assets/coins holds ${total} B, over ${ICON_TOTAL_BYTES_BUDGET} B`);
});

test("embedded rasters are PNGs no larger than twice the largest display size", () => {
	assert.equal(RASTER_MAX_PX, 56);
	for (const icon of manifest.icons) {
		for (const raster of embeddedRasters(readIcon(icon))) {
			assert.equal(raster.type, "png", `${icon.file}: embedded ${raster.type}, the optimizer writes PNG`);
			assert.ok(raster.width > 0 && raster.height > 0, `${icon.file}: unreadable PNG header`);
			assert.ok(Math.max(raster.width, raster.height) <= RASTER_MAX_PX, `${icon.file}: ${raster.width}×${raster.height} raster`);
		}
	}
});

test("rounding keeps path coordinates within a two-hundredth of a pixel at twice the display size", () => {
	assert.equal(floatPrecisionFor(56), 3);
	assert.equal(floatPrecisionFor(827), 2);
	assert.equal(floatPrecisionFor(1200), 1);
	assert.equal(floatPrecisionFor(100_000), 0);
});

test("the backplate rule: a mostly transparent mark with less ink on the dark window than on white", () => {
	assert.equal(needsBackplate({ transparentShare: 0.79, inkOnDark: 0.06, inkOnWhite: 0.2 }), true, "dark mark on transparent");
	assert.equal(needsBackplate({ transparentShare: 0.45, inkOnDark: 0.56, inkOnWhite: 0 }), false, "light mark on transparent");
	assert.equal(needsBackplate({ transparentShare: 0, inkOnDark: 0.05, inkOnWhite: 0.96 }), false, "opaque disc: a backplate changes nothing");
	assert.equal(needsBackplate({ transparentShare: BACKPLATE_MIN_TRANSPARENT_SHARE, inkOnDark: 0, inkOnWhite: 0.2 }), true);
	for (const [coin, override] of Object.entries(BACKPLATE_OVERRIDES)) {
		assert.equal(typeof override.backplate, "boolean", coin);
		assert.ok(override.reason, `${coin}: an override needs a reason`);
		assert.ok(manifest.icons.some((icon) => icon.coin === coin), `override for ${coin}, which has no committed icon`);
	}
});

test("the manifest records each icon's measurement and the decision the rule makes from it", () => {
	assert.equal(manifest.schemaVersion, 2);
	for (const icon of manifest.icons) {
		assert.equal(typeof icon.backplate, "boolean", icon.coin);
		for (const key of ["transparentShare", "inkOnDark", "inkOnWhite"]) {
			const value = icon.surface?.[key];
			assert.ok(typeof value === "number" && value >= 0 && value <= 1, `${icon.coin}: surface.${key}`);
		}
		assert.equal(icon.backplate, backplateFor(icon.coin, icon.surface), `${icon.coin}: backplate differs from the rule`);
	}
	const flagged = manifest.icons.filter((icon) => icon.backplate).map((icon) => icon.coin).sort();
	assert.deepEqual(flagged, ["ETH", "NEAR", "io:ANTH"], "the dark marks measured on 2026-10-27; update after a review of the renders");
});

test("the recorded measurements match the committed files", { skip: TOOLS_SKIP }, async () => {
	for (const icon of manifest.icons) {
		const measured = await measureMarketIcon(readIcon(icon));
		for (const key of ["transparentShare", "inkOnDark", "inkOnWhite"]) {
			assert.ok(Math.abs(measured[key] - icon.surface[key]) <= 0.02, `${icon.file}: ${key} ${measured[key]} vs ${icon.surface[key]}`);
		}
	}
});

test("the optimizer downscales an embedded raster and keeps the file sanitized", { skip: TOOLS_SKIP }, async () => {
	const { createRequire } = await import("node:module");
	const sharpEntry = new URL("../../../node_modules/.pnpm/node_modules/sharp/package.json", import.meta.url);
	const sharp = createRequire(sharpEntry)("sharp");
	const png = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#c00" } }).png().toBuffer();
	const source = `${SVG_OPEN}<image width="10" height="5" preserveAspectRatio="none" xlink:href="data:image/png;base64,${png.toString("base64")}"/><path d="M0.123456 0.123456H9.87654V9.87654z" fill="#000"/></svg>\n`;
	const optimized = await optimizeMarketIcon(sanitizeSvg(source).svg);
	assert.deepEqual(findSvgProblems(optimized), []);
	assert.equal(sanitizeSvg(optimized).svg, optimized, "the optimizer's output is the sanitizer's output");
	const [raster] = embeddedRasters(optimized);
	assert.deepEqual([raster.type, raster.width, raster.height], ["png", 56, 28]);
	assert.match(optimized, /viewBox="0 0 10 10"/, "the viewBox stays");
	assert.ok(optimized.length < source.length);
});

test("MarketIcon draws the backplate from the manifest through the shared token", () => {
	const component = readFileSync(MARKET_ICON_COMPONENT, "utf8");
	assert.match(component, /^import manifest from "@\/data\/market-icons\.json";$/m);
	assert.match(component, /filter\(\(entry\) => entry\.backplate\)/);
	assert.match(component, /data-market-icon-backplate=\{BACKPLATE_COINS\.has\(coin\) \? "" : undefined\}/);
	const styles = readFileSync(WEBSITE_STYLES, "utf8");
	assert.match(styles, /:root \{\s*--market-icon-backplate: #ffffff;\s*\}/, "one backplate colour for both themes");
	assert.match(styles, /\[data-market-icon-backplate\] \{\s*background-color: var\(--market-icon-backplate\);\s*\}/);
	assert.doesNotMatch(component, /invert|filter:|hue-rotate/, "the mark's own colours are never changed");
});
