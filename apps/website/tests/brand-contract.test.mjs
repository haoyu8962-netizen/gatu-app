import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEBSITE_STYLES = readFileSync(resolve(WEBSITE_ROOT, "src/styles/global.css"), "utf8");
const WEBSITE_HERO = readFileSync(resolve(WEBSITE_ROOT, "src/components/Hero.astro"), "utf8");
const WEBSITE_MARKETS = readFileSync(resolve(WEBSITE_ROOT, "src/components/Markets.astro"), "utf8");

test("website uses the brand action, signal and focus roles", () => {
	assert.equal(readCssVariable(WEBSITE_STYLES, ":root", "--action"), "#edeef2");
	assert.equal(readCssVariable(WEBSITE_STYLES, ":root", "--signal"), "#86e5d3");
	assert.equal(readCssVariable(WEBSITE_STYLES, ":root", "--focus"), "var(--signal)");
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

test("website faint text remains WCAG AA on every supported dark surface", () => {
	const foreground = readCssVariable(WEBSITE_STYLES, ":root", "--text-faint");
	for (const surfaceVariable of ["--bg-base", "--bg-raised", "--bg-overlay", "--bg-sunken"]) {
		const surface = readCssVariable(WEBSITE_STYLES, ":root", surfaceVariable);
		assert.ok(
			contrastRatio(compositeHex(foreground, surface), surface) >= 4.5,
			`${foreground} must remain AA on ${surfaceVariable} (${surface})`,
		);
	}
});

test("website renders the logo kit's on-dark lockup and mark from brand/ instead of public copies", () => {
	const logo = readFileSync(resolve(WEBSITE_ROOT, "src/components/Logo.astro"), "utf8");
	const base = readFileSync(resolve(WEBSITE_ROOT, "src/layouts/Base.astro"), "utf8");
	const seo = readFileSync(resolve(WEBSITE_ROOT, "src/config/seo.ts"), "utf8");

	assert.match(logo, /from "\.\.\/\.\.\/\.\.\/\.\.\/brand\/svg\/lockup\/sairn-lockup-on-dark\.svg\?url"/);
	assert.match(logo, /from "\.\.\/\.\.\/\.\.\/\.\.\/brand\/svg\/mark\/sairn-mark-on-dark\.svg\?url"/);
	assert.match(base, /from "\.\.\/\.\.\/\.\.\/\.\.\/brand\/web\/favicon\.svg\?url"/);
	assert.match(seo, /from "\.\.\/\.\.\/\.\.\/\.\.\/brand\/social\/sairn-avatar-light-1024\.png\?url"/);
	for (const retired of ["logo.svg", "logo-mark.svg", "gatu-logo-1024.png", "favicon.svg"]) {
		assert.equal(existsSync(resolve(WEBSITE_ROOT, "public", retired)), false, `public/${retired} must not shadow the brand source`);
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

function compositeHex(foreground, background) {
	const foregroundChannels = parseHex(foreground);
	const backgroundChannels = parseHex(background);
	const alpha = foregroundChannels[3];
	return foregroundChannels.slice(0, 3).map((channel, index) =>
		Math.round(channel * alpha + backgroundChannels[index] * (1 - alpha)),
	);
}

function contrastRatio(foreground, background) {
	const foregroundLuminance = relativeLuminance(foreground);
	const backgroundLuminance = relativeLuminance(parseHex(background).slice(0, 3));
	return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
		(Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

function parseHex(hex) {
	assert.match(hex, /^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
	const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
	return [...channels, hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) / 255 : 1];
}

function relativeLuminance(channels) {
	const [red, green, blue] = channels.map((channel) => {
		const normalized = channel / 255;
		return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
