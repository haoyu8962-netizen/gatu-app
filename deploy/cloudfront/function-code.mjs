// Contract between the committed viewer-response function and a release: the deployment values in
// edge-config.json, the two script hash variables deploy.mjs fills at publish time and reads back from
// the live function, and the CloudFront size limit render-functions.mjs and deploy.mjs both enforce.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FUNCTION_CODE_LIMIT_BYTES = 10 * 1024;
/**
 * Each stricter directive is switched separately: `report-only` keeps it in the report-only policy,
 * `enforce` moves it into the enforced policy as well (which then reports too). The report-only
 * header is omitted once it would repeat the enforced policy.
 */
export const EDGE_CSP_MODES = ["report-only", "enforce"];
export const SCRIPT_HASHES_MODES = EDGE_CSP_MODES;
export const EDGE_CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), "edge-config.json");
const HASH_VARIABLES = { current: "SCRIPT_HASHES_CURRENT", previous: "SCRIPT_HASHES_PREVIOUS" };
const HASH_PATTERN = /^sha256-[A-Za-z0-9+/]{43}=$/;

/** Deployment values the rendered function embeds; an empty report URI switches the report-only header off. */
export function readEdgeConfig(path = EDGE_CONFIG_PATH) {
	const config = JSON.parse(readFileSync(path, "utf8"));
	const cspReportUri = typeof config.cspReportUri === "string" ? config.cspReportUri.trim() : "";
	if (cspReportUri && !/^https:\/\/[a-z0-9.-]+\/?$/.test(cspReportUri)) {
		throw new Error("edge-config.json cspReportUri must be an https origin");
	}
	for (const key of ["cspScriptHashes", "cspImageSources"]) {
		if (!EDGE_CSP_MODES.includes(config[key])) throw new Error(`edge-config.json ${key} must be one of ${EDGE_CSP_MODES.join(", ")}`);
	}
	return { cspReportUri, cspScriptHashes: config.cspScriptHashes, cspImageSources: config.cspImageSources };
}

export function assertFunctionCodeSize(code, label = "Rendered function") {
	const bytes = Buffer.byteLength(code, "utf8");
	if (bytes > FUNCTION_CODE_LIMIT_BYTES) throw new Error(`${label} is ${bytes} bytes; CloudFront Functions allow ${FUNCTION_CODE_LIMIT_BYTES}`);
	return bytes;
}

function variableLine(name) {
	return new RegExp(`^var ${name} = "([^"]*)";$`, "m");
}

export function serializeScriptHashes(hashes) {
	for (const hash of hashes) if (!HASH_PATTERN.test(hash)) throw new Error(`Not a CSP sha256 hash: ${hash}`);
	return hashes.map((hash) => `'${hash}'`).join(" ");
}

/** Whether the code carries the hash lines at all; the function published before this contract does not. */
export function hasScriptHashLines(code) {
	return Object.values(HASH_VARIABLES).every((name) => variableLine(name).test(code));
}

/** The two hash sets a function's code carries. */
export function parseScriptHashes(code) {
	const sets = {};
	for (const [key, name] of Object.entries(HASH_VARIABLES)) {
		const match = variableLine(name).exec(code);
		if (!match) throw new Error(`The function code has no ${name} line`);
		sets[key] = match[1] ? match[1].split(" ").map((token) => token.replace(/^'|'$/g, "")) : [];
	}
	return sets;
}

/** The committed function with this release's sets written into its hash lines. */
export function fillScriptHashes(code, { current, previous }) {
	let filled = code;
	for (const [key, name] of Object.entries(HASH_VARIABLES)) {
		const pattern = variableLine(name);
		if (!pattern.test(filled)) throw new Error(`The function code has no ${name} line`);
		filled = filled.replace(pattern, `var ${name} = "${serializeScriptHashes(key === "current" ? current : previous)}";`);
	}
	assertFunctionCodeSize(filled);
	return filled;
}

/**
 * The build becomes CURRENT and the live CURRENT becomes PREVIOUS, because the edge may serve the
 * previous release's pages for up to a minute after the invalidation. Publishing the same build
 * again keeps the live PREVIOUS instead of dropping it.
 */
export function rotateScriptHashes({ build, live }) {
	const current = [...new Set(build)].sort();
	const liveCurrent = [...new Set(live.current)].sort();
	const sameBuild = current.length === liveCurrent.length && current.every((hash, index) => hash === liveCurrent[index]);
	const previous = (sameBuild ? live.previous : liveCurrent).filter((hash) => !current.includes(hash));
	return { current, previous };
}

/** Hashes of a build the live function does not allow yet; uploading those pages would be an outage under `enforce`. */
export function missingScriptHashes(code, hashes) {
	const live = parseScriptHashes(code);
	const allowed = new Set([...live.current, ...live.previous]);
	return hashes.filter((hash) => !allowed.has(hash));
}
