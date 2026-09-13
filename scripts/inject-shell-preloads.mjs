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

export function collectShellPreloadFiles({ tradeStartupFiles, runtimeProfileSizes }) {
	const files = new Set(tradeStartupFiles);
	for (const profile of runtimeProfileSizes) for (const file of profile.files) files.add(file);
	return [...files];
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

/** Desktop only: the mobile layout mounts the chart on demand, so phones do not pay for it up front. */
export function renderChartPreloadLinks({ chartLibraryScript, bundles, mediaQuery = DESKTOP_MEDIA_QUERY }) {
	if (typeof chartLibraryScript !== "string" || !chartLibraryScript.startsWith("/charting_library/")) {
		throw new Error("build-meta.json has no chartLibraryScript for the shell to preload");
	}
	const prefetches = [bundles.runtime, bundles.library, ...CHART_STATIC_PREFETCHES];
	return [
		`<link rel="preload" href="${chartLibraryScript}" as="script" media="${mediaQuery}"/>`,
		...prefetches.map((href) => `<link rel="prefetch" href="${href}" media="${mediaQuery}"/>`),
	];
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
	const files = collectShellPreloadFiles(analysis);
	for (const file of files) {
		if (!existsSync(join(publicDirectory, "assets", file))) throw new Error(`startup asset ${file} is missing from the build`);
	}
	const html = readFileSync(shellFile, "utf8");
	const buildMeta = JSON.parse(readFileSync(join(publicDirectory, BUILD_META_FILE), "utf8"));
	const links = [
		...renderShellPreloadLinks({ files, existingHrefs: readShellAssetHrefs(html) }),
		...renderChartPreloadLinks({
			chartLibraryScript: buildMeta.chartLibraryScript,
			bundles: findChartBundles(join(publicDirectory, "charting_library", "bundles")),
		}),
	];
	writeFileSync(shellFile, injectShellPreloads(html, links));
	console.log(`Shell preloads: ${links.length} links added for ${files.length} startup assets and the chart in ${SHELL_FILE}.`);
	return { files, links };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) await injectShellPreloadsIntoBuild(process.argv[2]);
