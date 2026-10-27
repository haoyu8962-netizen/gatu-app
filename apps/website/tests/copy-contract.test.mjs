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
const BRAND = JSON.parse(readFileSync(resolve(WEBSITE_ROOT, "../../brand/brand.json"), "utf8"));
const SNAPSHOT = JSON.parse(readFileSync(resolve(SOURCE_ROOT, "data/market-structure.json"), "utf8"));

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

// Product-fact rules of docs/website-plan.md §9, by rule number.
const PLAN_RULES = [
	{ rule: "R2", pattern: /\bnot (?:a )?securit(?:y|ies)\b/i, reason: "say the contracts are not shares, not a legal classification" },
	{ rule: "R2", pattern: /\binvest(?:s|ing)? in\b/i, reason: "a perpetual is not an investment in the company" },
	{ rule: "R2", pattern: /\bown (?:the|a|shares)\b/i, reason: "these contracts give no ownership" },
	{ rule: "R2", pattern: /\bbuy(?:s|ing)?\s+(?:[\w$.&'-]+\s+){0,2}stocks?\b/i, reason: "no stock is bought" },
	{ rule: "R3", pattern: /\bmarket[\s-]?cap(?:s|italization)?\b/i, reason: "a figure derived from the price is an implied valuation" },
	{ rule: "R5", pattern: /\b(?:full|max|maximum) leverage\b/i, reason: "leverage limits are per market and change" },
	{ rule: "R5", pattern: /\bleverage multiplier\b/i, reason: "call leverage leverage" },
	{ rule: "R5", pattern: /\b(?:same|shared) margin\b/i, reason: "most HIP-3 markets allow isolated margin only" },
	{ rule: "R9", pattern: /\byour (?:own )?keys\b/i, reason: "name the signer for each sign-in method" },
	{ rule: "R9", pattern: /\bsign(?:s|ed|ing)? locally\b/i, reason: "name the signer for each sign-in method" },
	{ rule: "R12", pattern: /\bno[\s-]?KYC\b/i, reason: "card funding goes through a third party's KYC" },
	{ rule: "R12", pattern: /\bVPNs?\b/i, reason: "Terms §2.3 forbid getting around the restrictions; never a selling point" },
	{
		rule: "R12",
		pattern: /\b(?:MetaMask|Coinbase|OKX|Binance|WalletConnect|Rabby|Phantom)\b/i,
		reason: "no exchange or wallet brands",
	},
	{ rule: "R12", pattern: /\bTradingView\b/i, reason: "no chart-library trademark" },
	{ rule: "R12", pattern: /\blive on mainnet\b/i, reason: "no status dot or uptime claim" },
	{
		rule: "R12",
		pattern: /\bguaranteed (?:returns?|profits?|yield|income)\b|\brisk[\s-]?free\b|\bpassive income\b|\bearn up to\b|\b\d+(?:\.\d+)?\s?%\s*(?:APY|APR|yield|returns?)\b/i,
		reason: "no yield, return or profit promises",
	},
	{ rule: "R12", pattern: /\b(?:APY|APR)\b/, reason: "no yield, return or profit promises" },
	{
		rule: "R12",
		pattern: /\b(?:better|faster|cheaper) than (?:the )?(?:official|Hyperliquid)\b/i,
		reason: "no comparison with the official app",
	},
];

// Stylesheets carry transition durations, not latency claims.
const LATENCY_CLAIM = /\b\d+\s?ms\b/i;

test("website copy follows the plan's wording rules (R2, R3, R5, R9, R12)", () => {
	const violations = [];
	for (const { file, text } of SOURCES) {
		for (const { rule, pattern, reason } of PLAN_RULES) {
			const match = pattern.exec(text);
			if (match) violations.push(`${file}: ${rule} "${match[0]}" (${reason})`);
		}
		const latency = extname(file) === ".css" ? null : LATENCY_CLAIM.exec(text);
		if (latency) violations.push(`${file}: R12 "${latency[0]}" (no latency claims)`);
	}
	assert.deepEqual(violations, []);
});

test("HIP-3 copy never puts those markets on cross margin (R5)", () => {
	const violations = [];
	for (const { file, text } of SOURCES) {
		for (const sentence of text.split(/(?<=[.!?;])\s+/)) {
			if (/HIP-3|deployer/i.test(sentence) && /cross[\s-]?margin/i.test(sentence)) {
				violations.push(`${file}: "${sentence.trim().slice(0, 120)}"`);
			}
		}
	}
	assert.deepEqual(violations, [], "most HIP-3 markets allow isolated margin only; keep cross margin out of their sentences");
});

// Config, data and lib files hold the market list; components, pages, layouts and scripts read it (R10).
const MARKET_READERS = ["src/components/", "src/pages/", "src/layouts/", "src/scripts/"];

test("components and pages never write a dex-prefixed market by hand (R10)", () => {
	const dexes = SNAPSHOT.dexes.map((entry) => entry.dex).filter(Boolean);
	assert.ok(dexes.length >= 3, "the snapshot lists the HIP-3 dexes");
	const knownDex = new RegExp(`\\b(?:${dexes.join("|")}):[A-Za-z0-9]`);
	const anyDex = /\b[a-z]{2,8}:[A-Z][A-Z0-9]+\b/;
	const readers = SOURCES.filter(({ file }) => MARKET_READERS.some((directory) => file.startsWith(directory)));
	assert.ok(readers.length >= 10, "expected to scan the components and pages");
	const violations = [];
	for (const { file, text } of readers) {
		const match = knownDex.exec(text) ?? anyDex.exec(text);
		if (match) violations.push(`${file}: "${match[0]}"`);
	}
	assert.deepEqual(violations, [], "take market coins from FEATURED_MARKETS, the snapshot or deployers.ts");
});

// Every brand literal outside src/config/brand.ts, with the reason it may stay (R11).
const BRAND_LITERAL_EXCEPTIONS = {
	"src/components/Logo.astro": {
		tokens: ["sairn-lockup-on-light.svg", "sairn-mark-on-light.svg", "sairn-lockup-on-dark.svg", "sairn-mark-on-dark.svg"],
		reason: "file names of the logo kit under brand/svg (on-light for the default theme, on-dark for ?theme=dark), pinned by brand-contract",
	},
	"src/config/seo.ts": {
		tokens: ["sairn-avatar-light-1024.png"],
		reason: "file name of the social avatar under brand/social",
	},
	"src/lib/motion.ts": {
		tokens: ["sairn-motion.tokens.json"],
		reason: "file name of the brand motion tokens under brand/loader, read at build time (plan §6)",
	},
	"src/scripts/live-markets.ts": {
		tokens: ["sairn-site-live", "sairn-site-live"],
		reason: "Web Lock name: an internal identifier, which AGENTS.md keeps as a sairn literal",
	},
	"src/scripts/open-book.ts": {
		tokens: ["sairn-site-book", "sairn-site-book"],
		reason: "Web Lock name of the hero's Live market view: an internal identifier, kept as a sairn literal",
	},
	"src/assets/features/features-capture.json": {
		tokens: ["sairn", "app.sairn.ai", "app.sairn.ai", "app.sairn.ai", "app.sairn.ai", "app.sairn.ai", "app.sairn.ai"],
		reason: "capture record written by scripts/capture-features.mjs: the live build-meta name and the six captured URLs, not copy",
	},
	"src/assets/terminal-capture.json": {
		tokens: ["app.sairn.ai", "sairn"],
		reason: "capture record written by scripts/capture-hero.mjs: the captured URL and the live build-meta name, not copy",
	},
};

test("website copy takes brand names and domains from config/brand.ts (R11)", () => {
	const literals = [
		BRAND.name.lowercase,
		BRAND.name.display,
		BRAND.name.legalEntity,
		BRAND.emails.support,
		...Object.values(BRAND.domains.primary),
	].map((literal) => literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	const brandToken = new RegExp(`[\\w.@-]*(?:${literals.join("|")})[\\w.@-]*`, "gi");
	const found = {};
	for (const { file, text } of SOURCES) {
		if (file === "src/config/brand.ts") continue;
		const tokens = text.match(brandToken);
		if (tokens) found[file] = tokens;
	}
	const expected = Object.fromEntries(
		Object.entries(BRAND_LITERAL_EXCEPTIONS).map(([file, { tokens }]) => [file, tokens]),
	);
	assert.deepEqual(found, expected, "use BRAND_NAME, APP_URL, APP_HOST, SITE_HOST or SUPPORT_EMAIL, or list the literal here with a reason");
});

// Hyperliquid's base-tier perp rates (https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees); the terminal reads
// the live rates from the exchange, so only the builder fee has a source in this repository.
const HYPERLIQUID_BASE_PERP_PERCENT = { maker: "0.015", taker: "0.045" };

function terminalBuilderFeePercent() {
	const config = readFileSync(resolve(WEBSITE_ROOT, "../terminal/src/config/hyperliquid.ts"), "utf8");
	const tenthsOfBasisPoints = /\bf:\s*(\d+)\s*,/.exec(config)?.[1];
	assert.ok(tenthsOfBasisPoints, "apps/terminal/src/config/hyperliquid.ts no longer sets the builder fee as f: <tenths of a bp>");
	return percent(Number(tenthsOfBasisPoints) / 1_000);
}

function percent(value) {
	return `${Number(value.toFixed(4))}%`;
}

test("website discloses the builder fee wherever it quotes trading fees", () => {
	const fees = readSource("src/components/Fees.astro");
	const faq = readSource("src/config/faq.ts");
	const builder = terminalBuilderFeePercent();
	assert.match(fees, new RegExp(`${builder.replace(".", "\\.")} builder fee`));
	assert.match(faq, new RegExp(`${builder.replace(".", "\\.")} builder fee`));
});

test("website fee figures add the terminal builder fee to Hyperliquid's base rates and keep its exemptions", () => {
	const fees = readSource("src/components/Fees.astro");
	const faq = readSource("src/config/faq.ts");
	const builder = Number.parseFloat(terminalBuilderFeePercent());
	for (const [label, base] of [
		["Maker fee", HYPERLIQUID_BASE_PERP_PERCENT.maker],
		["Taker fee", HYPERLIQUID_BASE_PERP_PERCENT.taker],
	]) {
		const shown = new RegExp(`value: "([0-9.]+%)", label: "${label}"`).exec(fees)?.[1];
		assert.equal(shown, percent(Number(base) + builder), `${label} must be ${base}% Hyperliquid + ${builder}% builder fee`);
	}
	assert.match(fees, /builder fee on sells only/, "spot buys carry no builder fee (order-fee-quote.ts)");
	assert.match(fees, /TWAP orders carry no builder fee/, "twapOrder actions have no builder field (order-fee-quote.ts)");
	assert.match(faq, /TWAP orders and spot buys carry none/);
});

test("every file that scopes the builder fee to perp orders and spot sells also exempts TWAP orders (R8)", () => {
	const scoped = SOURCES.filter(({ text }) => /builder fee on perp orders(?: \(not TWAP\))? and spot sells/i.test(text));
	assert.ok(scoped.length >= 3, "expected Fees, Trust and the FAQ to state the scope");
	for (const { file, text } of scoped) {
		assert.match(text, /TWAP orders (?:and spot buys )?carry (?:none|no builder fee)/, `${file} states the scope without the TWAP exemption`);
	}
});

test("hero screenshots are imported assets with hashed URLs, never public files", () => {
	const hero = readSource("src/components/Hero.astro");
	const imports = [...hero.matchAll(/^import (\w+) from "@\/assets\/([\w-]+\.(?:jpe?g|png|webp|avif))";$/gm)];
	assert.deepEqual(
		imports.map(([, , file]) => file).sort(),
		["avif", "webp", "jpeg"].flatMap((format) => [`terminal-desktop.${format}`, `terminal-mobile.${format}`]).sort(),
		"Hero.astro imports the desktop and mobile capture as AVIF, WebP (scripts/optimize-images.mjs) and the JPEG fallback",
	);
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

test("hero screenshots keep the captured viewport, or the recorded clip of it", () => {
	const capture = JSON.parse(readSource("src/assets/terminal-capture.json"));
	const desktop = jpegSize(resolve(SOURCE_ROOT, "assets/terminal-desktop.jpeg"));
	const mobile = jpegSize(resolve(SOURCE_ROOT, "assets/terminal-mobile.jpeg"));
	assert.deepEqual(desktop, { width: 1600, height: 900 });
	const { viewport, clip } = capture.captures.mobile;
	assert.deepEqual(viewport, { width: 390, height: 844 }, "the phone capture is a 390 × 844 viewport");
	const shown = clip ?? { width: viewport.width, height: viewport.height };
	assert.equal(shown.width, viewport.width, "a clip keeps the full phone width");
	assert.ok(shown.height <= viewport.height);
	assert.equal(mobile.width * shown.height, mobile.height * shown.width, "the JPEG has the clip's proportions");
	assert.ok(mobile.width >= 390, "mobile screenshot is at least one CSS pixel per device pixel");
});

test("hero screenshots come from a recorded capture of the live, signed-out terminal", () => {
	const capture = JSON.parse(readSource("src/assets/terminal-capture.json"));
	const url = new URL(capture.url);
	assert.equal(url.host, BRAND.domains.primary.app, "the screenshots show the production terminal");
	assert.match(url.pathname, /^\/trade\//);
	assert.ok(!Number.isNaN(Date.parse(capture.capturedAt)), "capturedAt is an ISO timestamp");
	assert.ok(Date.parse(capture.capturedAt) <= Date.now(), "capturedAt is not in the future");
	assert.match(capture.build.commit, /^[0-9a-f]{40}$/, "the capture records the live build-meta.json commit");
	assert.ok(capture.build.release, "the capture records the live build-meta.json release");
	for (const [name, file] of [
		["desktop", "terminal-desktop.jpeg"],
		["mobile", "terminal-mobile.jpeg"],
	]) {
		const { file: recorded, viewport, deviceScaleFactor, clip } = capture.captures[name];
		assert.equal(recorded, file);
		const area = clip ?? viewport;
		assert.deepEqual(jpegSize(resolve(SOURCE_ROOT, "assets", file)), {
			width: area.width * deviceScaleFactor,
			height: area.height * deviceScaleFactor,
		});
	}
});

test("hero shows the screenshot without a mock browser frame and captions it from the capture record", () => {
	const hero = readSource("src/components/Hero.astro");
	const markup = hero.slice(hero.indexOf("---", 3) + 3);
	assert.match(hero, /^import capture from "@\/assets\/terminal-capture\.json";$/m);
	assert.match(hero, /formatUtcTimestamp\(capture\.capturedAt\)/, "the caption shows when the screenshot was taken");
	assert.match(markup, /<figcaption[^>]*>\{caption\}<\/figcaption>/);
	assert.doesNotMatch(markup, /\{APP_HOST\}/, "the host appears only in the caption, never as a fake address bar");
	assert.doesNotMatch(markup, /(<span[^>]*rounded-full[^>]*><\/span>\s*){3}/, "no window-control dots");
	assert.doesNotMatch(markup, /Connected|animate-ping|bg-live/i, "no fake connection status");
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
