import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOT = resolve(WEBSITE_ROOT, "src");
const TEXT_EXTENSIONS = new Set([".astro", ".ts", ".js", ".mjs", ".md", ".mdx", ".json", ".css"]);
const SOURCES = listFiles(SOURCE_ROOT)
	.filter((file) => TEXT_EXTENSIONS.has(extname(file)))
	.map((file) => ({ file: relative(WEBSITE_ROOT, file), text: readFileSync(file, "utf8") }));

const RETIRED_HERO_IMAGES = ["app-desktop.jpeg", "app-mobile.jpeg"];

// The repository is private and unlicensed, and the Terms forbid copying or redistributing the
// interface, so the site must not describe it as open, forkable or self-hostable.
const FORBIDDEN_CLAIMS = [
	{ pattern: /open[\s-]?source/i, reason: "the terminal is not open source" },
	{ pattern: /\bMIT\b/, reason: "the repository has no MIT licence" },
	{ pattern: /\bfork(s|ed|ing)?\b/i, reason: "the Terms forbid copying and modifying the interface" },
	{ pattern: /self[\s-]?host/i, reason: "the terminal is not distributed for self-hosting" },
	{ pattern: /run it yourself/i, reason: "the terminal is not distributed for self-hosting" },
	{ pattern: /public\s+repo/i, reason: "the repository is private" },
	{ pattern: /code is public/i, reason: "the repository is private" },
	{ pattern: /read the client/i, reason: "the client source is not published" },
	{
		pattern: /\b\d+\s*[×x]\s*(max|leverage)|up to \d+\s*[×x]|\b50\s*[×x]/i,
		reason: "Hyperliquid's maximum leverage is per market and changes; do not hard-code a maximum",
	},
	{
		pattern: /builder fee[^.]{0,40}\bevery (order|fill|trade)|every (order|fill|trade)[^.]{0,40}builder fee/i,
		reason: "the builder fee applies to perp orders and spot sells, not TWAP orders or spot buys",
	},
	{
		pattern: /\b1\s*[–-]\s*50\b/,
		reason: "Hyperliquid's maximum leverage is per market and changes; do not hard-code 1–50×",
	},
	{ pattern: /19\+\s*(EVM|chains|networks)/i, reason: "deposits use Circle CCTP from Arbitrum, not 19+ chains" },
	{ pattern: /\bLi\.?Fi\b/i, reason: "the LI.FI route is off by default; deposits use Circle CCTP" },
	{ pattern: /no (accounts|signup|sign-up|email)\b/i, reason: "email sign-in creates an embedded wallet account" },
	{
		pattern: /no backend|no servers/i,
		reason: "region checks, error reports and the leaderboard run on our edge service",
	},
	{
		pattern: /nowhere on our side/i,
		reason: "some data reaches our edge service and providers; see the Privacy Policy",
	},
];

test("website copy makes no retired product claims", () => {
	assert.ok(SOURCES.length > 10, "expected to scan the website sources");
	const violations = [];
	for (const { file, text } of SOURCES) {
		for (const { pattern, reason } of FORBIDDEN_CLAIMS) {
			const match = pattern.exec(text);
			if (match) violations.push(`${file}: "${match[0]}" (${reason})`);
		}
	}
	assert.deepEqual(violations, []);
});

test("website discloses the builder fee wherever it quotes trading fees", () => {
	const fees = readSource("src/components/Fees.astro");
	const faq = readSource("src/config/faq.ts");
	assert.match(fees, /0\.01% builder fee/);
	assert.match(faq, /0\.01% builder fee/);
});

test("hero screenshots are imported assets with hashed URLs, never public files", () => {
	const hero = readSource("src/components/Hero.astro");
	const imports = [...hero.matchAll(/^import (\w+) from "@\/assets\/([\w-]+\.(?:jpe?g|png|webp|avif))";$/gm)];
	assert.equal(imports.length, 2, "Hero.astro imports a desktop and a mobile screenshot from src/assets");
	for (const [, binding, file] of imports) {
		assert.ok(existsSync(resolve(SOURCE_ROOT, "assets", file)), `missing src/assets/${file}`);
		assert.match(hero, new RegExp(`\\{${binding}\\.src\\}`), `${binding} must be rendered through its hashed .src`);
		assert.match(hero, new RegExp(`\\{${binding}\\.width\\}`), `${binding} must carry its intrinsic width`);
		assert.match(hero, new RegExp(`\\{${binding}\\.height\\}`), `${binding} must carry its intrinsic height`);
	}
	assert.doesNotMatch(
		hero,
		/src(set)?="\/[^"]+\.(jpe?g|png|webp|avif)"/,
		"hero images must not use a fixed public URL",
	);
	assert.match(hero, /<picture>[\s\S]*<source[\s\S]*media="\(min-width: 640px\)"[\s\S]*<img[\s\S]*<\/picture>/);

	for (const retired of RETIRED_HERO_IMAGES) {
		assert.equal(existsSync(resolve(WEBSITE_ROOT, "public", retired)), false, `public/${retired} must stay deleted`);
		for (const { file, text } of SOURCES) {
			assert.equal(text.includes(retired), false, `${file} references the retired ${retired}`);
		}
	}
});

test("hero screenshots keep the captured viewport proportions", () => {
	const desktop = jpegSize(resolve(SOURCE_ROOT, "assets/terminal-desktop.jpeg"));
	const mobile = jpegSize(resolve(SOURCE_ROOT, "assets/terminal-mobile.jpeg"));
	assert.deepEqual(desktop, { width: 1600, height: 900 });
	assert.equal(mobile.width * 844, mobile.height * 390, "mobile screenshot is a 390 × 844 viewport");
	assert.ok(mobile.width >= 390, "mobile screenshot is at least one CSS pixel per device pixel");
});

function readSource(path) {
	return readFileSync(resolve(WEBSITE_ROOT, path), "utf8");
}

function listFiles(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		return entry.isDirectory() ? listFiles(path) : [path];
	});
}

function jpegSize(path) {
	const bytes = readFileSync(path);
	assert.equal(bytes.readUInt16BE(0), 0xffd8, `${path} is not a JPEG`);
	let offset = 2;
	while (offset < bytes.length) {
		const marker = bytes.readUInt16BE(offset);
		const length = bytes.readUInt16BE(offset + 2);
		if (marker >= 0xffc0 && marker <= 0xffcf && ![0xffc4, 0xffc8, 0xffcc].includes(marker)) {
			return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
		}
		offset += 2 + length;
	}
	throw new Error(`${path} has no frame header`);
}
