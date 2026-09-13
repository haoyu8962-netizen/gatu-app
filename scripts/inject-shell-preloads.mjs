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

export const SHELL_PRELOAD_START = "<!--gatu-shell-preloads-->";
export const SHELL_PRELOAD_END = "<!--/gatu-shell-preloads-->";
const SHELL_FILE = "_shell.html";
const BUILD_META_FILE = "build-meta.json";
/** The terminal switches to its mobile surface at and below 1000px (`MOBILE_BREAKPOINT_PX`). */
export const DESKTOP_MIN_WIDTH_PX = 1001;
export const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`;
const CHART_BUNDLE_PATTERNS = { runtime: /^runtime\.[0-9a-f]{20}\.js$/, library: /^library\.[0-9a-f]{20}\.js$/ };
/** Requested by the chart iframe, so only the HTTP cache can hand them over; prefetch keeps them off the critical path. */
const CHART_STATIC_PREFETCHES = ["/charting_library/sameorigin.html", "/tradingview-theme-dark.css"];

/** Names of the `<meta>` tags the bootstrap entry reads (`src/lib/preload/surface-preloads.ts`). */
export const SURFACE_PRELOAD_META = { desktop: "gatu-preload-desktop", mobile: "gatu-preload-mobile", chart: "gatu-chart-prefetch" };

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

export function renderSurfacePreloadMeta({ desktopOnly, mobileOnly, chartPrefetches }) {
	const meta = (name, hrefs) => `<meta name="${name}" content="${hrefs.join(" ")}"/>`;
	return [
		meta(SURFACE_PRELOAD_META.desktop, desktopOnly.map((file) => `/assets/${file}`)),
		meta(SURFACE_PRELOAD_META.mobile, mobileOnly.map((file) => `/assets/${file}`)),
		meta(SURFACE_PRELOAD_META.chart, chartPrefetches),
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

export function injectShellPreloads(html, links) {
	const block = `${SHELL_PRELOAD_START}${links.join("")}${SHELL_PRELOAD_END}`;
	const start = html.indexOf(SHELL_PRELOAD_START);
	const end = html.indexOf(SHELL_PRELOAD_END);
	if (start !== -1 && end > start) return `${html.slice(0, start)}${block}${html.slice(end + SHELL_PRELOAD_END.length)}`;
	const headEnd = html.indexOf("</head>");
	if (headEnd === -1) throw new Error("shell has no </head>");
	return `${html.slice(0, headEnd)}${block}${html.slice(headEnd)}`;
}

export async function injectShellPreloadsIntoBuild(publicDirectoryArgument) {
	const publicDirectory = resolve(publicDirectoryArgument ?? "apps/terminal/.output/public");
	const shellFile = join(publicDirectory, SHELL_FILE);
	if (!existsSync(shellFile)) throw new Error(`No ${SHELL_FILE} in ${publicDirectory}; run the production build first`);
	const analysis = await analyzeClientBundle(join(publicDirectory, "assets"));
	if (analysis.violations.length > 0) throw new Error(`client bundle analysis failed: ${analysis.violations.join("; ")}`);
	const surfaces = collectShellPreloadFiles(analysis);
	const files = [...surfaces.common, ...surfaces.desktopOnly, ...surfaces.mobileOnly];
	for (const file of files) {
		if (!existsSync(join(publicDirectory, "assets", file))) throw new Error(`startup asset ${file} is missing from the build`);
	}
	const html = readFileSync(shellFile, "utf8");
	const buildMeta = JSON.parse(readFileSync(join(publicDirectory, BUILD_META_FILE), "utf8"));
	const links = [
		...renderShellPreloadLinks({ files: surfaces.common, existingHrefs: readShellAssetHrefs(html) }),
		renderChartPreloadLink({ chartLibraryScript: buildMeta.chartLibraryScript }),
		...renderSurfacePreloadMeta({
			desktopOnly: surfaces.desktopOnly,
			mobileOnly: surfaces.mobileOnly,
			chartPrefetches: collectChartPrefetches(findChartBundles(join(publicDirectory, "charting_library", "bundles"))),
		}),
	];
	writeFileSync(shellFile, injectShellPreloads(html, links));
	console.log(
		`Shell preloads: ${surfaces.common.length} shared startup assets in ${SHELL_FILE}; ${surfaces.desktopOnly.length} desktop-only and ${surfaces.mobileOnly.length} mobile-only assets plus the chart handed to the bootstrap entry.`,
	);
	return { files, links, surfaces };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) await injectShellPreloadsIntoBuild(process.argv[2]);
