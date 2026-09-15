#!/usr/bin/env node
// Renders the viewer-response CloudFront Function from its template and the application's
// security headers, so the edge emits exactly the Content-Security-Policy the server emits. Run with
// `node --experimental-strip-types deploy/cloudfront/render-functions.mjs` after changing
// `apps/terminal/src/config/security-headers.ts` or `edge-config.json`; `pnpm test:cloudfront`
// fails on drift. The committed file carries empty inline script hash sets; `deploy.mjs functions`
// fills them from the build at publish time (see function-code.mjs).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	createStrictCspDirectives,
	cspDirectives,
	serializeContentSecurityPolicy,
} from "../../apps/terminal/src/config/security-headers.ts";
import { assertFunctionCodeSize, EDGE_CSP_MODES, readEdgeConfig } from "./function-code.mjs";

export { EDGE_CONFIG_PATH, FUNCTION_CODE_LIMIT_BYTES, readEdgeConfig } from "./function-code.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
export const RESPONSE_TEMPLATE_PATH = join(directory, "functions", "terminal-response.template.js");
export const RESPONSE_FUNCTION_PATH = join(directory, "functions", "terminal-response.js");
/** The three directives that differ between the terminal, chart and report-only policies. */
export const CSP_SLOTS = { "frame-ancestors": "{FA}", "img-src": "{IMG}", "script-src": "{SCRIPT}" };
const PLACEHOLDERS = {
	cspTemplate: "__CSP_TEMPLATE__",
	imgSrc: "__IMG_SRC__",
	strictImgSrc: "__STRICT_IMG_SRC__",
	scriptSrc: "__SCRIPT_SRC__",
	strictScriptSrc: "__STRICT_SCRIPT_SRC__",
	scriptHashesMode: "__SCRIPT_HASHES_MODE__",
	imageSourcesMode: "__IMAGE_SOURCES_MODE__",
	reportUri: "__REPORT_URI__",
};

/** The shared directive list with a slot where each policy fills in its own value. */
export function createCspTemplate(directives = cspDirectives) {
	return serializeContentSecurityPolicy({ ...directives, ...CSP_SLOTS });
}

function embed(value, { slots = false } = {}) {
	if (/["\\$\r\n]/.test(value) || (!slots && /[{}]/.test(value))) {
		throw new Error("Content-Security-Policy values must not contain quotes, backslashes, dollars, braces or line breaks");
	}
	return value;
}

export function renderResponseFunction({
	template,
	cspTemplate,
	imgSrc,
	strictImgSrc,
	scriptSrc,
	strictScriptSrc,
	scriptHashesMode,
	imageSourcesMode = "report-only",
	reportUri = "",
}) {
	for (const [name, mode] of [["scriptHashesMode", scriptHashesMode], ["imageSourcesMode", imageSourcesMode]]) {
		if (!EDGE_CSP_MODES.includes(mode)) throw new Error(`${name} must be one of ${EDGE_CSP_MODES.join(", ")}`);
	}
	const values = { cspTemplate, imgSrc, strictImgSrc, scriptSrc, strictScriptSrc, scriptHashesMode, imageSourcesMode, reportUri };
	let rendered = template.replace(
		"// Generated from terminal-response.template.js by render-functions.mjs; do not edit the rendered\n// file by hand.",
		"// GENERATED FILE: rendered from terminal-response.template.js by render-functions.mjs; do not\n// edit by hand.",
	);
	for (const [key, placeholder] of Object.entries(PLACEHOLDERS)) {
		if (!rendered.includes(placeholder)) throw new Error(`The template has no ${placeholder}`);
		rendered = rendered.replace(placeholder, embed(values[key], { slots: key === "cspTemplate" }));
	}
	if (Object.values(PLACEHOLDERS).some((placeholder) => rendered.includes(placeholder))) {
		throw new Error("Template placeholders were not replaced");
	}
	assertFunctionCodeSize(rendered);
	return rendered;
}

export function renderCurrentResponseFunction() {
	const strict = createStrictCspDirectives();
	const config = readEdgeConfig();
	return renderResponseFunction({
		template: readFileSync(RESPONSE_TEMPLATE_PATH, "utf8"),
		cspTemplate: createCspTemplate(),
		imgSrc: cspDirectives["img-src"],
		strictImgSrc: strict["img-src"],
		scriptSrc: cspDirectives["script-src"],
		strictScriptSrc: strict["script-src"],
		scriptHashesMode: config.cspScriptHashes,
		imageSourcesMode: config.cspImageSources,
		reportUri: config.cspReportUri,
	});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	writeFileSync(RESPONSE_FUNCTION_PATH, renderCurrentResponseFunction());
	console.log(`rendered ${RESPONSE_FUNCTION_PATH}`);
}
