#!/usr/bin/env node
// Renders the shell's inline pairing scrub from its single TypeScript source, so the head script and
// the client entry can never drift apart. The output is committed; a test fails when it is stale.
// Run with `node apps/terminal/scripts/render-pairing-head-scrub.mjs`.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { transformWithEsbuild } from "vite";

const directory = fileURLToPath(new URL("../src/lib/mobile-sync/", import.meta.url));
export const SOURCE_PATH = resolve(directory, "pairing-location.ts");
export const OUTPUT_PATH = resolve(directory, "head-scrub-script.generated.ts");

/** Sequences that would end the script element or open an HTML comment inside it. */
const UNSAFE_IN_SCRIPT_ELEMENT = /<\/script|<!--/i;

export async function renderPairingHeadScrubScript() {
	const source = `${readFileSync(SOURCE_PATH, "utf8")}\ninstallPairingBootstrap(window);\n`;
	const { code } = await transformWithEsbuild(source, SOURCE_PATH, {
		format: "iife",
		legalComments: "none",
		loader: "ts",
		minify: true,
		sourcemap: false,
		// Plain concatenation keeps template placeholders out of the committed string literal.
		supported: { "template-literal": false },
		target: "es2019",
		tsconfigRaw: {},
	});
	const script = code.trim();
	if (UNSAFE_IN_SCRIPT_ELEMENT.test(script)) throw new Error("The rendered scrub would break out of its script element");
	return script;
}

export function renderGeneratedModule(script) {
	return [
		"// Generated from pairing-location.ts by scripts/render-pairing-head-scrub.mjs; do not edit by hand.",
		"export const PAIRING_HEAD_SCRUB_SCRIPT =",
		`\t'${script.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}';`,
		"",
	].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	writeFileSync(OUTPUT_PATH, renderGeneratedModule(await renderPairingHeadScrubScript()));
	console.log(`rendered ${OUTPUT_PATH}`);
}
