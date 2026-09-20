#!/usr/bin/env node
// Build-output assertion for the pairing scrub: in every prerendered page that runs any script, the
// first script element of the document must be the committed inline scrub, so it runs before the
// module entry, before any other inline script and before any chunk could read the address. Source
// order alone does not prove that; this checks the HTML the CDN will serve. A document without a
// single script element (the static 404 page) has nothing that could run first.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cspHash, listPrerenderedPages } from "./collect-inline-script-hashes.mjs";

const GENERATED_SCRUB_MODULE = fileURLToPath(
	new URL("../apps/terminal/src/lib/mobile-sync/head-scrub-script.generated.ts", import.meta.url),
);
const FIRST_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/i;

/** Reads the single-quoted literal the renderer writes, undoing its two escapes. */
export function readCommittedScrubScript(moduleSource = readFileSync(GENERATED_SCRUB_MODULE, "utf8")) {
	const literal = /PAIRING_HEAD_SCRUB_SCRIPT =\s*'((?:[^'\\]|\\.)*)';/.exec(moduleSource);
	if (!literal) throw new Error("head-scrub-script.generated.ts does not hold the rendered script");
	return literal[1].replace(/\\(['\\])/g, "$1");
}

export function findHeadScrubProblem(html, script) {
	const first = FIRST_SCRIPT.exec(html);
	if (!first) return null;
	if (/\bsrc\s*=/i.test(first[1])) return "loads an external script before the pairing scrub";
	if (cspHash(first[2]) !== cspHash(script)) return "runs another inline script before the pairing scrub";
	const head = /<\/head\s*>/i.exec(html);
	if (!head || first.index > head.index) return "runs the pairing scrub outside <head>";
	return null;
}

export function checkShellHeadScrub(publicDir, script = readCommittedScrubScript()) {
	return listPrerenderedPages(publicDir).flatMap((page) => {
		const problem = findHeadScrubProblem(readFileSync(join(publicDir, page), "utf8"), script);
		return problem ? [`${page} ${problem}`] : [];
	});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const publicDir = resolve(process.argv[2] ?? "apps/terminal/.output/public");
	const problems = checkShellHeadScrub(publicDir);
	if (problems.length > 0) {
		for (const problem of problems) console.error(`Pairing scrub order: ${problem}`);
		process.exit(1);
	}
	console.log(`Pairing scrub is the first script of all ${listPrerenderedPages(publicDir).length} prerendered pages`);
}
