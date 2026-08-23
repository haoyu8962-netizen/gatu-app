import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEBSITE_STYLES = readFileSync(resolve(WEBSITE_ROOT, "src/styles/global.css"), "utf8");
const WEBSITE_HERO = readFileSync(resolve(WEBSITE_ROOT, "src/components/Hero.astro"), "utf8");
const WEBSITE_MARKETS = readFileSync(resolve(WEBSITE_ROOT, "src/components/Markets.astro"), "utf8");

test("website uses the GATU action, signal, focus, and logo roles", () => {
	assert.equal(readCssVariable(WEBSITE_STYLES, ":root", "--action"), "#edeef2");
	assert.equal(readCssVariable(WEBSITE_STYLES, ":root", "--signal"), "#d7ff3f");
	assert.equal(readCssVariable(WEBSITE_STYLES, ":root", "--focus"), "var(--signal)");
	assert.equal(readCssVariable(WEBSITE_STYLES, ":root", "--logo-ink"), "#edeef2");
	assert.equal(readCssVariable(WEBSITE_STYLES, ":root", "--logo-node"), "#d7ff3f");
	assert.match(WEBSITE_HERO, /bg-action/);
	assert.match(WEBSITE_HERO, /text-on-action/);
	assert.match(WEBSITE_HERO, /text-signal/);
	assert.match(WEBSITE_MARKETS, /text-signal/);
});

test("website does not restore legacy blue gradients or glow treatments", () => {
	const sources = `${WEBSITE_STYLES}\n${WEBSITE_HERO}\n${WEBSITE_MARKETS}`.toLowerCase();
	for (const legacyTreatment of ["#26d2ec", "#46f0de", "#2e86f5", "glow-radial", "text-brand-gradient"]) {
		assert.equal(sources.includes(legacyTreatment), false, `found legacy treatment: ${legacyTreatment}`);
	}
});

test("website ships its declared large social card", () => {
	const image = readFileSync(resolve(WEBSITE_ROOT, "public/og-website-1200x630.png"));
	assert.equal(image.toString("ascii", 12, 16), "IHDR");
	assert.equal(image.readUInt32BE(16), 1200);
	assert.equal(image.readUInt32BE(20), 630);
});

function readCssVariable(source, selector, variable) {
	const selectorStart = source.indexOf(`${selector} {`);
	assert.notEqual(selectorStart, -1, `missing selector: ${selector}`);

	const blockStart = source.indexOf("{", selectorStart);
	const blockEnd = source.indexOf("}", blockStart);
	assert.notEqual(blockStart, -1, `missing block start: ${selector}`);
	assert.notEqual(blockEnd, -1, `missing block end: ${selector}`);

	const declaration = new RegExp(`${variable}:\\s*([^;]+);`).exec(source.slice(blockStart + 1, blockEnd));
	assert.ok(declaration?.[1], `missing variable: ${selector} ${variable}`);
	return declaration[1].trim();
}
