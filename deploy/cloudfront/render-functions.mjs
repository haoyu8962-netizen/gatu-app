#!/usr/bin/env node
// Renders the viewer-response CloudFront Function from its template and the application's
// security headers, so the edge emits exactly the Content-Security-Policy the server emits.
// Run with `node --experimental-strip-types deploy/cloudfront/render-functions.mjs` after changing
// `apps/terminal/src/config/security-headers.ts`; `pnpm test:cloudfront` fails on drift.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	chartingLibraryContentSecurityPolicy,
	contentSecurityPolicy,
} from "../../apps/terminal/src/config/security-headers.ts";

export const FUNCTION_CODE_LIMIT_BYTES = 10 * 1024;
const directory = dirname(fileURLToPath(import.meta.url));
export const RESPONSE_TEMPLATE_PATH = join(directory, "functions", "terminal-response.template.js");
export const RESPONSE_FUNCTION_PATH = join(directory, "functions", "terminal-response.js");

function embed(value) {
	if (value.includes('"') || value.includes("\\") || /[\r\n]/.test(value)) {
		throw new Error("Content-Security-Policy values must not contain quotes, backslashes or line breaks");
	}
	return value;
}

export function renderResponseFunction({ template, terminalCsp, chartCsp }) {
	const rendered = template
		.replace("__TERMINAL_CSP__", embed(terminalCsp))
		.replace("__CHART_CSP__", embed(chartCsp))
		.replace(
			"// Generated from terminal-response.template.js by render-functions.mjs; do not edit the rendered\n// file by hand.",
			"// GENERATED FILE: rendered from terminal-response.template.js by render-functions.mjs; do not\n// edit by hand.",
		);
	if (rendered.includes("__TERMINAL_CSP__") || rendered.includes("__CHART_CSP__")) {
		throw new Error("Template placeholders were not replaced");
	}
	const bytes = Buffer.byteLength(rendered, "utf8");
	if (bytes > FUNCTION_CODE_LIMIT_BYTES) {
		throw new Error(`Rendered function is ${bytes} bytes; CloudFront Functions allow ${FUNCTION_CODE_LIMIT_BYTES}`);
	}
	return rendered;
}

export function renderCurrentResponseFunction() {
	return renderResponseFunction({
		template: readFileSync(RESPONSE_TEMPLATE_PATH, "utf8"),
		terminalCsp: contentSecurityPolicy,
		chartCsp: chartingLibraryContentSecurityPolicy,
	});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	writeFileSync(RESPONSE_FUNCTION_PATH, renderCurrentResponseFunction());
	console.log(`rendered ${RESPONSE_FUNCTION_PATH}`);
}
