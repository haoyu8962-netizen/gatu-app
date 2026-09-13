/**
 * Writes the trade startup closure into the prerendered shell as `modulepreload` and stylesheet
 * preloads, so a cold navigation downloads every startup chunk in one wave instead of discovering
 * them through nested `import()` calls. Runs after the bundle budget check; the closure comes from
 * the same chunk-graph analysis, so the shell never preloads a file the build did not emit.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeClientBundle } from "./check-client-bundle-budget.mjs";

export const SHELL_PRELOAD_START = "<!--gatu-shell-preloads-->";
export const SHELL_PRELOAD_END = "<!--/gatu-shell-preloads-->";
const SHELL_FILE = "_shell.html";

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
	const links = renderShellPreloadLinks({ files, existingHrefs: readShellAssetHrefs(html) });
	writeFileSync(shellFile, injectShellPreloads(html, links));
	console.log(`Shell preloads: ${links.length} links added for ${files.length} startup assets in ${SHELL_FILE}.`);
	return { files, links };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) await injectShellPreloadsIntoBuild(process.argv[2]);
