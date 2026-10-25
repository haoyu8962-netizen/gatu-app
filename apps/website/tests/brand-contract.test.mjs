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

// Plan §6 anti-impersonation rule: every site colour token stays at least ΔE76 15 away from Hyperliquid's
// brand colours. Near-black neutrals (L* ≤ 25 and chroma ≤ 10 after compositing over --bg-base) are exempt,
// as the plan allows. A pending exception waits for an operator decision and must still be below the limit,
// so a fixed or renamed token fails until it is removed from the list.
const HYPERLIQUID_COLORS = ["#97fce3", "#03211c", "#23524c"];
const MIN_DELTA_E = 15;
const PENDING_DELTA_E_EXCEPTIONS = {
	"--signal": "brand.json accent (ADR 0028), shared with the terminal; ΔE 8.5 from #97fce3. Plan §6 keeps it for focus, links and the logo; changing it is a brand decision",
	"--signal-hover": "hover step of the same brand accent; ΔE 11.7 from #97fce3",
};

test("website colour tokens keep their distance from Hyperliquid's brand colours (plan §6)", () => {
	const base = parseHex(readCssVariable(WEBSITE_STYLES, ":root", "--bg-base"));
	const tokens = readRootColorTokens(WEBSITE_STYLES);
	assert.ok(tokens.length >= 25, `expected the site's colour tokens, found ${tokens.length}`);
	const tooClose = [];
	for (const { name, channels } of tokens) {
		const composited = channels.slice(0, 3).map((channel, index) => channel * channels[3] + base[index] * (1 - channels[3]));
		const lab = toLab(composited);
		if (lab[0] <= 25 && Math.hypot(lab[1], lab[2]) <= 10) continue;
		const nearest = Math.min(...HYPERLIQUID_COLORS.map((color) => deltaE76(lab, toLab(parseHex(color).slice(0, 3)))));
		if (nearest < MIN_DELTA_E) tooClose.push(name);
	}
	assert.deepEqual(tooClose.sort(), Object.keys(PENDING_DELTA_E_EXCEPTIONS).sort());
	assert.ok(deltaE76(toLab([0x86, 0xe5, 0xd3]), toLab([0x97, 0xfc, 0xe3])) < MIN_DELTA_E, "the check measures what the plan means");
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

function readRootColorTokens(source) {
	const start = source.indexOf(":root {");
	const block = source.slice(source.indexOf("{", start) + 1, source.indexOf("}", start));
	const tokens = [];
	for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
		if (value.startsWith("var(")) continue;
		const rgb = /^rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)$/.exec(value);
		if (rgb) tokens.push({ name, channels: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4]) / 100] });
		else if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) tokens.push({ name, channels: parseHex(value) });
		else assert.fail(`${name}: ${value} is a colour form the distance check cannot read`);
	}
	return tokens;
}

function toLab(channels) {
	const [red, green, blue] = channels.map((channel) => {
		const normalized = channel / 255;
		return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
	});
	const x = (0.4124564 * red + 0.3575761 * green + 0.1804375 * blue) / 0.95047;
	const y = 0.2126729 * red + 0.7151522 * green + 0.072175 * blue;
	const z = (0.0193339 * red + 0.119192 * green + 0.9503041 * blue) / 1.08883;
	const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
	return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deltaE76(a, b) {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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
