/**
 * Lists the inline scripts of the prerendered pages with their Content-Security-Policy hashes, so
 * the edge can allow exactly those scripts without `'unsafe-inline'`. Runs at the end of the build
 * on the final HTML (after the shell preloads are injected) and again from deploy.mjs before the
 * CloudFront Functions are published and before HTML is uploaded, so a policy and the pages it
 * covers always come from the same output. Inline event handlers and `javascript:` URLs cannot be
 * expressed as hashes and fail the build.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const INLINE_SCRIPT_HASHES_FILE = "inline-script-hashes.json";
/** Documents under other policies (the chart iframe) or directories that hold no documents. */
const SKIPPED_DIRECTORIES = new Set(["assets", "charting_library"]);
/** `type` values the browser executes as script; anything else is a data block the policy ignores. */
const EXECUTABLE_TYPES = new Set(["", "module", "text/javascript", "application/javascript", "importmap", "speculationrules"]);
const SCRIPT_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const ATTRIBUTE_PATTERN = /([^\s=>/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;

/**
 * Browsers hash the script's text as the HTML parser produced it, not the file bytes: the input
 * stream preprocessor turns CR and CRLF into LF, and the script-data tokenizer replaces U+0000
 * with U+FFFD (TanStack's stream barrier serializes route match ids that contain NUL).
 */
export function parserScriptText(text) {
	return text.replace(/\r\n?/g, "\n").replace(/\u0000/g, "\uFFFD");
}

export function cspHash(text) {
	return `sha256-${createHash("sha256").update(parserScriptText(text), "utf8").digest("base64")}`;
}

function parseAttributes(source) {
	const attributes = new Map();
	for (const match of source.matchAll(ATTRIBUTE_PATTERN)) {
		const value = match[2] === undefined ? "" : match[2].replace(/^["']|["']$/g, "");
		attributes.set(match[1].toLowerCase(), value);
	}
	return attributes;
}

/** The executable inline scripts of one document, in document order. */
export function collectInlineScripts(html) {
	const scripts = [];
	for (const match of html.matchAll(SCRIPT_PATTERN)) {
		const attributes = parseAttributes(match[1]);
		if (attributes.has("src")) continue;
		if (!EXECUTABLE_TYPES.has((attributes.get("type") ?? "").trim().toLowerCase())) continue;
		scripts.push({ hash: cspHash(match[2]), bytes: Buffer.byteLength(parserScriptText(match[2]), "utf8"), id: attributes.get("id") ?? "" });
	}
	return scripts;
}

/** Markup a hash-based `script-src` cannot allow: inline event handlers and `javascript:` URLs. */
export function findUnhashableMarkup(html) {
	const problems = [];
	const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");
	for (const tag of markup.matchAll(/<([a-z][^\s>/]*)([^>]*)>/gi)) {
		for (const [name, value] of parseAttributes(tag[2])) {
			if (/^on[a-z]+$/.test(name)) problems.push(`inline event handler ${name} on <${tag[1]}>`);
			if (/^\s*javascript:/i.test(value)) problems.push(`javascript: URL in ${name} on <${tag[1]}>`);
		}
	}
	return problems;
}

/** The shell, every `<route>/index.html` and the other root documents (404) of the client output. */
export function listPrerenderedPages(publicDir) {
	const pages = [];
	for (const entry of readdirSync(publicDir, { withFileTypes: true })) {
		if (entry.isFile() && entry.name.endsWith(".html")) pages.push(entry.name);
		else if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name) && existsSync(join(publicDir, entry.name, "index.html"))) {
			pages.push(`${entry.name}/index.html`);
		}
	}
	return pages.sort();
}

export function collectInlineScriptHashes(publicDir) {
	const pages = {};
	const problems = [];
	for (const page of listPrerenderedPages(publicDir)) {
		const html = readFileSync(join(publicDir, page), "utf8");
		for (const problem of findUnhashableMarkup(html)) problems.push(`${page}: ${problem}`);
		pages[page] = [...new Set(collectInlineScripts(html).map((script) => script.hash))].sort();
	}
	if (problems.length > 0) throw new Error(`Markup a hash policy cannot allow:\n${problems.join("\n")}`);
	return { pages, hashes: [...new Set(Object.values(pages).flat())].sort() };
}

export function defaultOutFile(publicDir) {
	return resolve(publicDir, "..", "edge", INLINE_SCRIPT_HASHES_FILE);
}

export function writeInlineScriptHashes(publicDir, outFile = defaultOutFile(publicDir)) {
	const result = collectInlineScriptHashes(publicDir);
	mkdirSync(dirname(outFile), { recursive: true });
	writeFileSync(outFile, `${JSON.stringify(result, null, "\t")}\n`);
	return { ...result, outFile };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const [publicDir, outFile] = process.argv.slice(2);
	if (!publicDir) {
		console.error("usage: node scripts/collect-inline-script-hashes.mjs <publicDir> [outFile]");
		process.exit(2);
	}
	const directory = resolve(publicDir);
	if (!existsSync(join(directory, "_shell.html"))) {
		console.error(`No _shell.html in ${directory}; run the build first`);
		process.exit(1);
	}
	try {
		const result = writeInlineScriptHashes(directory, outFile ? resolve(outFile) : undefined);
		console.log(`Inline script hashes: ${result.hashes.length} distinct across ${Object.keys(result.pages).length} pages → ${result.outFile}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
