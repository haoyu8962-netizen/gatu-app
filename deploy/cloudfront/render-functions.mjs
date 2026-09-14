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
	contentSecurityPolicyReportOnly,
} from "../../apps/terminal/src/config/security-headers.ts";

export const FUNCTION_CODE_LIMIT_BYTES = 10 * 1024;
const directory = dirname(fileURLToPath(import.meta.url));
export const RESPONSE_TEMPLATE_PATH = join(directory, "functions", "terminal-response.template.js");
export const RESPONSE_FUNCTION_PATH = join(directory, "functions", "terminal-response.js");
export const EDGE_CONFIG_PATH = join(directory, "edge-config.json");

/** Deployment values the rendered function embeds; empty strings switch the related header off. */
export function readEdgeConfig(path = EDGE_CONFIG_PATH) {
	const config = JSON.parse(readFileSync(path, "utf8"));
	const cspReportUri = typeof config.cspReportUri === "string" ? config.cspReportUri.trim() : "";
	if (cspReportUri && !/^https:\/\/[a-z0-9.-]+\/?$/.test(cspReportUri)) {
		throw new Error("edge-config.json cspReportUri must be an https origin");
	}
	return { cspReportUri };
}

export function createReportOnlyPolicy(policy, reportUri) {
	return reportUri ? `${policy}; report-uri ${reportUri}` : "";
}

function embed(value) {
	if (value.includes('"') || value.includes("\\") || /[\r\n]/.test(value)) {
		throw new Error("Content-Security-Policy values must not contain quotes, backslashes or line breaks");
	}
	return value;
}

export function renderResponseFunction({ template, terminalCsp, chartCsp, terminalCspReportOnly = "" }) {
	const rendered = template
		.replace("__TERMINAL_CSP__", embed(terminalCsp))
		.replace("__CHART_CSP__", embed(chartCsp))
		.replace("__TERMINAL_CSP_REPORT_ONLY__", embed(terminalCspReportOnly))
		.replace(
			"// Generated from terminal-response.template.js by render-functions.mjs; do not edit the rendered\n// file by hand.",
			"// GENERATED FILE: rendered from terminal-response.template.js by render-functions.mjs; do not\n// edit by hand.",
		);
	if (rendered.includes("__TERMINAL_CSP__") || rendered.includes("__CHART_CSP__") || rendered.includes("__TERMINAL_CSP_REPORT_ONLY__")) {
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
		terminalCspReportOnly: createReportOnlyPolicy(contentSecurityPolicyReportOnly, readEdgeConfig().cspReportUri),
	});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	writeFileSync(RESPONSE_FUNCTION_PATH, renderCurrentResponseFunction());
	console.log(`rendered ${RESPONSE_FUNCTION_PATH}`);
}
