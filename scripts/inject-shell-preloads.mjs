/**
 * Writes the trade startup closure into the prerendered shell as `modulepreload` and stylesheet
 * preloads, so a cold navigation downloads every startup chunk in one wave instead of discovering
 * them through nested `import()` calls. Runs after the bundle budget check; the closure comes from
 * the same chunk-graph analysis, so the shell never preloads a file the build did not emit.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeClientBundle } from "./check-client-bundle-budget.mjs";
import { collectChunkGraphStaticClosure, readClientChunkGraphFile, resolveClientChunkGraphCacheFile } from "./client-chunk-graph.mjs";

export const SHELL_PRELOAD_START = "<!--sairn-shell-preloads-->";
export const SHELL_PRELOAD_END = "<!--/sairn-shell-preloads-->";
const SHELL_FILE = "_shell.html";
const BUILD_META_FILE = "build-meta.json";
/** The terminal switches to its mobile surface at and below 1000px (`MOBILE_BREAKPOINT_PX`). */
export const DESKTOP_MIN_WIDTH_PX = 1001;
export const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`;
const CHART_BUNDLE_PATTERNS = { runtime: /^runtime\.[0-9a-f]{20}\.js$/, library: /^library\.[0-9a-f]{20}\.js$/ };
/** Requested by the chart iframe, so only the HTTP cache can hand them over; prefetch keeps them off the critical path. */
const CHART_STATIC_PREFETCHES = ["/charting_library/sameorigin.html", "/tradingview-theme-dark.css"];

/**
 * Names of the `<meta>` tags the bootstrap entry reads (`src/lib/preload/surface-preloads.ts`). `catalogs` is read
 * only by the service worker (`public/sw.js`), which keeps the listed files in its asset cache with both surface lists.
 */
export const SURFACE_PRELOAD_META = {
	desktop: "sairn-preload-desktop",
	mobile: "sairn-preload-mobile",
	chart: "sairn-chart-prefetch",
	catalogs: "sairn-locale-catalogs",
};
/** A compiled Lingui catalog as the chunk graph names it; `lib/i18n.ts` loads every one but English lazily. */
const LOCALE_CATALOG_MODULE = /^apps\/terminal\/src\/locales\/([^/]+)\/messages\.po$/;
const LOCALE_CATALOG_FILE = "messages.po";

/**
 * Splits the startup assets into what every surface needs (static closure plus files both runtime
 * profiles share) and what only one surface needs. The shared part becomes HTML preloads; the
 * surface-specific parts are handed to the bootstrap entry, which cannot be done with `media`
 * because Chromium ignores it on `modulepreload` and `prefetch` links.
 */
export function collectShellPreloadFiles({ tradeStartupFiles, runtimeProfileSizes }) {
	const profiles = new Map(runtimeProfileSizes.map((profile) => [profile.name, new Set(profile.files)]));
	const desktop = profiles.get("desktop") ?? new Set();
	const mobile = profiles.get("mobile") ?? new Set();
	const common = new Set(tradeStartupFiles);
	for (const file of desktop) if (mobile.has(file)) common.add(file);
	const only = (own, other) => [...own].filter((file) => !other.has(file) && !common.has(file));
	return { common: [...common], desktopOnly: only(desktop, mobile), mobileOnly: only(mobile, desktop) };
}

/**
 * The lazy locale catalogs with their static imports. `StartupReadyGate` waits for the catalog of the persisted
 * language, which no startup list names: English is bundled with the startup closure and is left out here.
 * `locales` names every catalog the source tree has. One the graph does not hold fails the build: the bundled
 * English catalog always matches, so an empty list alone would not show that the lazy ones went unrecognised.
 */
export function collectLocaleCatalogFiles({ graph, assetFiles, startupFiles, locales = [] }) {
	const found = new Set();
	const entryFiles = [];
	for (const [file, chunk] of Object.entries(graph.chunks)) {
		const matches = chunk.modules.map((moduleId) => LOCALE_CATALOG_MODULE.exec(moduleId)).filter(Boolean);
		if (matches.length === 0) continue;
		entryFiles.push(file);
		for (const match of matches) found.add(match[1]);
	}
	if (entryFiles.length === 0) throw new Error("the client chunk graph holds no locale catalog module");
	const missing = locales.filter((locale) => !found.has(locale));
	if (missing.length > 0) {
		throw new Error(`the client chunk graph holds no locale catalog module for: ${missing.join(", ")}`);
	}
	const startup = new Set(startupFiles);
	return [...collectChunkGraphStaticClosure({ graph, assetFiles, entryFiles })].filter((file) => !startup.has(file)).sort();
}

/** The locales that have a catalog in the source tree, as `lib/i18n.ts` loads them. */
export function listSourceLocales(localesDirectory) {
	return readdirSync(localesDirectory, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(join(localesDirectory, entry.name, LOCALE_CATALOG_FILE)))
		.map((entry) => entry.name)
		.sort();
}

export function renderSurfacePreloadMeta({ desktopOnly, mobileOnly, chartPrefetches, localeCatalogs = [] }) {
	const meta = (name, hrefs) => `<meta name="${name}" content="${hrefs.join(" ")}"/>`;
	return [
		meta(SURFACE_PRELOAD_META.desktop, desktopOnly.map((file) => `/assets/${file}`)),
		meta(SURFACE_PRELOAD_META.mobile, mobileOnly.map((file) => `/assets/${file}`)),
		meta(SURFACE_PRELOAD_META.chart, chartPrefetches),
		meta(SURFACE_PRELOAD_META.catalogs, localeCatalogs.map((file) => `/assets/${file}`)),
	];
}

export function readShellAssetHrefs(html) {
	return new Set([...html.matchAll(/<link\b[^>]*\bhref="(\/assets\/[^"]+)"/g)].map((match) => match[1]));
}

export function renderShellPreloadLinks({ files, existingHrefs }) {
	const links = [];
	for (const file of files) {
		const href = `/assets/${file}`;
		if (existingHrefs.has(href)) continue;
		if (file.endsWith(".js")) links.push(`<link rel="modulepreload" href="${href}"/>`);
		else if (file.endsWith(".css")) links.push(`<link rel="preload" href="${href}" as="style"/>`);
	}
	return links;
}

export function findChartBundles(bundlesDirectory) {
	const files = existsSync(bundlesDirectory) ? readdirSync(bundlesDirectory) : [];
	const bundles = {};
	for (const [name, pattern] of Object.entries(CHART_BUNDLE_PATTERNS)) {
		const matches = files.filter((file) => pattern.test(file));
		if (matches.length !== 1) throw new Error(`expected one TradingView ${name} bundle, found ${matches.length}`);
		bundles[name] = `/charting_library/bundles/${matches[0]}`;
	}
	return bundles;
}

/** The loader itself is a classic script, and `media` is honoured on `preload`, so it stays in the HTML. */
export function renderChartPreloadLink({ chartLibraryScript, mediaQuery = DESKTOP_MEDIA_QUERY }) {
	if (typeof chartLibraryScript !== "string" || !chartLibraryScript.startsWith("/charting_library/")) {
		throw new Error("build-meta.json has no chartLibraryScript for the shell to preload");
	}
	return `<link rel="preload" href="${chartLibraryScript}" as="script" media="${mediaQuery}"/>`;
}

/** Requested by the chart iframe on desktop; the bootstrap entry turns these into prefetch links. */
export function collectChartPrefetches(bundles) {
	return [bundles.runtime, bundles.library, ...CHART_STATIC_PREFETCHES];
}

/** The shell as the prerender wrote it: a previous injection block, if any, is removed first. */
export function stripShellPreloads(html) {
	const start = html.indexOf(SHELL_PRELOAD_START);
	const end = html.indexOf(SHELL_PRELOAD_END);
	if (start === -1 || end < start) return html;
	return `${html.slice(0, start)}${html.slice(end + SHELL_PRELOAD_END.length)}`;
}

export function injectShellPreloads(html, links) {
	const block = `${SHELL_PRELOAD_START}${links.join("")}${SHELL_PRELOAD_END}`;
	const base = stripShellPreloads(html);
	const headEnd = base.indexOf("</head>");
	if (headEnd === -1) throw new Error("shell has no </head>");
	return `${base.slice(0, headEnd)}${block}${base.slice(headEnd)}`;
}

/** Everything the build adds to the shell's head, in order: shared preloads, the chart entry, the four lists. */
export function renderShellHeadLinks({ html, surfaces, chartLibraryScript, chartBundles, localeCatalogs }) {
	return [
		...renderShellPreloadLinks({ files: surfaces.common, existingHrefs: readShellAssetHrefs(html) }),
		renderChartPreloadLink({ chartLibraryScript }),
		...renderSurfacePreloadMeta({
			desktopOnly: surfaces.desktopOnly,
			mobileOnly: surfaces.mobileOnly,
			chartPrefetches: collectChartPrefetches(chartBundles),
			localeCatalogs,
		}),
	];
}

export async function injectShellPreloadsIntoBuild(publicDirectoryArgument) {
	const publicDirectory = resolve(publicDirectoryArgument ?? "apps/terminal/.output/public");
	const shellFile = join(publicDirectory, SHELL_FILE);
	if (!existsSync(shellFile)) throw new Error(`No ${SHELL_FILE} in ${publicDirectory}; run the production build first`);
	const analysis = await analyzeClientBundle(join(publicDirectory, "assets"));
	if (analysis.violations.length > 0) throw new Error(`client bundle analysis failed: ${analysis.violations.join("; ")}`);
	const surfaces = collectShellPreloadFiles(analysis);
	const files = [...surfaces.common, ...surfaces.desktopOnly, ...surfaces.mobileOnly];
	const appDirectory = resolve(publicDirectory, "../..");
	const localeCatalogs = collectLocaleCatalogFiles({
		graph: readClientChunkGraphFile(resolveClientChunkGraphCacheFile(appDirectory)),
		assetFiles: analysis.assetFiles,
		startupFiles: files,
		locales: listSourceLocales(join(appDirectory, "src", "locales")),
	});
	for (const file of [...files, ...localeCatalogs]) {
		if (!existsSync(join(publicDirectory, "assets", file))) throw new Error(`startup asset ${file} is missing from the build`);
	}
	// Links from an earlier run must not count as the shell's own, or a second run would drop them.
	const html = stripShellPreloads(readFileSync(shellFile, "utf8"));
	const buildMeta = JSON.parse(readFileSync(join(publicDirectory, BUILD_META_FILE), "utf8"));
	const links = renderShellHeadLinks({
		html,
		surfaces,
		chartLibraryScript: buildMeta.chartLibraryScript,
		chartBundles: findChartBundles(join(publicDirectory, "charting_library", "bundles")),
		localeCatalogs,
	});
	writeFileSync(shellFile, injectShellPreloads(html, links));
	console.log(
		`Shell preloads: ${surfaces.common.length} shared startup assets in ${SHELL_FILE}; ${surfaces.desktopOnly.length} desktop-only and ${surfaces.mobileOnly.length} mobile-only assets plus the chart handed to the bootstrap entry; ${localeCatalogs.length} lazy locale catalog assets listed for the service worker.`,
	);
	return { files, links, surfaces, localeCatalogs };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) await injectShellPreloadsIntoBuild(process.argv[2]);
