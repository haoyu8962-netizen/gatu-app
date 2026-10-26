// The website's platform (2026-10-26 upgrade): Astro 7 with Vite 8, Tailwind 4.3, the Fonts and CSP APIs, and the
// Node version Astro 7 requires. Pins the versions and the configuration the built-site tests rely on.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import brand from "../../../brand/brand.json" with { type: "json" };
import { THEME_QUERY_SCRIPT } from "../src/lib/theme.ts";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(WEBSITE_ROOT, path), "utf8");
const PACKAGE = JSON.parse(read("package.json"));
const CONFIG = read("astro.config.mjs");
const BASE = read("src/layouts/Base.astro");

test("the website pins Astro 7, Tailwind 4.3 and their integrations to exact versions", () => {
	assert.deepEqual(
		{
			astro: PACKAGE.dependencies.astro,
			"@astrojs/sitemap": PACKAGE.dependencies["@astrojs/sitemap"],
			tailwindcss: PACKAGE.dependencies.tailwindcss,
			"@tailwindcss/vite": PACKAGE.dependencies["@tailwindcss/vite"],
		},
		{ astro: "7.4.2", "@astrojs/sitemap": "3.7.4", tailwindcss: "4.3.3", "@tailwindcss/vite": "4.3.3" },
	);
	for (const [name, version] of Object.entries({ ...PACKAGE.dependencies, ...PACKAGE.devDependencies })) {
		assert.match(version, /^\d+\.\d+\.\d+$/, `${name} is pinned to an exact version`);
	}
	assert.equal(PACKAGE.dependencies.vite, undefined, "Vite comes from Astro, so the Tailwind plugin and Astro share one copy");
});

test("the website declares the Node version the installed Astro requires", () => {
	assert.deepEqual(PACKAGE.engines, { node: ">=22.23.4" });
	const astro = JSON.parse(read("node_modules/astro/package.json"));
	assert.equal(astro.version, PACKAGE.dependencies.astro, "node_modules matches package.json: run pnpm install");
	assert.equal(astro.engines.node, PACKAGE.engines.node, "the website's engines follow Astro's own minimum");
});

test("Astro 7 migration settings stay explicit", () => {
	// Astro 7 changed compressHTML's default to 'jsx', which drops the spaces between inline elements and text on
	// separate lines that the templates rely on.
	assert.match(CONFIG, /^\tcompressHTML: true,$/m);
	// Astro 6: z comes from astro/zod (Zod 4); .passthrough() became z.looseObject().
	const collections = read("src/content.config.ts");
	assert.match(collections, /^import \{ z \} from "astro\/zod";$/m);
	assert.doesNotMatch(collections, /from "astro:content";[^\n]*\bz\b|\.passthrough\(\)/);
	// Shiki's inline styles cannot pass the CSP.
	assert.match(CONFIG, /markdown: \{\s*syntaxHighlight: false,\s*\}/);
});

test("the Fonts API serves the local Fontsource latin files, preloading Plex Sans only", () => {
	assert.match(CONFIG, /import \{ defineConfig, fontProviders \} from "astro\/config";/);
	assert.equal((CONFIG.match(/provider: fontProviders\.local\(\)/g) ?? []).length, 2, "local files only: the build needs no font CDN");
	assert.match(CONFIG, /src: \["@fontsource-variable\/ibm-plex-sans\/files\/ibm-plex-sans-latin-wght-normal\.woff2"\]/);
	assert.match(CONFIG, /src: \["@fontsource\/ibm-plex-mono\/files\/ibm-plex-mono-latin-400-normal\.woff2"\]/);
	assert.equal((CONFIG.match(/optimizedFallbacks: false,/g) ?? []).length, 2, "fallback faces without unicode-range would redraw → and ▲▼");
	assert.match(BASE, /<Font cssVariable="--font-plex-sans" preload \/>/);
	assert.match(BASE, /<Font cssVariable="--font-plex-mono" \/>/);
	assert.doesNotMatch(BASE, /rel="preload"/, "the Fonts API writes the one preload");
	const styles = read("src/styles/global.css");
	assert.doesNotMatch(styles, /@font-face/, "no hand-written faces next to the Fonts API");
	assert.match(styles, /--font-sans: var\(--font-plex-sans\);/);
	assert.match(styles, /--font-mono: var\(--font-plex-mono\);/);
});

test("the CSP config allows only Hyperliquid's API as a remote origin and hashes Base.astro's inline blocks", () => {
	assert.match(CONFIG, /security: \{\s*csp: \{\s*directives: CSP_DIRECTIVES,\s*\},\s*\}/);
	assert.match(CONFIG, /"connect-src 'self' https:\/\/api\.hyperliquid\.xyz wss:\/\/api\.hyperliquid\.xyz",/);
	for (const directive of ["default-src 'self'", "img-src 'self' data:", "media-src 'self'", "font-src 'self'"]) {
		assert.ok(CONFIG.includes(`"${directive}",`), directive);
	}
	assert.doesNotMatch(CONFIG, /unsafe-inline|unsafe-eval|scriptDirective|styleDirective/, "Astro manages script-src and style-src");
	assert.match(BASE, /Astro\.csp\?\.insertScriptHash\(cspHash\(JS_CLASS_SCRIPT\)\);/);
	assert.match(BASE, /Astro\.csp\?\.insertStyleHash\(cspHash\(MOTION_ROOT_RULE\)\);/);
	assert.match(BASE, /<style is:inline data-motion-tokens set:html=\{MOTION_ROOT_RULE\} \/>/);
	assert.match(BASE, /<script is:inline set:html=\{JS_CLASS_SCRIPT\} \/>/);
	assert.match(BASE, /Astro\.csp\?\.insertScriptHash\(cspHash\(THEME_QUERY_SCRIPT\)\);/);
	assert.match(BASE, /<script is:inline data-theme-query set:html=\{THEME_QUERY_SCRIPT\} \/>/);
	assert.equal((BASE.match(/is:inline/g) ?? []).length, 3, "every is:inline block is one of the three hashed above");
});

// The light theme is the default; ?theme=dark switches the whole page to the dark token set before first paint and
// keeps it for the browser session (?theme=light returns). Runs the exact inline script against stand-ins.
function runThemeScript(search, stored = {}) {
	const storage = new Map(Object.entries(stored));
	const metas = { "theme-color": { content: brand.pwa.lightThemeColor }, "color-scheme": { content: "light" } };
	const root = { dataset: {} };
	const sandbox = {
		location: { search },
		URLSearchParams,
		sessionStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
		document: {
			documentElement: root,
			querySelector: (selector) => metas[/name="([^"]+)"/.exec(selector)?.[1]] ?? null,
		},
	};
	runInNewContext(THEME_QUERY_SCRIPT, sandbox);
	return { theme: root.dataset.theme, themeColor: metas["theme-color"].content, colorScheme: metas["color-scheme"].content, storage };
}

test("the page is light by default and ?theme=dark switches it before paint, for the session", () => {
	const head = BASE.slice(BASE.indexOf("<head>"), BASE.indexOf("</head>"));
	assert.ok(head.indexOf('name="theme-color"') < head.indexOf("data-theme-query"), "the script updates a meta that precedes it");
	assert.ok(head.indexOf('name="color-scheme" content="light"') < head.indexOf("data-theme-query"));
	assert.match(BASE, /<html lang="en">/, "no theme class is hard-coded on <html>");

	assert.deepEqual(runThemeScript("").theme, undefined);
	const dark = runThemeScript("?theme=dark");
	assert.deepEqual([dark.theme, dark.themeColor, dark.colorScheme], ["dark", brand.pwa.themeColor, "dark"]);
	assert.equal(runThemeScript("", Object.fromEntries(dark.storage)).theme, "dark", "kept for the session");
	assert.equal(runThemeScript("?theme=light", Object.fromEntries(dark.storage)).theme, undefined, "?theme=light returns");
	assert.equal(runThemeScript("?theme=purple").theme, undefined);
});
